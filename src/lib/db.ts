import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const url = process.env.DATABASE_URL ?? "postgres://invalid:invalid@127.0.0.1:1/invalid";
const client = postgres(url, { max: 10, prepare: false, idle_timeout: 20 });

export const db = drizzle(client);
export { client as sql };
