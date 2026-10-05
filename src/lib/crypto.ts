import crypto from "node:crypto";

function key() {
  const raw=process.env.DISCORD_ENCRYPTION_KEY;
  if(!raw) throw new Error("DISCORD_ENCRYPTION_KEY is not configured");
  const decoded=Buffer.from(raw,"base64");
  if(decoded.length!==32) throw new Error("DISCORD_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return decoded;
}
export function encryptSecret(value:string) {
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map((x)=>x.toString("base64url")).join(".");
}
export function decryptSecret(value:string) {
  const [ivRaw,tagRaw,bodyRaw]=value.split(".");
  if(!ivRaw||!tagRaw||!bodyRaw) throw new Error("Invalid encrypted secret");
  const decipher=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(ivRaw,"base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyRaw,"base64url")),decipher.final()]).toString("utf8");
}