import "server-only";
import { sql } from "@/lib/db";
import { decryptSecretDetailed, encryptSecret } from "@/lib/crypto";

// Everything the application encrypts with APP_ENCRYPTION_KEY. Rotating the key means: put the new
// key in APP_ENCRYPTION_KEY, keep the old one in APP_ENCRYPTION_KEY_PREVIOUS (so nothing stops
// working), re-encrypt everything with the new key, then remove the old one.
const TARGETS = [
  { table: "app_settings", id: "key", column: "value_encrypted", label: "saved settings" },
  { table: "notification_endpoints", id: "id", column: "encrypted_destination", label: "Discord webhooks" },
  { table: "users", id: "id", column: "mfa_secret_encrypted", label: "two-step sign-in secrets" }
] as const;

export type KeyStatus = {
  previousKeyPresent: boolean;
  groups: Array<{ label: string; total: number; onOldKey: number; unreadable: number }>;
  onOldKey: number;
  unreadable: number;
};

async function scan(target: (typeof TARGETS)[number]) {
  const rows = await sql.unsafe(`SELECT ${target.id} AS id,${target.column} AS value FROM ${target.table} WHERE ${target.column} IS NOT NULL`);
  let onOldKey = 0, unreadable = 0;
  const stale: Array<{ id: string; plaintext: string }> = [];
  for (const row of rows) {
    try {
      const result = decryptSecretDetailed(String(row.value));
      if (result.usedPreviousKey) { onOldKey += 1; stale.push({ id: String(row.id), plaintext: result.plaintext }); }
    } catch { unreadable += 1; }
  }
  return { total: rows.length, onOldKey, unreadable, stale };
}

export async function keyStatus(): Promise<KeyStatus> {
  const groups = [];
  for (const target of TARGETS) {
    const { total, onOldKey, unreadable } = await scan(target);
    groups.push({ label: target.label, total, onOldKey, unreadable });
  }
  return {
    previousKeyPresent: Boolean(process.env.APP_ENCRYPTION_KEY_PREVIOUS),
    groups,
    onOldKey: groups.reduce((n, g) => n + g.onOldKey, 0),
    unreadable: groups.reduce((n, g) => n + g.unreadable, 0)
  };
}

/** Re-encrypts every value still on the previous key with the current one. Safe to run repeatedly. */
export async function reencryptAll(adminId?: string): Promise<{ reencrypted: number; unreadable: number }> {
  let reencrypted = 0, unreadable = 0;
  await sql.begin(async (tx) => {
    for (const target of TARGETS) {
      const rows = await tx.unsafe(`SELECT ${target.id} AS id,${target.column} AS value FROM ${target.table} WHERE ${target.column} IS NOT NULL FOR UPDATE`);
      for (const row of rows) {
        let decrypted;
        try { decrypted = decryptSecretDetailed(String(row.value)); } catch { unreadable += 1; continue; }
        if (!decrypted.usedPreviousKey) continue;
        await tx.unsafe(`UPDATE ${target.table} SET ${target.column}=$2 WHERE ${target.id}=$1`, [row.id, encryptSecret(decrypted.plaintext)]);
        reencrypted += 1;
      }
    }
    await tx.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,'security.keys-reencrypted','settings',NULL,$2::jsonb)",
      [adminId ?? null, JSON.stringify({ reencrypted, unreadable })]
    );
  });
  return { reencrypted, unreadable };
}
