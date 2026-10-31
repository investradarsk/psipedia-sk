import {env} from "cloudflare:workers";
import {getAdminApiUser,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {readNotionConnectionDiagnostic} from "@/lib/notion-connection-diagnostics";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  const url=new URL(request.url);
  const scope=url.searchParams.get("scope")??"";
  const test=url.searchParams.get("test")==="1";
  const db=(env as unknown as {DB?:D1Database}).DB;
  if(!db)return Response.json({error:"Databáza nie je dostupná."},{status:503});
  try{
    const data=await readNotionConnectionDiagnostic(db,env as unknown as Record<string,unknown>,scope,test);
    return Response.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    return Response.json({error:e instanceof Error&&e.message==="UNKNOWN_SCOPE"?
      "Neznáma kategória.":"Diagnostiku sa nepodarilo načítať."},
      {status:e instanceof Error&&e.message==="UNKNOWN_SCOPE"?400:503,
        headers:{"Cache-Control":"no-store"}});
  }
}
