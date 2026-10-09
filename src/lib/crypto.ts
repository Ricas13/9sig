import "server-only";
import crypto from "node:crypto";

function decodeKey(raw: string | undefined, name: string) {
  if (!raw) throw new Error(`${name} is not configured`);
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error(`${name} must decode to 32 bytes`);
  return decoded;
}

const key = () => decodeKey(process.env.APP_ENCRYPTION_KEY, "APP_ENCRYPTION_KEY");

/** The key being retired during a rotation (see Admin > Settings > Encryption key). Optional. */
function previousKey() {
  const raw = process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  if (!raw) return null;
  try { return decodeKey(raw, "APP_ENCRYPTION_KEY_PREVIOUS"); } catch { return null; }
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptWith(value: string, withKey: Buffer) {
  const data = Buffer.from(value, "base64url");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", withKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Decrypts with the current key, falling back to the previous one while a rotation is in progress. */
export function decryptSecretDetailed(value: string): { plaintext: string; usedPreviousKey: boolean } {
  try {
    return { plaintext: decryptWith(value, key()), usedPreviousKey: false };
  } catch (currentError) {
    const previous = previousKey();
    if (!previous) throw currentError;
    return { plaintext: decryptWith(value, previous), usedPreviousKey: true };
  }
}

export function decryptSecret(value: string) {
  return decryptSecretDetailed(value).plaintext;
}
