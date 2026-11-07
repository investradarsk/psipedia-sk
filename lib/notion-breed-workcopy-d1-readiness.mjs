/**
 * Read-only D1 diagnostic for the 109 -> 60 breed workcopy migration.
 * It does not infer that SQL 0159 was applied merely because its file exists.
 * No secrets, SQL writes, profile data or customer information in the report.
 */
export const BREED_WORKCOPY_SHADOW_COLUMNS = Object.freeze([
  "breed_id", "original_notion_page_id", "work_notion_page_id",
  "original_data_source_id", "work_data_source_id", "canonical_slug",
  "fci_number", "original_sync_receipt", "work_sync_receipt",
  "work_last_synced_at", "work_last_error_code",
  "original_sync_last_synced_at", "original_notion_last_edited_time",
  "work_notion_last_edited_time", "status",
  "verified_at", "activated_at", "rolled_back_at",
  "created_at", "updated_at",
]);

export function summarizeBreedWorkcopyD1Readiness({
  canonicalBreeds = [],
  productionLinks = [],
  shadowTablePresent = false,
  shadowColumns = [],
  shadowUniqueKeys = [],
  shadowStatuses = [],
  isCompatibleReceipt = () => false,
}) {
  const canonicalCount = canonicalBreeds.length;
  const originalLinkCount = productionLinks.length;
  const distinctCanonicalIds = new Set(canonicalBreeds.map(row => Number(row.id))).size;
  const distinctLinkIds = new Set(productionLinks.map(row => Number(row.breed_id))).size;
  const distinctOriginalPageIds = new Set(productionLinks.map(row =>
    String(row.notion_page_id || "").replaceAll("-", "").toLowerCase())).size;
  const compatibleOriginalReceipts = productionLinks.filter(row =>
    isCompatibleReceipt(row.content_hash)).length;
  const columnNames = new Set(shadowColumns.map(row =>
    String(typeof row === "string" ? row : row.name)));
  const missingShadowColumns = shadowTablePresent ?
    BREED_WORKCOPY_SHADOW_COLUMNS.filter(name => !columnNames.has(name)) : [];
  const shadowCounts = { SHADOW: 0, VERIFIED: 0, ACTIVE: 0, ROLLED_BACK: 0 };
  let shadowOther = 0;
  for (const item of shadowStatuses) {
    const status = String(item.status);
    const count = Number(item.count);
    if (!Number.isSafeInteger(count) || count < 0) {
      return { status: "INVALID_D1_COUNTS", cutoverReady: false };
    }
    if (Object.prototype.hasOwnProperty.call(shadowCounts, status))
      shadowCounts[status] += count;
    else shadowOther += count;
  }
  const totalShadowLinks = Object.values(shadowCounts).reduce((a, b) => a + b, 0) + shadowOther;
  // The canonical table may also contain unpublished/unmapped drafts.
  // Identity for this migration is the EXACT 344 linked profiles, not every
  // canonical row. Extra rows are reported but are never deleted or staged.
  const mappedIds = new Set(productionLinks.map(row => Number(row.breed_id)));
  const canonicalIds = new Set(canonicalBreeds.map(row => Number(row.id)));
  const extraCanonicalBreeds = canonicalBreeds
    .filter(row => !mappedIds.has(Number(row.id)))
    .map(row => ({ id: row.id, slug: row.slug, status: row.status }));
  const originalLinksReady = canonicalCount >= 344 &&
    originalLinkCount === 344 && distinctCanonicalIds === canonicalCount &&
    distinctLinkIds === 344 && distinctOriginalPageIds === 344 &&
    [...mappedIds].every(id => canonicalIds.has(id));
  const originalReceiptsReady = originalLinksReady && compatibleOriginalReceipts === 344;
  const shadowPrimaryKeyValid = shadowColumns.some(column =>
    column && typeof column === "object" &&
    column.name === "breed_id" && Number(column.pk) === 1 &&
    String(column.type).toUpperCase() === "INTEGER");
  const shadowSourceUnique = shadowUniqueKeys.some(columns =>
    Array.isArray(columns) && columns.length === 1 &&
    columns[0] === "original_notion_page_id");
  const shadowWorkUnique = shadowUniqueKeys.some(columns =>
    Array.isArray(columns) && columns.length === 1 &&
    columns[0] === "work_notion_page_id");
  const shadowConstraintsValid = shadowPrimaryKeyValid &&
    shadowSourceUnique && shadowWorkUnique;
  const shadowSchemaCompatible = shadowTablePresent &&
    missingShadowColumns.length === 0 && shadowConstraintsValid;
  const shadowCountsReady = shadowSchemaCompatible && totalShadowLinks === 344 &&
    shadowOther === 0;
  return {
    canonicalCount,
    originalLinkCount,
    distinctCanonicalIds,
    distinctLinkIds,
    distinctOriginalPageIds,
    compatibleOriginalReceipts,
    incompatibleOriginalReceipts: originalLinkCount - compatibleOriginalReceipts,
    originalLinksReady,
    extraCanonicalBreeds,
    originalReceiptsReady,
    shadowTablePresent,
    shadowSchemaCompatible,
    shadowConstraintsValid,
    shadowPrimaryKeyValid,
    shadowSourceUnique,
    shadowWorkUnique,
    missingShadowColumns,
    shadowCounts,
    shadowOther,
    totalShadowLinks,
    shadowCountsReady,
    // These diagnostics do not authorize changes, regardless of result.
    cutoverReady: false,
  };
}
