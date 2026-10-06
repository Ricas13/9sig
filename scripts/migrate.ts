import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const migration = await readFile(join(process.cwd(), "db/migrations/0001_platform_core.sql"), "utf8");
    await sql.unsafe(migration);
    console.log("Database migration complete");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
