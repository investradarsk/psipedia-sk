import {getPartnerDatabase} from "./partner-auth-store";
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
  let commercial=0;
  try{const row=await getPartnerDatabase(database).prepare("SELECT COUNT(*) count FROM partner_commercial_interests WHERE status='NEW'").first<{count:number}>();commercial=Number(row?.count??0);}catch{commercial=0;}
  return {...emptyPartnerPendingSummary(),commercial,total:commercial};
}
