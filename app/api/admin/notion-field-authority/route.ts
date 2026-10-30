import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { NOTION_AUTHORITY_GROUPS, editableNotionField, validNotionMode } from "@/lib/notion-field-authority";

export const dynamic="force-dynamic";
function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}})}
function database(){return (env as unknown as {DB?:D1Database}).DB}
async function schemaReady(db:D1Database){
  return Boolean(await db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='notion_field_authority' LIMIT 1").first());
}
export async function GET(){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  const db=database();
  if(!db)return response({error:"Databáza nie je dostupná."},503);
  const ready=await schemaReady(db);
  const rules:Record<string,string>={};
  if(ready){
    const rows=await db.prepare("SELECT scope,field_key,mode FROM notion_field_authority ORDER BY scope,field_key LIMIT 500")
      .all<{scope:string;field_key:string;mode:string}>();
    for(const row of rows.results??[])if(editableNotionField(row.scope,row.field_key)&&validNotionMode(row.mode))
      rules[row.scope+":"+row.field_key]=row.mode;
  }
  return response({ready,groups:NOTION_AUTHORITY_GROUPS,rules,
    note:ready?"Pravidlá sú aktívne iba v podporovaných agendách.":"Najprv je potrebné nasadiť D1 migráciu 0147."});
}
export async function PUT(request:Request){
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response||!auth.user)return auth.response??unauthorizedAdminResponse();
  const db=database();
  if(!db)return response({error:"Databáza nie je dostupná."},503);
  if(!(await schemaReady(db)))return response({error:"Najprv aplikuj migráciu D1 0147."},503);
  let value:unknown;
  try{value=await request.json()}catch{return response({error:"Neplatné JSON."},400)}
  if(!value||typeof value!=="object"||Array.isArray(value))return response({error:"Neplatný vstup."},400);
  const {scope,field,mode}=value as Record<string,unknown>;
  if(typeof scope!=="string"||typeof field!=="string"||!editableNotionField(scope,field)||!validNotionMode(mode))
    return response({error:"Pole alebo priorita nie sú povolené."},400);
  if(mode==="safe"){
    await db.prepare("DELETE FROM notion_field_authority WHERE scope=? AND field_key=?").bind(scope,field).run();
  }else{
    await db.prepare("INSERT INTO notion_field_authority(scope,field_key,mode,updated_by) VALUES(?,?,?,?) "+
      "ON CONFLICT(scope,field_key) DO UPDATE SET mode=excluded.mode,updated_at=datetime('now'),updated_by=excluded.updated_by")
      .bind(scope,field,mode,auth.user.email).run();
  }
  return response({ok:true,scope,field,mode});
}
