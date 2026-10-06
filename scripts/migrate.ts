import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url, { max: 1, prepare: false });
const migration = await readFile(join(process.cwd(), "db/migrations/0001_platform_core.sql"), "utf8");
await sql.unsafe(migration);
await sql.end();
console.log("Database migration complete");
