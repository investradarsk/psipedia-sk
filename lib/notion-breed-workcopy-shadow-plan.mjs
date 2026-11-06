/**
 * Read-only construction of rollback-safe D1 shadow link candidates.
 *
 * Never executes SQL. The active breed_notion_sync mapping and its per-field
 * receipt must remain untouched until a separately authorized cutover.
 */
const uuid = value => String(value ?? "").replaceAll("-", "").toLowerCase();
export function planBreedWorkcopyShadowRows({
  identityPlan, productionLinks, originalDataSourceId, workDataSourceId,
}) {
  if (!identityPlan?.identityReady || identityPlan.cutoverReady !== false ||
    identityPlan.rows?.length !== 344) {
    throw Error("BREED_SHADOW_PARITY_NOT_VERIFIED");
  }
  const originalSource = uuid(originalDataSourceId);
  const workSource = uuid(workDataSourceId);
  if (!/^[a-f0-9]{32}$/.test(originalSource) ||
    !/^[a-f0-9]{32}$/.test(workSource) ||
    originalSource === workSource) {
    throw Error("BREED_SHADOW_DATA_SOURCE_UNSAFE");
  }
  const linkByBreed = new Map();
  for (const link of productionLinks ?? []) {
    if (linkByBreed.has(Number(link.breed_id)))
      throw Error("BREED_SHADOW_DUPLICATE_ACTIVE_LINK");
    linkByBreed.set(Number(link.breed_id), link);
  }
  const staged = [];
  const newIds = new Set(), oldIds = new Set();
  for (const row of identityPlan.rows) {
    const active = linkByBreed.get(row.breedId);
    if (!active || uuid(active.notion_page_id) !== uuid(row.oldPageId)) {
      throw Error("BREED_SHADOW_ACTIVE_LINK_CHANGED");
    }
    if (typeof active.content_hash !== "string" || !active.content_hash) {
      throw Error("BREED_SHADOW_ACTIVE_RECEIPT_MISSING");
    }
    const oldId = uuid(row.oldPageId), newId = uuid(row.newPageId);
    if (newId === oldId || oldIds.has(oldId) || newIds.has(newId))
      throw Error("BREED_SHADOW_PAGE_DUPLICATE");
    oldIds.add(oldId); newIds.add(newId);
    staged.push({
      breedId: row.breedId,
      originalPageId: row.oldPageId,
      workPageId: row.newPageId,
      originalDataSourceId,
      workDataSourceId,
      slug: row.slug,
      fciNumber: row.fciNumber,
      originalSyncReceipt: active.content_hash,
      originalSyncLastSyncedAt: active.last_synced_at ?? null,
      originalNotionLastEditedTime: active.notion_last_edited_time ?? null,
      status: "SHADOW",
    });
  }
  if (staged.length !== 344) throw Error("BREED_SHADOW_INCOMPLETE");
  return staged;
}
