/**
 * Phase 2/4: candidate SQL owners for Directory editable values.
 *
 * Not wired to Admin/public/Notion yet: callers must not use proposed tables
 * until the migration, controlled backfill and verified read cutover.
 * Existing Help and Events fields already live in their canonical SQL tables.
 *
 * A field's Notion label and its SQL storage location are different concepts:
 * the mapping below makes that translation explicit without replicating data.
 */
import { directoryPublicFactLabels } from "./directory-public-facts.ts";
import {
  directoryFilterRegistry, serviceFilterCategories,
  serviceFiltersForCategory, type ServiceFilterCategory,
} from "./directory-filter-contract.ts";

export type ProposedSqlPlacement = Readonly<{
  state: "existing" | "proposed" | "relation" | "structured" | "review";
  table: string | null;
  column: string | null;
  reason?: string;
}>;

const existing = (column: string): ProposedSqlPlacement =>
  ({state:"existing",table:"directory_profiles",column});
const added = (column: string): ProposedSqlPlacement =>
  ({state:"proposed",table:"directory_profiles",column});
const relation = (table: string): ProposedSqlPlacement =>
  ({state:"relation",table,column:null});
const structured = (column: string): ProposedSqlPlacement =>
  ({state:"structured",table:"directory_profiles",column});
const review = (reason: string): ProposedSqlPlacement =>
  ({state:"review",table:null,column:null,reason});

/** Keys match the Notion property names, not mutable UI labels. */
export const DIRECTORY_NOTION_COMMON_SQL_SLOTS: Readonly<Record<string, ProposedSqlPlacement>> = {
  "Názov":existing("name"),
  "Perex":existing("excerpt"),
  "Popis":existing("description"),
  "Kraj":existing("region"),
  "Okres":existing("district"),
  "Mesto":existing("city"),
  "Adresa":existing("address"),
  "PSČ":existing("postal_code"),
  "Ulica":existing("street"),
  "Číslo domu":existing("house_number"),
  "Formát adresy":existing("address_format"),
  "Cena / poznámka":existing("price_note"),
  "Web":existing("website_url"),
  "Telefón":added("public_phone"),
  "E-mail":added("public_email"),
  "Facebook":added("facebook_url"),
  "Instagram":added("instagram_url"),
  "Kvalifikácie":structured("qualifications_json"),
  // Free-text legacy Services and canonical Services V3 cannot be collapsed
  // without a field-by-field, category-specific review.
  "Služby":review("Services V3 relations vs. historic services_json"),
};

const RELATION_OWNED_FACTS = new Set([
  "Plemeno", "Plemená", "FCI skupina", "Organizácia",
  "Zastrešujúca organizácia", "Klub",
]);

/**
 * Existing Notion filter columns are a category-specific, validated source.
 * If a public JSON fact has the same name, never create two SQL authorities:
 * the collision requires a human-approved one-field cutover.
 */
export function proposedDirectorySqlPlacement(
  category: ServiceFilterCategory,
  notionProperty: string,
): ProposedSqlPlacement {
  if (!(serviceFilterCategories as readonly string[]).includes(category))
    throw new Error("DIRECTORY_SQL_UNKNOWN_CATEGORY");
  const common = DIRECTORY_NOTION_COMMON_SQL_SLOTS[notionProperty];
  if (common) return common;

  const filterMatches = serviceFiltersForCategory(category)
    .filter(item => item.notion.property === notionProperty);
  const hasPublicFact = notionProperty === "Ordinačné hodiny" ||
    notionProperty === "Pokrytie" ||
    directoryPublicFactLabels(category).includes(notionProperty);

  if (RELATION_OWNED_FACTS.has(notionProperty))
    return review("Possible canonical breed/club/organization relation: no text auto-import");
  if (filterMatches.length > 1)
    return review("Multiple Notion filters claim this label");
  if (filterMatches.length === 1 && hasPublicFact)
    return review("Filter select and public text fact share a Notion label");
  if (filterMatches.length === 1)
    return relation("directory_profile_filter_values");
  if (hasPublicFact)
    return relation("directory_profile_public_facts");
  return review("Field has no approved SQL/editor/public mapping yet");
}

/** All Directory filter IDs must have exactly one target row and Notion label. */
export function proposedDirectorySqlFilterTarget(
  category: ServiceFilterCategory,
  filterId: string,
) {
  const filter = directoryFilterRegistry.find(item => item.id === filterId);
  if (!filter || filter.category !== category)
    throw new Error("DIRECTORY_SQL_FILTER_ID_OR_CATEGORY_INVALID");
  return {
    table:"directory_profile_filter_values" as const,
    category:filter.category,
    fieldId:filter.id,
    notionProperty:filter.notion.property,
    allowedValues:filter.allowedValues,
  };
}

/**
 * Scope-level placement: Help/Event main tables already use stable SQL fields.
 * Never create a parallel catch-all JSON store for them.
 */
export const EDITORIAL_CANONICAL_SQL_SCOPES = [
  {scope:"directory",table:"directory_profiles",notionMapping:"directory_notion_sync"},
  {scope:"eshops",table:"managed_eshops",notionMapping:"eshop_notion_sync"},
  {scope:"events",table:"managed_events",notionMapping:"event_notion_sync"},
  {scope:"help-cases",table:"help_cases",notionMapping:"notion_agenda_sync"},
  {scope:"organizations",table:"help_organizations",notionMapping:"notion_agenda_sync"},
  {scope:"adoptions",table:"adoption_dogs",notionMapping:"notion_agenda_sync"},
  {scope:"lost-found",table:"lost_found_dog_reports",notionMapping:"notion_agenda_sync"},
] as const;

export const DIRECTORY_ADDITIONAL_CATEGORY_TARGET = relation(
  "directory_profile_additional_categories",
);
export const DIRECTORY_SERVICES_V3_TARGET = relation(
  "service_profile_option_choices",
);
