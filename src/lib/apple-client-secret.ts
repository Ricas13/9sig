import "server-only";
import { SignJWT, importPKCS8 } from "jose";

// Apple does not issue a static client secret: it is a short-lived ES256 JWT signed with the
// developer's private key. Apple allows at most six months; we use 150 days, so the process must be
// restarted (a normal deploy does it) at least that often, or AUTH_APPLE_SECRET supplied instead.
export async function createAppleClientSecret(env: { teamId: string; clientId: string; keyId: string; privateKey: string }, now = new Date()) {
  const key = await importPKCS8(env.privateKey.replace(/\\n/g, "\n"), "ES256");
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.keyId })
    .setIssuer(env.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 150 * 86400)
    .setAudience("https://appleid.apple.com")
    .setSubject(env.clientId)
    .sign(key);
}

// The secret is signed once and reused until it is old, so reading settings on every request does
// not mean signing on every request. A change to any input produces a new one.
const cache = new Map<string, { secret: string; at: number }>();
export async function getAppleClientSecret(env: { teamId: string; clientId: string; keyId: string; privateKey: string }, now = new Date()) {
  const signature = [env.teamId, env.clientId, env.keyId, env.privateKey].join("\u0000");
  const hit = cache.get(signature);
  if (hit && now.getTime() - hit.at < 100 * 86_400_000) return hit.secret;
  const secret = await createAppleClientSecret(env, now);
  cache.clear();
  cache.set(signature, { secret, at: now.getTime() });
  return secret;
}
