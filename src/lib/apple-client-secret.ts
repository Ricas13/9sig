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
