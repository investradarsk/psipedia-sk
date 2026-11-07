/**
 * Pure fail-closed guards for the additive 0159 SHADOW schema rollout.
 * These checks authorize schema creation ONLY, never a Notion source switch,
 * staging 344 links, baseline initialization or workflow re-enablement.
 */
import { summarizeBreedWorkcopyD1Readiness } from "./notion-breed-workcopy-d1-readiness.mjs";

export const BREED_0159_TARGET = "0159_breed_notion_workcopy_links.sql";
export const BREED_0159_TABLE = "breed_notion_workcopy_links";
export const BREED_0159_INDEX = "idx_breed_notion_workcopy_status";
export const BREED_0159_BLOB_SHA = "2f15cff024b4aada569d45817e70dcda93f65825";

export function inspectBreed0159Schema({ canonicalBreeds, productionLinks,
  shadowTablePresent=false, shadowColumns=[], shadowUniqueKeys=[],
  shadowStatuses=[], statusIndexPresent=false, createSql="" }) {
  const diagnostic = summarizeBreedWorkcopyD1Readiness({
    canonicalBreeds, productionLinks, shadowTablePresent,
    shadowColumns, shadowUniqueKeys, shadowStatuses,
  });
  const schemaReady = diagnostic.shadowSchemaCompatible &&
    statusIndexPresent &&
    /REFERENCES\s+managed_breeds\s*\(id\)\s+ON\s+DELETE\s+CASCADE/i.test(createSql) &&
    /CHECK\s*\(status\s+IN\s*\('SHADOW',\s*'VERIFIED',\s*'ACTIVE',\s*'ROLLED_BACK'\)\)/i.test(createSql) &&
    /CHECK\s*\(original_notion_page_id\s*<>\s*work_notion_page_id\)/i.test(createSql) &&
    /CHECK\s*\(original_data_source_id\s*<>\s*work_data_source_id\)/i.test(createSql);
  return { diagnostic, schemaReady };
}

export function assertBreed0159Preflight(input) {
  const { diagnostic, schemaReady } = inspectBreed0159Schema(input);
  if (!diagnostic.originalLinksReady)
    throw Error("BREED_0159_ORIGINAL_344_IDENTITIES_NOT_READY");
  if (diagnostic.shadowTablePresent || input.statusIndexPresent) {
    if (!schemaReady || diagnostic.totalShadowLinks !== 0)
      throw Error("BREED_0159_EXISTING_SCHEMA_INCOMPATIBLE_OR_IN_USE");
    return { alreadyInstalled:true, diagnostic };
  }
  if (diagnostic.totalShadowLinks !== 0)
    throw Error("BREED_0159_UNEXPECTED_SHADOW_ROWS");
  return { alreadyInstalled:false, diagnostic };
}

export function assertBreed0159Postflight(input) {
  const { diagnostic, schemaReady } = inspectBreed0159Schema(input);
  if (!diagnostic.originalLinksReady || !schemaReady ||
      diagnostic.totalShadowLinks !== 0)
    throw Error("BREED_0159_POSTFLIGHT_SCHEMA_OR_DATA_INVALID");
  return { schemaReady:true, diagnostic };
}
