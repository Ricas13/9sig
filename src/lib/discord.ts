import "server-only";

export async function sendDiscord(webhook:string,content:string) {
  const response=await fetch(webhook,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({content,allowed_mentions:{parse:[]}}),
  });
  if(!response.ok) throw new Error(`Discord webhook returned ${response.status}`);
}