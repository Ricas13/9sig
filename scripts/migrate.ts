import postgres from "postgres";
import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(
      "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"
    );
    const directory = join(process.cwd(), "db/migrations");
    const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      const migration = await readFile(join(directory, name), "utf8");
      const checksum = crypto.createHash("sha256").update(migration).digest("hex");
      const existing = await sql.unsafe("SELECT checksum FROM schema_migrations WHERE filename=$1 LIMIT 1",[name]);
      if (existing[0]) {
        if (String(existing[0].checksum) !== checksum) throw new Error("Applied migration changed: " + name);
        console.log("Already applied " + name);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(migration);
        await tx.unsafe("INSERT INTO schema_migrations (filename,checksum) VALUES ($1,$2)",[name,checksum]);
      });
      console.log("Applied " + name);
    }
    console.log("Database migrations complete");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
