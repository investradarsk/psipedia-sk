import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { readHelpNotionWritebackStatus, type HelpNotionAgenda, type HelpNotionRetryBindings } from "@/lib/notion-help-admin-outbox";

export const dynamic="force-dynamic";
const agendas=new Set<HelpNotionAgenda>(["organizations","adoptions","help-cases","lost-found"]);

export async function GET(request:Request){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const query=new URL(request.url).searchParams;
  const agenda=query.get("agenda") as HelpNotionAgenda | null;
  const raw=query.get("id");
  const id=raw && /^\d+$/.test(raw)?Number(raw):NaN;
  if(!agenda || !agendas.has(agenda) || !Number.isSafeInteger(id) || id<=0)
    return Response.json({error:"Neplatná agenda alebo ID."},{status:400});
  const bindings=env as unknown as HelpNotionRetryBindings & {DB?:D1Database};
  if(!bindings.DB)return Response.json({error:"D1 nie je dostupná."},{status:503});
  try{
    const status=await readHelpNotionWritebackStatus(bindings.DB,bindings,agenda,id);
    return Response.json({status},{headers:{"Cache-Control":"private, no-store"}});
  }catch{
    return Response.json({error:"Stav Notion synchronizácie nie je dostupný."},
      {status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
