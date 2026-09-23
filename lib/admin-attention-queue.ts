import { ADOPTION_NOINDEX_STALE_DAYS, ADOPTION_STALE_DAYS } from "./adoption.ts";
import {partnerAttentionHref,partnerAttentionKey} from "./partner-attention.ts";

export const ADMIN_ATTENTION_SOURCE_LIMIT = 50;
export const ADMIN_ATTENTION_QUERY_COUNT = 14;

export const adminAttentionSourceTypes = [
  "MODERATION_SUBMISSION",
  "NEWS_TIP",
  "DIRECTORY_CHANGE_REQUEST",
  "DIRECTORY_INQUIRY",
  "ARTICLE_FEEDBACK",
  "ADOPTION_STALE",
  "AUTOMATION_FINDING",
  "PARTNER_CLAIM_REVIEW",
  "PARTNER_PROFILE_CHANGE_REVIEW",
  "PARTNER_NEW_PROFILE_REVIEW",
  "PARTNER_EVENT_REVIEW",
  "PARTNER_VERIFICATION_REVIEW",
  "PARTNER_COMMERCIAL_LEAD",
  "GEO_LOCATION_ISSUE",
] as const;
export type AdminAttentionSourceType = (typeof adminAttentionSourceTypes)[number];

export const adminAttentionPriorities = ["HIGH", "MEDIUM", "LOW"] as const;
export type AdminAttentionPriority = (typeof adminAttentionPriorities)[number];

export const adminAttentionStates = ["NEW", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
export type AdminAttentionState = (typeof adminAttentionStates)[number];

export const adminAttentionViews = ["active", "history", "all"] as const;
export type AdminAttentionView = (typeof adminAttentionViews)[number];

export type AdminAttentionMetadata = { label: string; value: string };

export type AdminAttentionItem = {
  key: string;
  sourceType: AdminAttentionSourceType;
  sourceId: string;
  title: string;
  reason: string;
  priority: AdminAttentionPriority;
  status: string;
  attentionState: AdminAttentionState;
  createdAt: string;
  relevantAt: string;
  ageDays: number;
  targetHref: string;
  metadata?: AdminAttentionMetadata[];
};

export type AdminAttentionFilters = {
  sourceType?: AdminAttentionSourceType | "all";
  priority?: AdminAttentionPriority | "all";
  view?: AdminAttentionView;
};

export const adminAttentionSourceLabels: Record<AdminAttentionSourceType, string> = {
  MODERATION_SUBMISSION: "Moderácia",
  NEWS_TIP: "Tipy pre redakciu",
  DIRECTORY_CHANGE_REQUEST: "Návrhy úprav",
  DIRECTORY_INQUIRY: "Dopyty",
  ARTICLE_FEEDBACK: "Hodnotenia článkov",
  ADOPTION_STALE: "Adopcie",
  AUTOMATION_FINDING: "Automatický research",
  PARTNER_CLAIM_REVIEW: "Partner claims",
  PARTNER_PROFILE_CHANGE_REVIEW: "Partner úpravy profilov",
  PARTNER_NEW_PROFILE_REVIEW: "Partner nové profily",
  PARTNER_EVENT_REVIEW: "Partner podujatia",
  PARTNER_VERIFICATION_REVIEW: "Partner overenia",
  PARTNER_COMMERCIAL_LEAD: "Partner komerčné leady",
  GEO_LOCATION_ISSUE: "Geo lokality",
};

export const adminAttentionPriorityLabels: Record<AdminAttentionPriority, string> = {
  HIGH: "Vysoká",
  MEDIUM: "Stredná",
  LOW: "Nízka",
};

export const adminAttentionStateLabels: Record<AdminAttentionState, string> = {
  NEW: "Nové",
  IN_PROGRESS: "Rieši sa",
  RESOLVED: "Vyriešené",
  DISMISSED: "Ignorované / zamietnuté",
};

const priorityRank: Record<AdminAttentionPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const DAY_MS = 86_400_000;

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageDays(value: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - timestamp(value)) / DAY_MS));
}

function parseRiskFlagCount(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function isAdminAttentionActive(value: AdminAttentionItem | AdminAttentionState) {
  const state = typeof value === "string" ? value : value.attentionState;
  return state === "NEW" || state === "IN_PROGRESS";
}

const moderationTargets = {
  LOST_FOUND_CASE: { label: "Stratený / nájdený pes", href: "/admin/stratene-najdene" },
  ADOPTION_DOG: { label: "Pes na adopciu", href: "/admin/adopcie" },
} as const;

function moderationAttentionState(status: string): AdminAttentionState {
  if (status === "SUBMITTED") return "NEW";
  if (status === "PENDING_REVIEW" || status === "QUARANTINED") return "IN_PROGRESS";
  if (status === "APPROVED") return "RESOLVED";
  return "DISMISSED";
}

export type ModerationAttentionRow = {
  id: string;
  resourceType: string;
  operation: string;
  status: string;
  riskFlagsJson: string;
  createdAt: string;
  updatedAt: string;
};

export function mapModerationAttention(row: ModerationAttentionRow, now = new Date()): AdminAttentionItem | null {
  const target = moderationTargets[row.resourceType as keyof typeof moderationTargets];
  if (!target) return null;
  const riskFlagCount = parseRiskFlagCount(row.riskFlagsJson);
  const attentionState = moderationAttentionState(row.status);
  const priority: AdminAttentionPriority = row.status === "QUARANTINED" || riskFlagCount > 0 ? "HIGH" : "MEDIUM";
  const reason = row.status === "QUARANTINED"
    ? "Podanie je v karanténe a vyžaduje kontrolu moderátora."
    : riskFlagCount > 0 && isAdminAttentionActive(attentionState)
      ? `Podanie čaká na moderáciu a má ${riskFlagCount} rizikový${riskFlagCount === 1 ? "" : "ch"} flag${riskFlagCount === 1 ? "" : "ov"}.`
      : row.status === "SUBMITTED"
        ? "Nové podanie čaká na zaradenie do moderácie."
        : row.status === "PENDING_REVIEW"
          ? "Podanie je v moderácii a čaká na rozhodnutie."
          : row.status === "APPROVED"
            ? "Podanie bolo schválené."
            : row.status === "REJECTED"
              ? "Podanie bolo zamietnuté."
              : "Podanie bolo stiahnuté.";
  const relevantAt = isAdminAttentionActive(attentionState) ? row.createdAt : row.updatedAt;
  return {
    key: `moderation:${row.id}`,
    sourceType: "MODERATION_SUBMISSION",
    sourceId: row.id,
    title: target.label,
    reason,
    priority,
    status: row.status,
    attentionState,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: target.href,
    metadata: [{ label: "Operácia", value: row.operation }],
  };
}

function newsTipAttentionState(status: string): AdminAttentionState {
  if (status === "new") return "NEW";
  if (status === "reviewing") return "IN_PROGRESS";
  if (status === "used") return "RESOLVED";
  return "DISMISSED";
}

export type NewsTipAttentionRow = {
  id: number;
  title: string;
  topic: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

export function mapNewsTipAttention(row: NewsTipAttentionRow, now = new Date()): AdminAttentionItem {
  const attentionState = newsTipAttentionState(row.status);
  const relevantAt = isAdminAttentionActive(attentionState) ? row.createdAt : row.updatedAt ?? row.createdAt;
  return {
    key: `news-tip:${row.id}`,
    sourceType: "NEWS_TIP",
    sourceId: String(row.id),
    title: row.title,
    reason: attentionState === "NEW"
      ? "Nový redakčný tip čaká na prvé spracovanie."
      : attentionState === "IN_PROGRESS"
        ? "Redakčný tip je v overovaní."
        : attentionState === "RESOLVED"
          ? "Redakčný tip bol spracovaný."
          : "Redakčný tip bol odložený.",
    priority: "MEDIUM",
    status: row.status,
    attentionState,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/tipy#tip-${row.id}`,
    metadata: [{ label: "Téma", value: row.topic }],
  };
}

function directoryChangeAttentionState(status: string): AdminAttentionState {
  if (status === "new") return "NEW";
  if (status === "approved") return "RESOLVED";
  return "DISMISSED";
}

export type DirectoryChangeRequestAttentionRow = {
  id: number;
  profileName: string;
  profileCategory: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

export function mapDirectoryChangeRequestAttention(row: DirectoryChangeRequestAttentionRow, now = new Date()): AdminAttentionItem {
  const attentionState = directoryChangeAttentionState(row.status);
  const relevantAt = isAdminAttentionActive(attentionState) ? row.createdAt : row.updatedAt ?? row.createdAt;
  return {
    key: `directory-change:${row.id}`,
    sourceType: "DIRECTORY_CHANGE_REQUEST",
    sourceId: String(row.id),
    title: `Úprava profilu: ${row.profileName}`,
    reason: attentionState === "NEW"
      ? "Nový návrh zmeny profilu čaká na redakčnú kontrolu."
      : attentionState === "RESOLVED"
        ? "Návrh zmeny profilu bol schválený."
        : "Návrh zmeny profilu bol zamietnutý.",
    priority: "MEDIUM",
    status: row.status,
    attentionState,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/adresar/navrhy#navrh-${row.id}`,
    metadata: [{ label: "Kategória", value: row.profileCategory }],
  };
}

function directoryInquiryAttentionState(status: string): AdminAttentionState {
  if (status === "new") return "NEW";
  if (status === "read") return "IN_PROGRESS";
  return "RESOLVED";
}

export type DirectoryInquiryAttentionRow = {
  id: number;
  profileName: string;
  profileCategory: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
};

export function mapDirectoryInquiryAttention(row: DirectoryInquiryAttentionRow, now = new Date()): AdminAttentionItem {
  const attentionState = directoryInquiryAttentionState(row.status);
  const elapsed = now.getTime() - timestamp(row.createdAt);
  const stale = attentionState === "NEW" && elapsed >= DAY_MS;
  const relevantAt = isAdminAttentionActive(attentionState) ? row.createdAt : row.updatedAt ?? row.createdAt;
  return {
    key: `directory-inquiry:${row.id}`,
    sourceType: "DIRECTORY_INQUIRY",
    sourceId: String(row.id),
    title: `Dopyt pre ${row.profileName}`,
    reason: attentionState === "NEW"
      ? stale
        ? "Nový dopyt je nevybavený viac ako 24 hodín."
        : "Nový dopyt čaká na prvé spracovanie."
      : attentionState === "IN_PROGRESS"
        ? "Dopyt bol prečítaný a ešte nie je vybavený."
        : "Dopyt bol vybavený.",
    priority: stale ? "HIGH" : "MEDIUM",
    status: row.status,
    attentionState,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/dopyty#dopyt-${row.id}`,
    metadata: [{ label: "Kategória", value: row.profileCategory }],
  };
}

function articleFeedbackAttentionState(status: string): AdminAttentionState {
  if (status === "new") return "NEW";
  if (status === "reviewing") return "IN_PROGRESS";
  if (status === "resolved") return "RESOLVED";
  return "DISMISSED";
}

export type ArticleFeedbackAttentionRow = {
  id: number;
  articleTitle: string;
  articlePath: string;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
};

export function mapArticleFeedbackAttention(row: ArticleFeedbackAttentionRow, now = new Date()): AdminAttentionItem {
  const attentionState = articleFeedbackAttentionState(row.status);
  const relevantAt = isAdminAttentionActive(attentionState) ? row.createdAt : row.updatedAt ?? row.createdAt;
  return {
    key: `article-feedback:${row.id}`,
    sourceType: "ARTICLE_FEEDBACK",
    sourceId: String(row.id),
    title: `Spätná väzba: ${row.articleTitle}`,
    reason: attentionState === "NEW"
      ? "Negatívne hodnotenie článku čaká na spracovanie."
      : attentionState === "IN_PROGRESS"
        ? "Spätná väzba je označená ako rozpracovaná."
        : attentionState === "RESOLVED"
          ? "Spätná väzba bola vyriešená."
          : "Spätná väzba bola ignorovaná.",
    priority: "MEDIUM",
    status: row.status,
    attentionState,
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/hodnotenia#hodnotenie-${row.id}`,
    metadata: [{ label: "Článok", value: row.articlePath }],
  };
}



export type PartnerClaimAttentionRow = {
  id:string;
  status:string;
  resourceName:string;
  createdAt:string;
  updatedAt:string;
  conflict:number;
};
function partnerClaimAttentionState(status:string):AdminAttentionState {
  if(status==="PENDING")return "NEW";
  if(status==="CANCELLED")return "DISMISSED";
  return "RESOLVED";
}
export function mapPartnerClaimAttention(row:PartnerClaimAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerClaimAttentionState(row.status);
  const relevantAt=attentionState==="NEW"?row.createdAt:row.updatedAt;
  return {
    key:partnerAttentionKey("PARTNER_CLAIM_REVIEW",row.id),
    sourceType:"PARTNER_CLAIM_REVIEW",
    sourceId:row.id,
    title:`${row.resourceName} žiada o prevzatie profilu`,
    reason:attentionState==="NEW"
      ? (Boolean(row.conflict)?"Claim má ownership konflikt a vyžaduje manuálnu kontrolu.":"Nová žiadosť o prevzatie profilu čaká na kontrolu.")
      : attentionState==="DISMISSED"?"Partner žiadosť zrušil.":"Claim bol spracovaný.",
    priority:Boolean(row.conflict)&&attentionState==="NEW"?"HIGH":"MEDIUM",
    status:row.status,
    attentionState,
    createdAt:row.createdAt,
    relevantAt,
    ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_CLAIM_REVIEW",row.id),
    metadata:Boolean(row.conflict)?[{label:"Riziko",value:"Ownership konflikt"}]:undefined,
  };
}

export type PartnerProfileChangeAttentionRow = {
  id:string;
  status:string;
  resourceName:string;
  resourceType:string;
  changedFieldCount:number;
  riskFlagsJson:string;
  stale:number;
  createdAt:string;
  updatedAt:string;
};

function partnerProfileChangeAttentionState(status:string):AdminAttentionState {
  if(status==="SUBMITTED")return "NEW";
  if(status==="PENDING_REVIEW"||status==="QUARANTINED")return "IN_PROGRESS";
  if(status==="APPROVED")return "RESOLVED";
  return "DISMISSED";
}

export function mapPartnerProfileChangeAttention(row:PartnerProfileChangeAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerProfileChangeAttentionState(row.status);
  const relevantAt=isAdminAttentionActive(attentionState)?row.createdAt:row.updatedAt;
  const riskFlagCount=parseRiskFlagCount(row.riskFlagsJson);
  const stale=Boolean(row.stale);
  return {
    key:partnerAttentionKey("PARTNER_PROFILE_CHANGE_REVIEW",row.id),
    sourceType:"PARTNER_PROFILE_CHANGE_REVIEW",
    sourceId:row.id,
    title:`${row.resourceName} čaká na schválenie úprav`,
    reason:isAdminAttentionActive(attentionState)
      ? `Partner navrhol zmenu ${row.changedFieldCount} polí.`
      : row.status==="APPROVED"?"Úpravy profilu boli schválené."
        : row.status==="REJECTED"?"Návrh úprav bol zamietnutý.":"Partner návrh stiahol.",
    priority:stale?"HIGH":"MEDIUM",
    status:row.status,
    attentionState,
    createdAt:row.createdAt,
    relevantAt,
    ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_PROFILE_CHANGE_REVIEW",row.id),
    metadata:[
      {label:"Typ",value:row.resourceType},
      {label:"Zmenené polia",value:String(row.changedFieldCount)},
      ...(stale?[{label:"Riziko",value:"STALE_BASE"}]:riskFlagCount?[{label:"Risk flags",value:String(riskFlagCount)}]:[]),
    ],
  };
}

export type PartnerNewProfileAttentionRow = {
  id:string;
  status:string;
  displayName:string;
  resourceType:string;
  categoryOrType:string;
  duplicateConfidence:string;
  createdAt:string;
  updatedAt:string;
};

function partnerNewProfileAttentionState(status:string):AdminAttentionState {
  if(status==="SUBMITTED")return "NEW";
  if(status==="PENDING_REVIEW"||status==="QUARANTINED")return "IN_PROGRESS";
  if(status==="APPROVED")return "RESOLVED";
  return "DISMISSED";
}

export function mapPartnerNewProfileAttention(row:PartnerNewProfileAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerNewProfileAttentionState(row.status);
  const relevantAt=isAdminAttentionActive(attentionState)?row.createdAt:row.updatedAt;
  const duplicate=row.duplicateConfidence==="HIGH"||row.duplicateConfidence==="MEDIUM";
  return {
    key:partnerAttentionKey("PARTNER_NEW_PROFILE_REVIEW",row.id),
    sourceType:"PARTNER_NEW_PROFILE_REVIEW",
    sourceId:row.id,
    title:`Nový profil: ${row.displayName} čaká na kontrolu`,
    reason:isAdminAttentionActive(attentionState)
      ? duplicate?"Nájdený možný existujúci profil.":"Partner navrhol vytvorenie nového profilu."
      : row.status==="APPROVED"?"Návrh nového profilu bol schválený."
        : row.status==="REJECTED"?"Návrh nového profilu bol zamietnutý.":"Partner návrh stiahol.",
    priority:row.duplicateConfidence==="HIGH"?"HIGH":"MEDIUM",
    status:row.status,
    attentionState,
    createdAt:row.createdAt,
    relevantAt,
    ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_NEW_PROFILE_REVIEW",row.id),
    metadata:[
      {label:"Typ",value:row.resourceType==="DIRECTORY_PROFILE"?"Služba / Directory":"Organizácia na pomoc psom"},
      {label:"Kategória / typ",value:row.categoryOrType},
      ...(duplicate?[{label:"Duplicate",value:row.duplicateConfidence}]:[]),
    ],
  };
}

export type PartnerEventAttentionRow = {
  id:string;status:string;operation:string;title:string;changedFieldCount:number;duplicateConfidence:string;
  riskFlagsJson:string;stale:number;createdAt:string;updatedAt:string;
};
function partnerEventAttentionState(status:string):AdminAttentionState {
  if(status==="SUBMITTED")return "NEW";
  if(status==="PENDING_REVIEW"||status==="QUARANTINED")return "IN_PROGRESS";
  if(status==="APPROVED")return "RESOLVED";
  return "DISMISSED";
}
export function mapPartnerEventAttention(row:PartnerEventAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerEventAttentionState(row.status);
  const relevantAt=isAdminAttentionActive(attentionState)?row.createdAt:row.updatedAt;
  const high=row.duplicateConfidence==="HIGH"||Boolean(row.stale)||row.status==="QUARANTINED";
  const riskCount=parseRiskFlagCount(row.riskFlagsJson);
  return {
    key:partnerAttentionKey("PARTNER_EVENT_REVIEW",row.id),
    sourceType:"PARTNER_EVENT_REVIEW",
    sourceId:row.id,
    title:`Podujatie: ${row.title} čaká na kontrolu`,
    reason:isAdminAttentionActive(attentionState)
      ? row.operation==="CREATE"?"Partner navrhol nové podujatie.":"Partner navrhol úpravu existujúceho podujatia."
      : row.status==="APPROVED"?"Návrh podujatia bol schválený.":row.status==="REJECTED"?"Návrh podujatia bol zamietnutý.":"Partner návrh stiahol.",
    priority:high?"HIGH":"MEDIUM",
    status:row.status,attentionState,createdAt:row.createdAt,relevantAt,ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_EVENT_REVIEW",row.id),
    metadata:[
      {label:"Operácia",value:row.operation},
      {label:"Zmenené polia",value:String(row.changedFieldCount)},
      ...(row.duplicateConfidence!=="NONE"?[{label:"Duplicate",value:row.duplicateConfidence}]:[]),
      ...(Boolean(row.stale)?[{label:"Riziko",value:"STALE_BASE"}]:riskCount?[{label:"Risk flags",value:String(riskCount)}]:[]),
    ],
  };
}

export type PartnerVerificationAttentionRow = {
  id:string;
  status:string;
  resourceName:string;
  createdAt:string;
  updatedAt:string;
  submittedAt:string|null;
  conflict:number;
};
function partnerVerificationAttentionState(status:string):AdminAttentionState {
  if(status==="PENDING_VERIFICATION")return "NEW";
  if(status==="REJECTED")return "DISMISSED";
  return "RESOLVED";
}
export function mapPartnerVerificationAttention(row:PartnerVerificationAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerVerificationAttentionState(row.status);
  const relevantAt=attentionState==="NEW"?(row.submittedAt??row.createdAt):row.updatedAt;
  return {
    key:partnerAttentionKey("PARTNER_VERIFICATION_REVIEW",row.id),
    sourceType:"PARTNER_VERIFICATION_REVIEW",
    sourceId:row.id,
    title:`${row.resourceName} čaká na overenie správcu`,
    reason:attentionState==="NEW"
      ? (Boolean(row.conflict)?"Overenie má ownership konflikt a vyžaduje zvýšenú kontrolu.":"Žiadosť o overenie správcu čaká na kontrolu.")
      : attentionState==="DISMISSED"?"Overenie bolo zamietnuté.":"Správca bol overený.",
    priority:Boolean(row.conflict)&&attentionState==="NEW"?"HIGH":"MEDIUM",
    status:row.status,
    attentionState,
    createdAt:row.createdAt,
    relevantAt,
    ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_VERIFICATION_REVIEW",row.id),
    metadata:Boolean(row.conflict)?[{label:"Riziko",value:"Ownership konflikt"}]:undefined,
  };
}

export type PartnerCommercialAttentionRow = {
  id:string;
  interestType:string;
  status:string;
  resourceName:string|null;
  createdAt:string;
  updatedAt:string;
};

function partnerCommercialAttentionState(status:string):AdminAttentionState {
  if(status==="NEW")return "NEW";
  if(status==="NOT_NOW")return "DISMISSED";
  return "RESOLVED";
}

const partnerCommercialTitles:Record<string,string>={
  PREMIUM_PROFILE:"Premium profil",
  PROMOTED_PROFILE:"propagovaný profil",
  AD_CAMPAIGN:"reklamnú kampaň",
  OTHER:"komerčnú spoluprácu",
};

export function mapPartnerCommercialAttention(row:PartnerCommercialAttentionRow,now=new Date()):AdminAttentionItem {
  const attentionState=partnerCommercialAttentionState(row.status);
  const relevantAt=attentionState==="NEW"?row.createdAt:row.updatedAt;
  const subject=partnerCommercialTitles[row.interestType]??"komerčnú spoluprácu";
  return {
    key:partnerAttentionKey("PARTNER_COMMERCIAL_LEAD",row.id),
    sourceType:"PARTNER_COMMERCIAL_LEAD",
    sourceId:row.id,
    title:`Záujem o ${subject}${row.resourceName?` — ${row.resourceName}`:""}`,
    reason:attentionState==="NEW"?"Nový nezáväzný Partner záujem čaká na prvé spracovanie.":attentionState==="DISMISSED"?"Partner záujem bol odložený na neskôr.":"Partner záujem bol spracovaný.",
    priority:"LOW",
    status:row.status,
    attentionState,
    createdAt:row.createdAt,
    relevantAt,
    ageDays:ageDays(relevantAt,now),
    targetHref:partnerAttentionHref("PARTNER_COMMERCIAL_LEAD",row.id),
    metadata:[{label:"Typ",value:row.interestType}],
  };
}

export type AutomationFindingAttentionRow = {
  id: number;
  entityType: string;
  findingType: string;
  priority: string;
  reviewStatus: string;
  sourceLabel: string;
  sourceUrl: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

function automationFindingAttentionState(status: string): AdminAttentionState {
  if (status === "NEW") return "NEW";
  if (status === "IN_REVIEW") return "IN_PROGRESS";
  if (status === "APPROVED" || status === "RESOLVED") return "RESOLVED";
  return "DISMISSED";
}

export function mapAutomationFindingAttention(
  row: AutomationFindingAttentionRow,
  now = new Date(),
): AdminAttentionItem {
  const attentionState = automationFindingAttentionState(row.reviewStatus);
  const relevantAt = isAdminAttentionActive(attentionState) ? row.firstDetectedAt : row.lastDetectedAt;
  const priority = isAdminAttentionPriority(row.priority) ? row.priority : "MEDIUM";
  return {
    key: `automation-finding:${row.id}`,
    sourceType: "AUTOMATION_FINDING",
    sourceId: String(row.id),
    title: `${row.entityType}: ${row.findingType}`,
    reason: row.findingType === "SOURCE_ERROR"
      ? "Automatická kontrola zdroja zlyhala a vyžaduje pozornosť."
      : "Automatický research našiel návrh alebo zmenu. Canonical záznam nebol automaticky prepísaný ani publikovaný.",
    priority,
    status: row.reviewStatus,
    attentionState,
    createdAt: row.firstDetectedAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/operations/automation/${row.id}`,
    metadata: [
      { label: "Zdroj", value: row.sourceLabel },
      ...(row.sourceUrl ? [{ label: "URL", value: row.sourceUrl }] : []),
    ],
  };
}

export type GeoLocationAttentionRow = {
  id: number;
  targetType: string;
  targetId: number;
  organizationId: number | null;
  label: string;
  category: string | null;
  locationRole: string | null;
  publicVisibility: string | null;
  status: string;
  errorCode: string | null;
  manualOverride: number;
  createdAt: string;
  updatedAt: string;
};

const GEO_SENSITIVE_DIRECTORY_CATEGORIES = new Set([
  "chovatelske-stanice",
  "chovatelske-kluby",
  "treneri",
  "vencenie",
  "kynologicke-kluby",
]);

function geoAttentionPriority(row: GeoLocationAttentionRow): AdminAttentionPriority {
  const sensitive = row.targetType === "DIRECTORY_PROFILE" && GEO_SENSITIVE_DIRECTORY_CATEGORIES.has(row.category ?? "");
  const sensitiveRole = row.targetType === "ORGANIZATION_LOCATION" && (row.locationRole === "LEGAL_SEAT" || row.locationRole === "UNSPECIFIED");
  if (row.errorCode === "CONFLICTING_PUBLIC_PRIVATE_LOCATION") return "HIGH";
  if (row.errorCode === "PRIVACY_CLASSIFICATION_MISSING" && (sensitive || sensitiveRole)) return "HIGH";
  if (row.publicVisibility === "EXACT_PUBLIC" && row.status === "STALE" && (sensitive || sensitiveRole)) return "HIGH";
  if (row.errorCode === "PROVIDER_ERROR" || row.errorCode === "RATE_LIMITED") return "LOW";
  return "MEDIUM";
}

function geoAttentionHref(row: GeoLocationAttentionRow) {
  if (row.targetType === "DIRECTORY_PROFILE") return `/admin/adresar/${row.targetId}#geo`;
  if (row.targetType === "MANAGED_EVENT") return `/admin/podujatia/${row.targetId}#geo`;
  if (row.targetType === "ORGANIZATION_LOCATION" && row.organizationId) return `/admin/organizacie/${row.organizationId}#locations`;
  return "/admin/operations/geo";
}

function geoAttentionReason(row: GeoLocationAttentionRow) {
  const code = row.errorCode ?? row.status;
  const reasons: Record<string, string> = {
    PRIVACY_CLASSIFICATION_MISSING: "Lokalita nemá bezpečne potvrdenú verejnú privacy klasifikáciu.",
    CONFLICTING_PUBLIC_PRIVATE_LOCATION: "Verejná a súkromná interpretácia lokality sú v konflikte.",
    AMBIGUOUS: "Geocoder našiel viac než jednu bezpečne použiteľnú lokalitu.",
    NO_MATCH: "Geocoder nenašiel zodpovedajúcu lokalitu.",
    STALE: "Canonical location source sa zmenil a uložený geo bod treba znovu overiť.",
    SOURCE_INCOMPLETE: "Canonical location source nemá dostatok údajov na bezpečné geokódovanie.",
    CONFLICTING_GEO: "Geo údaje sú v konflikte a vyžadujú manuálne rozhodnutie.",
    MANUAL_REVIEW: "Manual marker zostal zachovaný po zmene source lokality a vyžaduje potvrdenie.",
    PROVIDER_ERROR: "Provider zlyhal aj po povolených retry pokusoch.",
    RATE_LIMITED: "Provider zostal nedostupný po vyčerpaní retry okna.",
    LOW_CONFIDENCE: "Výsledok geocodingu nemá dostatočnú istotu na automatické použitie.",
  };
  return reasons[code] ?? "Geo lokalita vyžaduje administrátorskú kontrolu.";
}

export function mapGeoLocationAttention(row: GeoLocationAttentionRow, now = new Date()): AdminAttentionItem {
  const relevantAt = row.updatedAt || row.createdAt;
  return {
    key: `geo-location:${row.id}`,
    sourceType: "GEO_LOCATION_ISSUE",
    sourceId: String(row.id),
    title: `Poloha: ${row.label || `#${row.targetId}`}`,
    reason: geoAttentionReason(row),
    priority: geoAttentionPriority(row),
    status: row.status,
    attentionState: row.status === "PENDING" ? "NEW" : "IN_PROGRESS",
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: geoAttentionHref(row),
    metadata: [
      { label: "Target", value: row.targetType },
      ...(row.errorCode ? [{ label: "Dôvod", value: row.errorCode }] : []),
      ...(row.manualOverride ? [{ label: "Marker", value: "Manual override" }] : []),
    ],
  };
}

export type AdoptionStaleAttentionRow = {
  id: number;
  name: string;
  status: string;
  lastVerifiedAt: string | null;
  createdAt: string;
};

export function mapAdoptionStaleAttention(row: AdoptionStaleAttentionRow, now = new Date()): AdminAttentionItem {
  const relevantAt = row.lastVerifiedAt ?? row.createdAt;
  const daysSinceVerification = row.lastVerifiedAt ? ageDays(row.lastVerifiedAt, now) : null;
  const markedlyStale = row.lastVerifiedAt === null || (daysSinceVerification ?? 0) >= ADOPTION_NOINDEX_STALE_DAYS;
  const reason = row.lastVerifiedAt === null
    ? "Aktívna adopcia ešte nemá dátum posledného overenia."
    : markedlyStale
      ? `Aktívna adopcia nebola overená aspoň ${ADOPTION_NOINDEX_STALE_DAYS} dní.`
      : `Aktívna adopcia nebola overená aspoň ${ADOPTION_STALE_DAYS} dní.`;
  return {
    key: `adoption-stale:${row.id}`,
    sourceType: "ADOPTION_STALE",
    sourceId: String(row.id),
    title: row.name,
    reason,
    priority: markedlyStale ? "HIGH" : "MEDIUM",
    status: row.status,
    attentionState: "IN_PROGRESS",
    createdAt: row.createdAt,
    relevantAt,
    ageDays: ageDays(relevantAt, now),
    targetHref: `/admin/adopcie/${row.id}`,
  };
}

export function sortAdminAttentionItems(items: AdminAttentionItem[]) {
  return [...items].sort((a, b) => {
    const aActive = isAdminAttentionActive(a);
    const bActive = isAdminAttentionActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive) {
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority !== 0) return priority;
      const relevant = timestamp(a.relevantAt) - timestamp(b.relevantAt);
      if (relevant !== 0) return relevant;
    } else {
      const relevant = timestamp(b.relevantAt) - timestamp(a.relevantAt);
      if (relevant !== 0) return relevant;
    }
    return a.key.localeCompare(b.key, "sk");
  });
}

export function filterAdminAttentionItems(items: AdminAttentionItem[], filters: AdminAttentionFilters) {
  const view = filters.view ?? "active";
  return items.filter((item) => {
    const active = isAdminAttentionActive(item);
    const matchesView = view === "all" || (view === "active" ? active : !active);
    return matchesView
      && (!filters.sourceType || filters.sourceType === "all" || item.sourceType === filters.sourceType)
      && (!filters.priority || filters.priority === "all" || item.priority === filters.priority);
  });
}

export function summarizeAdminAttention(items: AdminAttentionItem[]) {
  const byPriority: Record<AdminAttentionPriority, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const bySource = Object.fromEntries(adminAttentionSourceTypes.map((source) => [source, 0])) as Record<AdminAttentionSourceType, number>;
  const byState: Record<AdminAttentionState, number> = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, DISMISSED: 0 };
  let active = 0;
  for (const item of items) {
    byPriority[item.priority] += 1;
    bySource[item.sourceType] += 1;
    byState[item.attentionState] += 1;
    if (isAdminAttentionActive(item)) active += 1;
  }
  return { total: items.length, active, history: items.length - active, byPriority, bySource, byState };
}

export function isAdminAttentionSourceType(value: string): value is AdminAttentionSourceType {
  return (adminAttentionSourceTypes as readonly string[]).includes(value);
}

export function isAdminAttentionPriority(value: string): value is AdminAttentionPriority {
  return (adminAttentionPriorities as readonly string[]).includes(value);
}

export function isAdminAttentionView(value: string): value is AdminAttentionView {
  return (adminAttentionViews as readonly string[]).includes(value);
}
