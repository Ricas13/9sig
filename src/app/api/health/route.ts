import { sql } from "@/lib/db";

export async function GET(){
  try{
    await sql.unsafe("SELECT 1");
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch{
    return Response.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
