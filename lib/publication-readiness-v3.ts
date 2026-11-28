import { env } from "cloudflare:workers";
import { findProfileDuplicate, profileIdentityFromInput, readProfileDuplicateById, type ProfileDuplicateAgenda } from "./profile-duplicate-review.ts";
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
