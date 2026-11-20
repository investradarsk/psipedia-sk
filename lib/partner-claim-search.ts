import { getPartnerDatabase } from "./partner-auth-store";
import { isPartnerHelpType, searchPartnerHelpRecords } from "./partner-help-claims";
import {
  isPartnerClaimableResourceType,
  type PartnerClaimableResourceType,
} from "./partner-claims";

type ClaimSearchRow = { id: number; name: string; slug: string; category: string | null; city: string | null };
export type PartnerClaimSearchItem = {
  entityType: PartnerClaimableResourceType;
  canonicalId: number;
  name: string;
  details: string;
  publicHref: string;
  claimHref: string;
};

const typeSpecs: Record<Exclude<PartnerClaimableResourceType, "ADOPTION_DOG" | "LOST_FOUND_DOG" | "HELP_CASE">, { sql: string; label: string }> = {
  DIRECTORY_PROFILE: {
    sql: "SELECT id,name,slug,category,city FROM directory_profiles WHERE status='published' AND (name LIKE ?1 ESCAPE '\\' OR city LIKE ?1 ESCAPE '\\') ORDER BY name COLLATE NOCASE,id LIMIT 15",
    label: "Služba pre psov",
  },
  HELP_ORGANIZATION: {
    sql: "SELECT id,name,slug,NULL AS category,city FROM help_organizations WHERE status='PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL AND (name LIKE ?1 ESCAPE '\\' OR city LIKE ?1 ESCAPE '\\') ORDER BY name COLLATE NOCASE,id LIMIT 15",
    label: "Organizácia Pomoc psom",
  },
  MANAGED_EVENT: {
    sql: "SELECT id,title AS name,slug,event_type AS category,city FROM managed_events WHERE status='published' AND published_at IS NOT NULL AND (title LIKE ?1 ESCAPE '\\' OR city LIKE ?1 ESCAPE '\\') ORDER BY start_date DESC,id DESC LIMIT 15",
    label: "Podujatie",
  },
};

/** A public-record search only. Never reveal unpublished resources or partner account data. */
export async function searchPartnerClaimableRecords(input: {
  entityType: unknown;
  query: unknown;
  database?: D1Database;
  suggest?: boolean;
}): Promise<PartnerClaimSearchItem[]> {
  if (!isPartnerClaimableResourceType(input.entityType)) return [];
  if (typeof input.query !== "string") return [];
  if (isPartnerHelpType(input.entityType)) return searchPartnerHelpRecords(input.entityType,input.query,input.database,Boolean(input.suggest));
  const query = input.query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (query.length < (input.suggest ? 1 : 2)) return [];
  const escaped=query.replace(/[\\%_]/g, "\\$&");
  const pattern = input.suggest && query.length===1 ? `${escaped}%` : `%${escaped}%`;
  const type=input.entityType as keyof typeof typeSpecs;
  const sql=input.suggest&&type==="MANAGED_EVENT"
    ? typeSpecs[type].sql.replace("ORDER BY start_date DESC,id DESC","ORDER BY name COLLATE NOCASE,id")
    : typeSpecs[type].sql;
  const rows = (await getPartnerDatabase(input.database).prepare(sql)
    .bind(pattern).all<ClaimSearchRow>()).results;
  return rows.map((row) => ({
    entityType: input.entityType as PartnerClaimableResourceType,
    canonicalId: row.id,
    name: row.name,
    details: [typeSpecs[type].label, row.city].filter(Boolean).join(" · "),
    publicHref: input.entityType === "DIRECTORY_PROFILE" ? `/adresar/${row.category}/${row.slug}`
      : input.entityType === "HELP_ORGANIZATION" ? `/organizacie/${row.slug}` : `/podujatia/${row.slug}`,
    claimHref: `/partner/prevziat-profil/${input.entityType}/${row.id}`,
  }));
}
