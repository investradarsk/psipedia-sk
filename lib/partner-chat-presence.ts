/** Small expiring private presence hints in R2. Never exposes chat content; no D1 migration. */
import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "./partner-auth-store";
import { PartnerChatError } from "./partner-chat";

type Role="PARTNER"|"ADMIN";
type Input={accountId:string;database?:D1Database;bucket?:R2Bucket;now?:Date};
type PresenceInput=Input&{viewer:Role};
const FRESH_MS=12_000;
function accountId(id:string){
  if(!/^[a-zA-Z0-9-]{8,128}$/.test(id))throw new PartnerChatError("Konverzácia sa nenašla.",404);
  return id;
}
function bucket(input?:R2Bucket){
  const value=input??(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
  if(!value)throw new PartnerChatError("Chat momentálne nie je dostupný.",503);
  return value;
}
async function checkAccount(input:Input,role:Role){
  const database=getPartnerDatabase(input.database);
  const id=accountId(input.accountId);
  const row=await database.prepare("SELECT status FROM partner_accounts WHERE id=?").bind(id).first<{status:string}>();
  if(!row)throw new PartnerChatError("Konverzácia sa nenašla.",404);
  if(role==="PARTNER"&&row.status!=="ACTIVE")throw new PartnerChatError("Účet nie je aktívny.",403);
  return id;
}
function key(id:string,role:Role){return "quarantine/partner-chat-presence/"+id+"/"+role.toLowerCase();}
/** One bounded object per participant; stale state is always treated as not typing. */
export async function setPartnerTyping(input:PresenceInput&{typing:boolean}){
  if(typeof input.typing!=="boolean")throw new PartnerChatError("Neplatný stav písania.");
  const id=await checkAccount(input,input.viewer);
  const store=bucket(input.bucket);
  if(input.typing){
    const iso=(input.now??new Date()).toISOString();
    await store.put(key(id,input.viewer),"typing",{
      httpMetadata:{contentType:"text/plain"},
      customMetadata:{lastTypingAt:iso},
    });
  }else await store.delete(key(id,input.viewer));
  return {success:true};
}
export async function getPartnerTyping(input:PresenceInput){
  const id=await checkAccount(input,input.viewer);
  const other:Role=input.viewer==="PARTNER"?"ADMIN":"PARTNER";
  const item=await bucket(input.bucket).head(key(id,other));
  const timestamp=Date.parse(item?.customMetadata?.lastTypingAt??"");
  const now=(input.now??new Date()).getTime();
  return {typing:Number.isFinite(timestamp)&&timestamp<=now&&now-timestamp<FRESH_MS};
}
