import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const url = process.env.DATABASE_URL ?? "postgres://invalid:invalid@127.0.0.1:1/invalid";
const client = postgres(url, { max: 10, prepare: false, idle_timeout: 20 });

export const db = drizzle(client);

// drizzle's postgres-js adapter swaps the client's timestamp/date serializers for pass-through
// functions. That leaves a JS Date handed to a query parameter unserialised, and the driver then
// throws "The "string" argument must be of type string ... Received an instance of Date" whenever
// a statement also has untyped parameters. Keep drizzle's string-based reads, but make Dates
// serialise to ISO text again so every `sql.unsafe(..., [new Date()])` call site works.
const serializeTemporal = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
for (const oid of [1082, 1083, 1114, 1184]) {
  client.options.serializers[oid] = serializeTemporal;
}
export { client as sql };
