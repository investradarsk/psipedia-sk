import type { NotionOverviewRow } from "./notion-sync-overview.ts";

/**
 * Read-only configuration/schema preflight from the *deployed* Worker bindings
 * and the existing D1 mapping tables. No secrets, provider requests or writes.
 * CONFIGURED never means that the Notion API is reachable or data is in sync.
 */
export type NotionPreflightKey = "directory" | "breeds" | "articles" | "eshops" | "events-help" | "service-catalog" | "facebook-images";
export type NotionPreflightStatus = "DISABLED" | "BLOCKED" | "CONFIGURED" | "UNKNOWN";
export type NotionPreflightRow = {
  area: NotionPreflightKey;
  label: string;
  status: NotionPreflightStatus;
  details: "FLAG_DISABLED" | "TOKEN_MISSING" | "DATA_SOURCE_MISSING"
    | "SCHEMA_MISSING" | "SCHEMA_UNKNOWN" | "FEATURE_GATES_MISSING"
    | "BASIC_REQUIREMENTS_MET";
};

function truth(value: unknown) {
  return value === true || (typeof value === "string" && ["true", "1"].includes(value.trim().toLowerCase()));
}
function uuid(value: unknown) {
  return typeof value === "string"
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.trim());
}
type Requirement = {
  key: NotionPreflightKey;
  label: string;
  gate: string;
  flagDependencies?: string[];
  source?: string;
  areas: string[];
};

const REQUIREMENTS: Requirement[] = [
  {key:"directory",label:"Adresár",gate:"NOTION_DIRECTORY_SYNC_ENABLED",
    source:"NOTION_DIRECTORY_DATA_SOURCE_ID",areas:["directory"]},
  {key:"breeds",label:"Plemená",gate:"NOTION_BREED_SYNC_ENABLED",
    source:"NOTION_BREEDS_DATA_SOURCE_ID",areas:["breeds"]},
  {key:"articles",label:"Články",gate:"NOTION_ARTICLE_SYNC_ENABLED",
    source:"NOTION_ARTICLES_DATA_SOURCE_ID",areas:["articles"]},
  {key:"eshops",label:"E-shopy",gate:"NOTION_ESHOP_SYNC_ENABLED",
    source:"NOTION_ESHOPS_DATA_SOURCE_ID",areas:["eshops"]},
  {key:"events-help",label:"Podujatia a Pomoc psom",gate:"NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED",
    // Individual canonical Notion targets are resolved from existing D1
    // notion_agenda_targets; flags alone do not prove their availability.
    areas:["events","organizations","adoptions","help-cases","lost-found"]},
  {key:"service-catalog",label:"Katalóg služieb V3",gate:"SERVICE_CATALOG_NOTION_AUTO_ENABLED",
    flagDependencies:["SERVICE_CATALOG_ADMIN_WRITES_ENABLED",
      "SERVICE_CATALOG_NOTION_MIRROR_READY","SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED"],
    areas:["service-catalog"]},
  {key:"facebook-images",label:"Facebook obrázky",gate:"NOTION_FACEBOOK_IMAGES_SYNC_ENABLED",
    source:"NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID",
    areas:["facebook-images"]},
];

/** A missing table or missing flag is not an indication of Notion API failure. */
export function notionSyncConfigurationPreflight(
  bindings: Record<string, unknown>,
  rows: readonly NotionOverviewRow[],
): NotionPreflightRow[] {
  return REQUIREMENTS.map((item) => {
    let status: NotionPreflightStatus = "CONFIGURED";
    let details: NotionPreflightRow["details"] = "BASIC_REQUIREMENTS_MET";
    const included = item.areas.map(area => rows.find(row => row.area === area));
    if (!truth(bindings[item.gate])) {
      status = "DISABLED";
      details = "FLAG_DISABLED";
    } else if (!bindings.NOTION_API_TOKEN || typeof bindings.NOTION_API_TOKEN !== "string"
      || !bindings.NOTION_API_TOKEN.trim()) {
      status = "BLOCKED";
      details = "TOKEN_MISSING";
    } else if (item.source && !uuid(bindings[item.source])) {
      status = "BLOCKED";
      details = "DATA_SOURCE_MISSING";
    } else if (item.flagDependencies?.some(flag => !truth(bindings[flag]))) {
      status = "BLOCKED";
      details = "FEATURE_GATES_MISSING";
    } else if (included.some(row => !row || row.status === "SCHEMA_UNAVAILABLE")) {
      status = "BLOCKED";
      details = "SCHEMA_MISSING";
    } else if (included.some(row => row?.status === "UNKNOWN")) {
      status = "UNKNOWN";
      details = "SCHEMA_UNKNOWN";
    }
    return {area:item.key,label:item.label,status,details};
  });
}
