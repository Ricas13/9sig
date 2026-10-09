import "server-only";
import {TELEGRAM_ORIGIN,validTelegramBotToken} from "@/domain/telegram";

/** Fixed provider hostname; do not expose the bot token in error messages or logs. */
export async function telegramCall(method:"getMe"|"setWebhook"|"sendMessage",payload:Record<string,unknown>={}):
  Promise<{ok:boolean;retryAfterSeconds?:number}> {
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!validTelegramBotToken(token))return {ok:false};
  try{
    const response=await fetch(TELEGRAM_ORIGIN+"/bot"+token+"/"+method,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(10_000)
    });
    const data=await response.json().catch(()=>null) as {ok?:boolean;parameters?:{retry_after?:number}}|null;
    const seconds=data?.parameters?.retry_after;
    return {ok:response.ok&&data?.ok===true,retryAfterSeconds:response.status===429&&
      typeof seconds==="number"&&Number.isFinite(seconds)?Math.max(1,Math.min(3600,seconds)):undefined};
  }catch{return {ok:false};}
}
