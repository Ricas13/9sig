import "server-only";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getEmailProvider } from "@/lib/email";
import { loadEntitlements } from "@/lib/entitlement-service";

export async function createDeliveriesForNotification(notificationId: string) {
  const rows=await sql.unsafe("SELECT n.id,n.user_id,n.action_id FROM notifications n WHERE n.id=$1 LIMIT 1",[notificationId]);
  const n=rows[0];if(!n)return;
  const entitlements=await loadEntitlements(String(n.user_id));
  for(const channel of entitlements.notificationChannels){
    if(channel==="IN_APP")continue;
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
    ") SELECT c.id,c.notification_id,c.channel,c.attempt_count,n.title,n.body,n.user_id,u.email"+
    " FROM claimed c JOIN notifications n ON n.id=c.notification_id JOIN users u ON u.id=n.user_id",
    [limit]
  );
  let sent=0;
  for(const d of deliveries){
    let ok=false;
    try{
      if(d.channel==="EMAIL"){
        ok=await getEmailProvider().send({to:String(d.email),subject:String(d.title),text:String(d.body)});
      }else if(d.channel==="DISCORD"){
        const endpoints=await sql.unsafe("SELECT encrypted_destination FROM notification_endpoints WHERE user_id=$1 AND channel='DISCORD' AND enabled=true LIMIT 1",[d.user_id]);
        if(endpoints[0]){
          const response=await fetch(decryptSecret(String(endpoints[0].encrypted_destination)),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:"**"+String(d.title)+"**\n"+String(d.body)})});
          ok=response.ok;
        }
      }
    }catch{ok=false;}
    if(ok){
      await sql.unsafe("UPDATE notification_deliveries SET status='SENT',sent_at=now(),updated_at=now(),last_error_code=NULL WHERE id=$1 AND status='SENDING'",[d.id]);sent+=1;
    }else{
      await sql.unsafe("UPDATE notification_deliveries SET status='PENDING',next_attempt_at=now()+interval '15 minutes',last_error_code='DELIVERY_FAILED',updated_at=now() WHERE id=$1 AND status='SENDING'",[d.id]);
    }
  }
  return sent;
}
