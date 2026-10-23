export type AutomationActor = "AUTOMATION" | "SYSTEM" | "ADMIN" | "PARTNER" | "PUBLIC";
export type AutomationRunStatus = "STARTED" | "SUCCESS" | "NO_CHANGE" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";
export const ADMIN_PUSH_EVENT_SETTINGS = [
  {key:"GEMINI_PROFILE",label:"Gemini – nový profil alebo podujatie",group:"Gemini",defaultEnabled:true},
  {key:"GEMINI_FAILURE",label:"Gemini – zlyhanie",group:"Gemini",defaultEnabled:false},
  {key:"GEMINI_ACTIVITY",label:"Gemini – spustenie alebo bez nových výsledkov",group:"Gemini",defaultEnabled:false},
  {key:"PROFILE_REVIEW",label:"Nové hodnotenie profilu",group:"Komunita a partneri",defaultEnabled:true},
  {key:"PARTNER_REGISTRATION",label:"Registrácia partnerského účtu",group:"Komunita a partneri",defaultEnabled:true},
  {key:"PARTNER_REQUEST",label:"Žiadosť o správu profilu alebo nový partner návrh",group:"Komunita a partneri",defaultEnabled:true},
  {key:"PROFILE_PROPOSAL",label:"Návrh zmeny profilu alebo podujatia",group:"Komunita a partneri",defaultEnabled:true},
  {key:"COMMUNITY_TIP",label:"Redakčný tip, dopyt alebo pripomienka",group:"Komunita a partneri",defaultEnabled:true},
  {key:"ADOPTION_REQUEST",label:"Žiadosť o adopciu alebo pomoc",group:"Komunita a partneri",defaultEnabled:true},
  {key:"FACEBOOK_IMPORTED",label:"Nový Facebook obrázok importovaný z Notionu",group:"Facebook",defaultEnabled:true},
  {key:"FACEBOOK_PUBLISHED",label:"Facebook obrázok úspešne publikovaný",group:"Facebook",defaultEnabled:true},
  {key:"FACEBOOK_FAILED",label:"Facebook publikovanie zlyhalo",group:"Facebook",defaultEnabled:false},
  {key:"QUALITY_FOUND",label:"Tavily – nové chýbajúce údaje",group:"Kvalita údajov",defaultEnabled:false},
  {key:"SYSTEM_FAILURE",label:"Chyby ostatných automatizácií",group:"Prevádzka",defaultEnabled:false},
  {key:"SYSTEM_ACTIVITY",label:"Spustenia, výsledky a synchronizácie",group:"Prevádzka",defaultEnabled:false},
] as const;

export type AdminPushEventKey = typeof ADMIN_PUSH_EVENT_SETTINGS[number]["key"];
export const ADMIN_PUSH_EVENT_KEYS: AdminPushEventKey[] = ADMIN_PUSH_EVENT_SETTINGS.map(setting=>setting.key);
export type AdminPushCategory = "RUN_STARTED" | "RUN_RESULTS" | "ERRORS" | "PUBLISH" | "IMPORT_SYNC" | AdminPushEventKey;
export const LEGACY_ADMIN_PUSH_CATEGORIES = ["RUN_STARTED","RUN_RESULTS","ERRORS","PUBLISH","IMPORT_SYNC"] as const;
export const ADMIN_PUSH_CATEGORIES: AdminPushCategory[] = [...LEGACY_ADMIN_PUSH_CATEGORIES, ...ADMIN_PUSH_EVENT_KEYS];
export const DEFAULT_ADMIN_PUSH_EVENT_KEYS = ADMIN_PUSH_EVENT_SETTINGS.filter(x=>x.defaultEnabled).map(x=>x.key);

/** Exact event routing: unclassified events must never silently ping a phone. */
export function adminPushEventKey(eventType:string, sourceType = "", system = ""): AdminPushEventKey | null {
  if(eventType==="admin_push_test")return null;
  if(eventType==="gemini_profile_created" || eventType==="gemini_event_created" || eventType==="automation_draft_created")
    return "GEMINI_PROFILE";
  if(eventType==="gemini_run_failed")return "GEMINI_FAILURE";
  if(eventType.startsWith("gemini_run_"))return "GEMINI_ACTIVITY";
  if(eventType==="partner_account_registered")return "PARTNER_REGISTRATION";
  if(eventType==="profile_review_submitted" || sourceType==="PROFILE_REVIEW_MODERATION")return "PROFILE_REVIEW";
  if(eventType==="partner_claim_submitted" || sourceType==="PARTNER_CLAIM_REVIEW")return "PARTNER_REQUEST";
  if(eventType==="directory_profile_change_submitted" || eventType==="moderation_submission_actionable"
    || eventType==="partner_profile_proposed")return "PROFILE_PROPOSAL";
  if(["news_tip_submitted","negative_article_feedback_submitted","directory_inquiry_submitted"].includes(eventType))
    return "COMMUNITY_TIP";
  if(eventType==="adoption_inquiry_submitted" || sourceType==="ADOPTION_REQUEST")return "ADOPTION_REQUEST";
  if(eventType==="facebook_image_imported")return "FACEBOOK_IMPORTED";
  if(eventType==="facebook_image_published")return "FACEBOOK_PUBLISHED";
  if(eventType==="facebook_image_failed")return "FACEBOOK_FAILED";
  if(eventType==="quality_missing_found")return "QUALITY_FOUND";
  if(eventType==="automation_run_failed" || eventType==="automation_run_partial_success"
    || eventType==="automation_source_issue")
    return system==="gemini"?"GEMINI_FAILURE":"SYSTEM_FAILURE";
  if(eventType.startsWith("automation_run_") || eventType.startsWith("automation_sync_")
    || eventType.startsWith("automation_import_") || eventType.startsWith("automation_article_"))
    return "SYSTEM_ACTIVITY";
  return null;
}

export function isAdminPushEventAllowed(categories:readonly AdminPushCategory[],eventType:string,
  sourceType="",system=""):boolean{
  if(eventType==="admin_push_test")return true;
  const key=adminPushEventKey(eventType,sourceType,system);
  return key!==null && categories.includes(key);
}

/** Kept for compatibility with older automation reporting views. */
export function adminPushCategoryForEvent(eventType: string, system?: string): AdminPushCategory | null {
  if (eventType === "automation_run_started") return "RUN_STARTED";
  if (eventType === "automation_run_failed" || eventType === "automation_run_partial_success" || eventType === "automation_source_issue") return "ERRORS";
  if (eventType.startsWith("automation_run_") && system === "notion") return "IMPORT_SYNC";
  if (eventType.startsWith("automation_run_")) return "RUN_RESULTS";
  if (eventType === "automation_article_published" || eventType === "automation_article_draft") return "PUBLISH";
  if (eventType.startsWith("automation_import_") || eventType.startsWith("automation_sync_")) return "IMPORT_SYNC";
  return null;
}

export function parsePushCategories(value: unknown): AdminPushCategory[] {
  if (!Array.isArray(value)) throw new Error("Očakáva sa zoznam kategórií.");
  if (value.some((key) => typeof key !== "string" || !ADMIN_PUSH_CATEGORIES.includes(key as AdminPushCategory))) {
    throw new Error("Neznáma kategória upozornení.");
  }
  return [...new Set(value as AdminPushCategory[])];
}
export function parseStoredPushCategories(raw: string | null | undefined): AdminPushCategory[] {
  try{
    const saved=parsePushCategories(JSON.parse(raw??""));
    // Historic subscriptions stored only five broad categories. Upgrade defaults in
    // memory until the owner saves an explicit per-event preference.
    if(!saved.some(key=>ADMIN_PUSH_EVENT_KEYS.includes(key as AdminPushEventKey)))
      return [...saved,...DEFAULT_ADMIN_PUSH_EVENT_KEYS];
    return saved;
  }catch{return [...LEGACY_ADMIN_PUSH_CATEGORIES,...DEFAULT_ADMIN_PUSH_EVENT_KEYS];}
}

export function isAutomaticPushActor(actor: AutomationActor, scheduled: boolean): boolean {
  return actor === "AUTOMATION" && scheduled;
}

export function completedAutomationRunStatus(input: {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  created?: number;
  updated?: number;
  changed?: number;
  draftCreated?: number;
}): AutomationRunStatus {
  if (input.status === "FAILED") return "FAILED";
  if (input.status === "PARTIAL") return "PARTIAL_SUCCESS";
  const changes = [input.created, input.updated, input.changed, input.draftCreated];
  // Undefined counts must never be silently interpreted as zero.
  return changes.some((count) => typeof count === "number")
    && changes.every((count) => count === undefined || count === 0)
    ? "NO_CHANGE"
    : "SUCCESS";
}

