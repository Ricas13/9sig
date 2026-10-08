import { z } from "zod";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";

const schema=z.object({anonymousAggregateOptIn:z.boolean()});

export async function PATCH(request:Request){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const input=schema.parse(await request.json());
    await sql.unsafe("UPDATE users SET anonymous_aggregate_opt_in=$1,updated_at=now() WHERE id=$2",[input.anonymousAggregateOptIn,user.id]);
    return Response.json({ok:true});
  }catch(error){const denied=authFailure(error);if(denied)return denied;
    return Response.json({error:"Could not update privacy setting."},{status:500});
  }
}
