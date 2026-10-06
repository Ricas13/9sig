import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const directory = join(process.cwd(), "db/migrations");
    const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      const migration = await readFile(join(directory, name), "utf8");
      await sql.unsafe(migration);
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
