import crypto from "node:crypto";

// RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30 s step), the format every
// authenticator app understands. Pure functions: storage, replay protection and rate limiting live
// in the caller.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("INVALID_BASE32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

export function currentStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Returns the time step the code matches, or null. Steps at or before `lastUsedStep` are refused so
 * a code that was already accepted (or one observed over a shoulder) cannot be replayed. One step
 * of clock drift either way is tolerated.
 */
export function verifyTotp(secret: string, code: string, now: Date, lastUsedStep = -1): number | null {
  const submitted = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(submitted)) return null;
  const center = currentStep(now);
  for (const step of [center, center - 1, center + 1]) {
    if (step <= lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    const actual = Buffer.from(submitted);
    if (crypto.timingSafeEqual(expected, actual)) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(issuer) + ":" + encodeURIComponent(account);
  return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + encodeURIComponent(issuer) + "&algorithm=SHA1&digits=6&period=" + TOTP_STEP_SECONDS;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(8)).slice(0, 10);
    return raw.slice(0, 5) + "-" + raw.slice(5);
  });
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Z2-7]{5}-?[A-Z2-7]{5}$/i.test(code.trim());
}
