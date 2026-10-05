import postgres from "postgres";

const globalForDb=globalThis as unknown as {sql?:ReturnType<typeof postgres>};

function makeClient() {
  const url=process.env.DATABASE_URL ?? "postgres://invalid:invalid@127.0.0.1:1/invalid";
  return postgres(url,{
    max:5,idle_timeout:20,
    ssl:process.env.NODE_ENV==="production" && process.env.DATABASE_URL ? "require" : false,
    connect_timeout:5,
  });
}
export const sql=globalForDb.sql??makeClient();
if(process.env.NODE_ENV!=="production") globalForDb.sql=sql;
