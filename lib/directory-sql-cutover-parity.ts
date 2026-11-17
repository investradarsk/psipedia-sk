/**
 * Phase 3/4 – authenticated, on-demand, SELECT-only SQL cutover parity.
 *
 * This is NOT a runtime cutover. No public response, Notion snapshot or Admin
 * edit is changed until the proposed schema has a deployed migration, a
 * verified per-field backfill and full multi-category/read/write parity.
 *
 * The output is limited to field identifiers and issue classes. It never
 * serializes contact values, raw source_data_json, addresses or private notes.
 */
import {
  directoryPublicFactLabels,
  readDirectoryPublicMetadataSource,
} from "./directory-public-facts.ts";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
import { readAdditionalDirectoryCategories } from "./directory-multi-category.ts";
import { directoryFilterRegistry, normalizeDirectoryFilterValue } from "./directory-filter-contract.ts";
import { proposedDirectorySqlPlacement } from "./directory-sql-cutover-contract.ts";
import type { ServiceFilterCategory } from "./directory-filter-contract.ts";

const REQUIRED_RELATIONS = [
  "directory_profile_additional_categories",
  "directory_profile_public_facts",
  "directory_profile_filter_values",
] as const;

type ShadowSourceRow = {
  id: number; category: string; website_url: string | null; source_data_json: string;
  public_phone: string | null; public_email: string | null;
  facebook_url: string | null; instagram_url: string | null;
};
type SqlTextRow = { field_key: string; value_text: string };
type SqlFilterRow = { category: string; filter_id: string; value_text: string };
type SqlCategoryRow = { category: string };

export type DirectorySqlParityIssueKind =
  "not_backfilled" | "value_differs" | "legacy_alias_after_clear" |
  "sql_only_value" | "unmapped_sql_field" | "invalid_sql_value" |
  "category_mismatch" | "invalid_legacy_json";
export type DirectorySqlParityIssue = Readonly<{
  group: "contact" | "category" | "fact" | "filter" | "source";
  field: string;
  kind: DirectorySqlParityIssueKind;
}>;
export type DirectorySqlParityReport = Readonly<{
  schemaReady: boolean;
  status: "not_deployed" | "not_found" | "pending_review" | "no_detected_differences";
  profileId: number;
  category?: string;
  issues: readonly DirectorySqlParityIssue[];
  issuesByGroup?: Readonly<Record<"contact" | "category" | "fact" | "filter" | "source", number>>;
  /** This is NOT a live Notion/admin/public parity certificate. */
  notionVerified: false;
  publicReadsCutOver: false;
}>;

function parseSource(source: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(source);
    return data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown> : null;
  } catch { return null; }
}
function normalizedText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}
function delta(
  group: DirectorySqlParityIssue["group"],
  field: string,
  current: string | null,
  previous: string,
): DirectorySqlParityIssue | null {
  if (current === null) {
    return previous ? { group, field, kind:"not_backfilled" } : null;
  }
  const next=normalizedText(current);
  const prior=normalizedText(previous);
  if (!next && prior) return {group,field,kind:"legacy_alias_after_clear"};
  if (next && !prior) return {group,field,kind:"sql_only_value"};
  if (next !== prior) return {group,field,kind:"value_differs"};
  return null;
}
function counts(issues: readonly DirectorySqlParityIssue[]) {
  return Object.fromEntries(
    (["contact","category","fact","filter","source"] as const)
      .map(group => [group, issues.filter(issue => issue.group === group).length]),
  ) as Record<"contact" | "category" | "fact" | "filter" | "source",number>;
}

/** Pure comparison: untrusted or unknown SQL keys never become public values. */
export function compareDirectorySqlShadow(
  row: ShadowSourceRow,
  sqlCategories: readonly SqlCategoryRow[],
  sqlFacts: readonly SqlTextRow[],
  sqlFilters: readonly SqlFilterRow[],
): DirectorySqlParityReport {
  const issues: DirectorySqlParityIssue[]=[];
  const raw=parseSource(row.source_data_json);
  if (!raw) issues.push({group:"source",field:"source_data_json",kind:"invalid_legacy_json"});
  const legacy=raw ?? {};
  const legacyText = Object.fromEntries(Object.entries(legacy)
    .filter((entry): entry is [string, string | number | null] =>
      entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number"));
  const legacyContacts=readDirectoryPublicContacts(legacyText, row.website_url ?? "");
  for (const [field,sqlValue,old] of [
    ["publicPhone",row.public_phone,legacyContacts.phone],
    ["publicEmail",row.public_email,legacyContacts.email],
    ["facebookUrl",row.facebook_url,legacyContacts.facebook],
    ["instagramUrl",row.instagram_url,legacyContacts.instagram],
  ] as const) {
    const issue=delta("contact",field,sqlValue,old);
    if (issue) issues.push(issue);
  }

  const oldCategories=readAdditionalDirectoryCategories(legacy,row.category);
  const newCategories=[...new Set(sqlCategories.map(r=>r.category))].sort();
  const oldSet=new Set(oldCategories);
  const newSet=new Set(newCategories);
  for (const category of oldSet)
    if (!newSet.has(category)) issues.push({group:"category",field:category,kind:"not_backfilled"});
  for (const category of newSet)
    if (!oldSet.has(category)) issues.push({group:"category",field:category,kind:"sql_only_value"});

  const validCategory=(["veterinari","treneri","kynologicke-kluby","chovatelske-kluby",
    "chovatelske-stanice","salony-a-sluzby","hotely-a-opatrovanie",
    "vencenie","fyzioterapia","dalsie-sluzby"] as const)
    .includes(row.category as ServiceFilterCategory);

  if (validCategory) {
    const category=row.category as ServiceFilterCategory;
    const factMap=new Map(sqlFacts.map(x=>[x.field_key,x.value_text]));
    for (const fact of ["Ordinačné hodiny","Pokrytie",...directoryPublicFactLabels(category)]) {
      const target=proposedDirectorySqlPlacement(category,fact);
      if (target.table !== "directory_profile_public_facts") continue;
      const old=readDirectoryPublicMetadataSource(legacyText,fact)?.value ?? "";
      const newer=factMap.get(fact) ?? null;
      const issue=delta("fact",fact,newer,old);
      if (issue) issues.push(issue);
    }
    for (const sql of sqlFacts) {
      if (proposedDirectorySqlPlacement(category,sql.field_key).table !==
          "directory_profile_public_facts") {
        issues.push({group:"fact",field:sql.field_key,kind:"unmapped_sql_field"});
      }
    }
    const filterMap=new Map(sqlFilters.map(x=>[x.filter_id,x]));
    for (const def of directoryFilterRegistry.filter(x=>x.category===category)) {
      const old=normalizeDirectoryFilterValue(def,legacy[def.d1.key]);
      const newer=filterMap.get(def.id);
      if (!newer) {
        if (old.status==="known")
          issues.push({group:"filter",field:def.id,kind:"not_backfilled"});
        continue;
      }
      if (newer.category !== category) {
        issues.push({group:"filter",field:def.id,kind:"category_mismatch"});
        continue;
      }
      const current=normalizeDirectoryFilterValue(def,newer.value_text);
      if (current.status!=="known") {
        issues.push({group:"filter",field:def.id,kind:"invalid_sql_value"});
      } else if (old.status === "known" && current.value!==old.value) {
        issues.push({group:"filter",field:def.id,kind:"value_differs"});
      } else if (old.status !== "known") {
        issues.push({group:"filter",field:def.id,kind:"sql_only_value"});
      }
    }
    for (const row of sqlFilters) {
      const def=directoryFilterRegistry.find(x=>x.id===row.filter_id);
      if (!def || def.category!==category) {
        issues.push({group:"filter",field:row.filter_id,kind:"unmapped_sql_field"});
      }
    }
  } else {
    // Legacy source categories are not automatically eligible for new facets.
    for (const item of sqlFacts)
      issues.push({group:"fact",field:item.field_key,kind:"unmapped_sql_field"});
    for (const item of sqlFilters)
      issues.push({group:"filter",field:item.filter_id,kind:"unmapped_sql_field"});
  }
  // Avoid repeated notices for the same field when two read definitions overlap.
  const uniq=[...new Map(issues.map(x=>[x.group+":"+x.field+":"+x.kind,x])).values()];
  return {
    schemaReady:true,profileId:row.id,category:row.category,
    status:uniq.length?"pending_review":"no_detected_differences",
    issues:uniq,issuesByGroup:counts(uniq),
    notionVerified:false,publicReadsCutOver:false,
  };
}

/**
 * This runs only for an explicitly authenticated Admin read.
 * Schema discovery is bounded and never attempts migration or DDL.
 */
export async function readDirectorySqlShadowParity(
  database: D1Database,
  profileId: number,
): Promise<DirectorySqlParityReport> {
  if (!Number.isSafeInteger(profileId) || profileId<=0)
    throw new Error("DIRECTORY_SQL_SHADOW_INVALID_PROFILE_ID");
  const present=await database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
    "('directory_profiles','directory_profile_additional_categories'," +
    "'directory_profile_public_facts','directory_profile_filter_values')",
  ).all<{name:string}>();
  const exists=new Set((present.results??[]).map(x=>x.name));
  if (!exists.has("directory_profiles")) return {
    schemaReady:false,status:"not_deployed",profileId,issues:[],
    notionVerified:false,publicReadsCutOver:false,
  };
  if (REQUIRED_RELATIONS.some(name=>!exists.has(name))) return {
    schemaReady:false,status:"not_deployed",profileId,issues:[],
    notionVerified:false,publicReadsCutOver:false,
  };
  // The older production schema has no contact columns. Fail closed, without
  // executing the projection if the additive migration is still unapplied.
  const columns=await database.prepare(
    "SELECT name FROM pragma_table_info('directory_profiles') WHERE name IN " +
    "('public_phone','public_email','facebook_url','instagram_url')",
  ).all<{name:string}>();
  if (new Set((columns.results??[]).map(r=>r.name)).size !== 4) return {
    schemaReady:false,status:"not_deployed",profileId,issues:[],
    notionVerified:false,publicReadsCutOver:false,
  };
  const row=await database.prepare(
    "SELECT id, category, website_url, source_data_json, " +
    "public_phone, public_email, facebook_url, instagram_url " +
    "FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(profileId).first<ShadowSourceRow>();
  if (!row) return {
    schemaReady:true,status:"not_found",profileId,issues:[],
    notionVerified:false,publicReadsCutOver:false,
  };
  const [cats,facts,filters]=await Promise.all([
    database.prepare("SELECT category FROM directory_profile_additional_categories WHERE profile_id=?")
      .bind(profileId).all<SqlCategoryRow>(),
    database.prepare("SELECT field_key,value_text FROM directory_profile_public_facts WHERE profile_id=?")
      .bind(profileId).all<SqlTextRow>(),
    database.prepare("SELECT category,filter_id,value_text FROM directory_profile_filter_values WHERE profile_id=?")
      .bind(profileId).all<SqlFilterRow>(),
  ]);
  return compareDirectorySqlShadow(row,cats.results??[],facts.results??[],filters.results??[]);
}
