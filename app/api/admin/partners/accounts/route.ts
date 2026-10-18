import {getAdminApiUser,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {listPartnerAccountsAdmin} from "@/lib/partner-admin-store";

export const dynamic="force-dynamic";
const numeric=(value:string|null)=>value!==null?Number(value):undefined;

export async function GET(request:Request){
  if(!await getAdminApiUser())return unauthorizedAdminResponse();
  const p=new URL(request.url).searchParams;
  const result=await listPartnerAccountsAdmin({
    q:p.get("q")??"",
    status:p.get("status")??"",
    verified:p.get("verified")??"",
    page:numeric(p.get("page")),
    pageSize:numeric(p.get("pageSize")),
  });
  return Response.json(result,{headers:{"cache-control":"private, no-store"}});
}
