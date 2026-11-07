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
  const originalLinksReady = canonicalCount === 344 &&
    originalLinkCount === 344 && distinctCanonicalIds === 344 &&
    distinctLinkIds === 344 && distinctOriginalPageIds === 344 &&
    canonicalBreeds.every(row => productionLinks.some(link =>
      Number(row.id) === Number(link.breed_id)));
  const originalReceiptsReady = originalLinksReady && compatibleOriginalReceipts === 344;
  const shadowSchemaCompatible = shadowTablePresent && missingShadowColumns.length === 0;
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
    originalReceiptsReady,
    shadowTablePresent,
    shadowSchemaCompatible,
    missingShadowColumns,
    shadowCounts,
    shadowOther,
    totalShadowLinks,
    shadowCountsReady,
    // These diagnostics do not authorize changes, regardless of result.
    cutoverReady: false,
  };
}
