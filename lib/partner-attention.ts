export const partnerAttentionTypes = ["PARTNER_CLAIM_REVIEW","PARTNER_PROFILE_CHANGE_REVIEW","PARTNER_NEW_PROFILE_REVIEW","PARTNER_EVENT_REVIEW","PARTNER_VERIFICATION_REVIEW","PARTNER_COMMERCIAL_LEAD"] as const;
export type PartnerAttentionType=(typeof partnerAttentionTypes)[number];
export type PartnerPendingSummary={claims:number;profileChanges:number;newProfiles:number;events:number;verifications:number;commercial:number;total:number};
export const emptyPartnerPendingSummary=():PartnerPendingSummary=>({claims:0,profileChanges:0,newProfiles:0,events:0,verifications:0,commercial:0,total:0});
const contracts={
  PARTNER_CLAIM_REVIEW:{key:"partner-claim",href:"/admin/partners/claims"},
  PARTNER_PROFILE_CHANGE_REVIEW:{key:"partner-change",href:"/admin/partners/changes"},
  PARTNER_NEW_PROFILE_REVIEW:{key:"partner-submission",href:"/admin/partners/submissions"},
  PARTNER_EVENT_REVIEW:{key:"partner-event",href:"/admin/podujatia"},
  PARTNER_VERIFICATION_REVIEW:{key:"partner-verification",href:"/admin/partners/verifications"},
  PARTNER_COMMERCIAL_LEAD:{key:"partner-commercial",href:"/admin/partners/commercial"},
} as const;
function safeId(id:string|number){const value=String(id);if(!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error("Neplatné Partner Attention ID.");return value;}
export function partnerAttentionKey(type:PartnerAttentionType,id:string|number){return `${contracts[type].key}:${safeId(id)}`;}
export function partnerAttentionHref(type:PartnerAttentionType,id:string|number){return `${contracts[type].href}/${safeId(id)}`;}
export async function loadPartnerAttentionItems(){return [] as const;}
export async function loadPartnerPendingSummary(database?:D1Database){
  try{
    const {getPartnerDatabase}=await import("./partner-auth-store");
    const db=getPartnerDatabase(database);
    const [claimRow,profileChangeRow,newProfileRow,verificationRow,commercialRow]=await Promise.all([
      db.prepare("SELECT COUNT(*) count FROM partner_claims WHERE status='PENDING'").first<{count:number}>(),
      db.prepare("SELECT COUNT(*) count FROM moderation_submissions s JOIN partner_profile_change_metadata m ON m.submission_id=s.id WHERE s.resource_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION') AND s.submitter_type='PARTNER_ACCOUNT' AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')").first<{count:number}>(),
      db.prepare("SELECT COUNT(*) count FROM moderation_submissions s JOIN partner_new_profile_metadata m ON m.submission_id=s.id WHERE s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')").first<{count:number}>(),
      db.prepare("SELECT COUNT(*) count FROM partner_resource_verifications WHERE status='PENDING_VERIFICATION'").first<{count:number}>(),
      db.prepare("SELECT COUNT(*) count FROM partner_commercial_interests WHERE status='NEW'").first<{count:number}>(),
    ]);
    const claims=Number(claimRow?.count??0);
    const profileChanges=Number(profileChangeRow?.count??0);
    const newProfiles=Number(newProfileRow?.count??0);
    const verifications=Number(verificationRow?.count??0);
    const commercial=Number(commercialRow?.count??0);
    return {...emptyPartnerPendingSummary(),claims,profileChanges,newProfiles,verifications,commercial,total:claims+profileChanges+newProfiles+verifications+commercial};
  }catch{
    return emptyPartnerPendingSummary();
  }
}
