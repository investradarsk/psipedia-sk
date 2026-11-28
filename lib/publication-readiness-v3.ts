import { env } from "cloudflare:workers";
import { findProfileDuplicate, profileIdentityFromInput, readProfileDuplicateById, readProfileDuplicateIdentities, profileDuplicateReason, type ProfileDuplicateAgenda } from "./profile-duplicate-review.ts";
import { getPartnerLostFoundSubmitIssue } from "./partner-lost-found-intake.ts";

export function publicationV3Enabled(){
 return (env as unknown as {NOTION_PROFILE_AUTHORITY_MODE?:string}).NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
}
const statuses:Record<ProfileDuplicateAgenda,readonly string[]>={
 directory:["published"],breeds:["published"],events:["published"],organizations:["PUBLISHED"],
 adoptions:["ACTIVE","RESERVED","ADOPTED"],"lost-found":["ACTIVE","RESOLVED"],"help-cases":["published"],eshops:["published"],
};
export function enteringPublicStatus(agenda:ProfileDuplicateAgenda,before:unknown,after:unknown){
 return typeof after==="string"&&statuses[agenda].includes(after)&&!(typeof before==="string"&&statuses[agenda].includes(before));
}
/** Preserve existing agenda validation: incomplete optional data is not
 * suddenly mandatory. Only run the extra identity gate on first publication
 * or an explicit transition from a nonpublic status. */
export async function assertProfilePublicationIdentity(db:D1Database,agenda:ProfileDuplicateAgenda,before:unknown,after:unknown,payload:unknown,id?:number){
 if(!publicationV3Enabled()||!enteringPublicStatus(agenda,before,after))return;
 const duplicate=await findProfileDuplicate(db,agenda,{...profileIdentityFromInput(agenda,payload),id},statuses[agenda]);
 if(duplicate)throw Error("Publikovanie zastavené – možná duplicita záznamu #"+duplicate.id+". "+duplicate.reason+".");
}
export async function assertSavedProfilePublicationIdentity(db:D1Database,agenda:ProfileDuplicateAgenda,id:number){
 if(!publicationV3Enabled())return;
 const duplicate=await readProfileDuplicateById(db,agenda,id,statuses[agenda]);
 if(duplicate)throw Error("Publikovanie zastavené – možná duplicita záznamu #"+duplicate.id+". "+duplicate.reason+".");
}
// Partner approval performs a direct status mutation, so verify the saved
// canonical public fields before that mutation. Never read private contacts.
const savedChecks={
 directory:"SELECT name,slug,category FROM directory_profiles WHERE id=?",
 events:"SELECT title AS name,slug,event_type AS category FROM managed_events WHERE id=?",
 organizations:"SELECT name,slug,type AS category FROM help_organizations WHERE id=?",
 adoptions:"SELECT name,slug FROM adoption_dogs WHERE id=?",
 "lost-found":"SELECT slug,type,event_date,region,city,description,last_seen_date_time FROM lost_found_dog_reports WHERE id=?",
 "help-cases":"SELECT title AS name,slug,category,verified,goal_amount FROM help_cases WHERE id=?",
} as const;
type PartnerPublicationAgenda=keyof typeof savedChecks;
export async function assertPartnerPublicationReady(db:D1Database,agenda:PartnerPublicationAgenda,id:number,now=new Date()){
 if(!publicationV3Enabled())return;
 const row=await db.prepare(savedChecks[agenda]).bind(id).first<Record<string,unknown>>();
 if(!row)throw Error("Záznam na publikovanie sa nenašiel.");
 const filled=(v:unknown)=>typeof v==="string"&&v.trim().length>0;
 if(!filled(row.slug)||agenda!=="lost-found"&&!filled(row.name))throw Error("Pred publikovaním doplň názov a adresu záznamu.");
 if(["directory","events","organizations","help-cases"].includes(agenda)&&!filled(row.category))throw Error("Pred publikovaním doplň kategóriu alebo typ.");
 if(agenda==="lost-found"){
  const issue=getPartnerLostFoundSubmitIssue(row,now);if(issue)throw Error(issue.message);
 }
 if(agenda==="help-cases"&&row.category==="zbierky"&&(!row.verified||(row.goal_amount!==null&&Number(row.goal_amount)<=0)))throw Error("Zbierka musí byť pred publikovaním overená a prípadná cieľová suma kladná.");
 await assertSavedProfilePublicationIdentity(db,agenda,id);
}

/** Also compare the requested records against each other, not only against
 * already public records: a single bulk request may include two duplicates. */
export async function assertBulkPublicationIdentities(db:D1Database,agenda:ProfileDuplicateAgenda,ids:readonly number[]){
 if(!publicationV3Enabled()||!ids.length)return;
 const {rows,incomplete}=await readProfileDuplicateIdentities(db,agenda);
 if(incomplete)throw Error("Kontrola duplicít nie je úplná. Hromadné publikovanie zastavené.");
 const targets=new Set(ids);
 const selected=rows.filter(row=>targets.has(row.id));
 if(selected.length!==targets.size)throw Error("Niektorý záznam na publikovanie chýba.");
 for(const row of selected){
  for(const candidate of rows){
   if(!targets.has(candidate.id)&&!statuses[agenda].includes(String(candidate.status)))continue;
   const reason=profileDuplicateReason(agenda,row,candidate);
   if(reason)throw Error("Hromadné publikovanie zastavené – možná duplicita #"+row.id+" a #"+candidate.id+". "+reason+".");
  }
 }
}

/** Existing lifecycle guard table, never a shadow publication state.
 * Run immediately after a whole-selection CAS update in the same D1 batch.
 * If the CAS changes zero rows, no guard may be inserted or cleared. */
export function bulkPublicationGuardStatement(db:D1Database,kind:"directory"|"articles"|"events"|"help"|"breeds"|"organizations"|"adoptions"|"lost-found"|"eshops",ids:readonly number[],publish:boolean,now:string){
 const json=JSON.stringify(ids);
 return publish
  ?db.prepare("DELETE FROM admin_record_publication_guards WHERE kind=? AND record_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?)) AND changes()=?").bind(kind,json,ids.length)
  :db.prepare("INSERT INTO admin_record_publication_guards(kind,record_id,remote_state,error_code,updated_at) SELECT ?,CAST(value AS INTEGER),'PENDING',NULL,? FROM json_each(?) WHERE changes()=? ON CONFLICT(kind,record_id) DO UPDATE SET remote_state='PENDING',error_code=NULL,updated_at=excluded.updated_at").bind(kind,now,json,ids.length);
}
