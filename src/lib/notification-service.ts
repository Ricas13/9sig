import "server-only";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getEmailProvider } from "@/lib/email";
import { loadEntitlements } from "@/lib/entitlement-service";
import { DELIVERY_MAX_ATTEMPTS,retryDelaySeconds } from "@/domain/delivery-retry";

export async function createDeliveriesForNotification(notificationId: string) {
  const rows=await sql.unsafe("SELECT n.id,n.user_id,n.action_id FROM notifications n WHERE n.id=$1 LIMIT 1",[notificationId]);
  const n=rows[0];if(!n)return;
  const entitlements=await loadEntitlements(String(n.user_id));
  // A plan entitles a channel; delivery also needs somewhere to send it. Queueing Discord for a
  // user who never connected a webhook would only retry to exhaustion and dead-letter.
  const endpoints=await sql.unsafe("SELECT channel FROM notification_endpoints WHERE user_id=$1 AND enabled=true",[n.user_id]);
  const connected=new Set(endpoints.map((row)=>String(row.channel)));
  for(const channel of entitlements.notificationChannels){
    if(channel==="IN_APP")continue;
    if(channel==="DISCORD"&&!connected.has("DISCORD"))continue;
    const dedupe=String(notificationId)+":"+channel;
    await sql.unsafe("INSERT INTO notification_deliveries (notification_id,channel,dedupe_key) VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING",[notificationId,channel,dedupe]);
  }
}

export async function processPendingDeliveries(limit=50){
  const deliveries=await sql.unsafe(
    "WITH picked AS ("+
    " SELECT id FROM notification_deliveries"+
    " WHERE (status='PENDING' OR (status='SENDING' AND next_attempt_at<=now())) AND next_attempt_at<=now()"+
    " ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1"+
    "), claimed AS ("+
    " UPDATE notification_deliveries d SET status='SENDING',attempt_count=d.attempt_count+1,next_attempt_at=now()+interval '10 minutes',updated_at=now()"+
    " FROM picked p WHERE d.id=p.id RETURNING d.*"+
    ") SELECT c.id,c.notification_id,c.channel,c.attempt_count,n.title,n.body,n.user_id,n.action_id,u.email,a.status AS action_status,"+
    " CASE WHEN n.action_id IS NULL THEN true ELSE n.id=("+
    "   SELECT newer.id FROM notifications newer WHERE newer.action_id=n.action_id ORDER BY newer.created_at DESC,newer.id DESC LIMIT 1"+
    " ) END AS latest_action_notification"+
    " FROM claimed c JOIN notifications n ON n.id=c.notification_id JOIN users u ON u.id=n.user_id LEFT JOIN actions a ON a.id=n.action_id",
    [limit]
  );
  let sent=0;
  const entitlementCache=new Map<string,Set<string>>();
  for(const d of deliveries){
    if(d.action_id&&!Boolean(d.latest_action_notification)){
      await sql.unsafe(
        "UPDATE notification_deliveries SET status='CANCELLED',last_error_code='SUPERSEDED_ACTION_NOTIFICATION',updated_at=now() WHERE id=$1 AND status='SENDING'",
        [d.id]
      );
      continue;
    }
    if(d.action_id&&!["CALCULATED","NOTIFIED","ACKNOWLEDGED"].includes(String(d.action_status??""))){
      await sql.unsafe(
        "UPDATE notification_deliveries SET status='CANCELLED',last_error_code='ACTION_NO_LONGER_ACTIVE',updated_at=now() WHERE id=$1 AND status='SENDING'",
        [d.id]
      );
      continue;
    }
    const userId=String(d.user_id);
    let channels=entitlementCache.get(userId);
    if(!channels){
      channels=(await loadEntitlements(userId)).notificationChannels;
      entitlementCache.set(userId,channels);
    }
    if(!channels.has(String(d.channel))){
      await sql.unsafe(
        "UPDATE notification_deliveries SET status='CANCELLED',last_error_code='CHANNEL_NOT_IN_PLAN',updated_at=now() WHERE id=$1 AND status='SENDING'",
        [d.id]
      );
      continue;
    }

    let ok=false;
    let retryAfterSeconds:number|null=null;
    try{
      if(d.channel==="EMAIL"){
        ok=await getEmailProvider().send({to:String(d.email),subject:String(d.title),text:String(d.body)});
      }else if(d.channel==="DISCORD"){
        const endpoints=await sql.unsafe("SELECT encrypted_destination FROM notification_endpoints WHERE user_id=$1 AND channel='DISCORD' AND enabled=true LIMIT 1",[d.user_id]);
        if(!endpoints[0]){
          // The webhook was removed or disabled after this was queued: nothing to retry.
          await sql.unsafe(
            "UPDATE notification_deliveries SET status='CANCELLED',last_error_code='NO_ENDPOINT',updated_at=now() WHERE id=$1 AND status='SENDING'",
            [d.id]
          );
          continue;
        }
        {
          // allowed_mentions stops message text from ever pinging @everyone/@here or roles.
          const response=await fetch(decryptSecret(String(endpoints[0].encrypted_destination)),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:"**"+String(d.title)+"**\n"+String(d.body),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10_000),cache:"no-store"});
          ok=response.ok;
          if(response.status===429){
            const raw=response.headers.get("retry-after");
            if(raw){
              const seconds=Number(raw);
              const date=Date.parse(raw);
              retryAfterSeconds=Number.isFinite(seconds)?seconds:Number.isFinite(date)
                ?Math.ceil((date-Date.now())/1000):null;
            }
          }
        }
      }
    }catch{ok=false;}
    if(ok){
      await sql.unsafe("UPDATE notification_deliveries SET status='SENT',sent_at=now(),updated_at=now(),last_error_code=NULL WHERE id=$1 AND status='SENDING'",[d.id]);sent+=1;
    }else{
      if(Number(d.attempt_count)>=DELIVERY_MAX_ATTEMPTS){
        await sql.unsafe(
          "UPDATE notification_deliveries SET status='DEAD_LETTER',last_error_code='MAX_ATTEMPTS_REACHED',updated_at=now() "+
          "WHERE id=$1 AND status='SENDING'",[d.id]
        );
      }else{
        const delay=retryDelaySeconds(Number(d.attempt_count),String(d.id),retryAfterSeconds);
        await sql.unsafe(
          "UPDATE notification_deliveries SET status='PENDING',next_attempt_at=now()+($2::int*interval '1 second'),"+
          "last_error_code='DELIVERY_FAILED',updated_at=now() WHERE id=$1 AND status='SENDING'",
          [d.id,delay]
        );
      }
    }
  }
  return sent;
}
