import { env } from "cloudflare:workers";
import { findProfileDuplicate, profileIdentityFromInput, type ProfileDuplicateAgenda } from "./profile-duplicate-review.ts";

/** Call only after admin authentication. Staged admission check; no mutation.
 * Same slug constraints in the canonical stores remain authoritative. */
export async function adminProfileDuplicateResponse(agenda:ProfileDuplicateAgenda,payload:unknown){
 const bindings=env as unknown as {DB?:D1Database;NOTION_PROFILE_AUTHORITY_MODE?:string};
 if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text")return null;
 try{
  if(!bindings.DB)throw Error("DUPLICATE_SCAN_UNAVAILABLE");
  const duplicate=await findProfileDuplicate(bindings.DB,agenda,profileIdentityFromInput(agenda,payload));
  return duplicate?Response.json({error:"Možná duplicita: existujúci záznam #"+duplicate.id+". "+duplicate.reason+". Najprv skontrolujte existujúci záznam.",code:"DUPLICATE_PROFILE_REVIEW",candidateId:duplicate.id},{status:409,headers:{"Cache-Control":"no-store"}}):null;
 }catch{
  return Response.json({error:"Kontrolu duplicít sa nepodarilo dokončiť. Záznam nebol vytvorený.",code:"DUPLICATE_SCAN_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
