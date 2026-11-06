/**
 * Pure, read-only validation for 344-row breed WorkCopy activation.
 * No D1 or Notion writes. A live Admin route must recheck state immediately
 * before its single atomic D1 status transition.
 */
const uuid = value => String(value ?? "").replaceAll("-", "").toLowerCase();
const PREFIX = "breed-field-v1:";

function isPerFieldReceipt(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return false;
  try {
    const v = JSON.parse(value.slice(PREFIX.length));
    const notion = JSON.parse(v.notion);
    const admin = JSON.parse(v.admin);
    return !!notion && !!admin &&
      !Array.isArray(notion) && !Array.isArray(admin) &&
      typeof notion === "object" && typeof admin === "object" &&
      Object.keys(notion).length > 0 && Object.keys(admin).length > 0;
  } catch { return false; }
}

export function planBreedWorkcopyActivation({
  planned, staged, workPages, oldSourceId, newSourceId,
}) {
  const failures = [];
  if (planned?.length !== 344 || staged?.length !== 344 ||
      workPages?.length !== 344)
    return { ready: false, count: 0, failures: ["BREED_ACTIVATION_COUNT_INVALID"] };
  const workById = new Map();
  for (const page of workPages) {
    const key = uuid(page.id);
    if (workById.has(key)) failures.push("BREED_ACTIVATION_DUPLICATE_NOTION_PAGE");
    workById.set(key, page);
  }
  const stagedById = new Map();
  for (const row of staged) {
    if (stagedById.has(Number(row.breed_id)))
      failures.push("BREED_ACTIVATION_DUPLICATE_D1_BREED");
    stagedById.set(Number(row.breed_id), row);
  }
  const seenNew = new Set(), seenOld = new Set();
  for (const candidate of planned) {
    const row = stagedById.get(candidate.breedId);
    const page = workById.get(uuid(candidate.workPageId));
    if (!row || !page) {
      failures.push("BREED_ACTIVATION_LINK_MISSING");
      continue;
    }
    if (seenNew.has(uuid(candidate.workPageId)) ||
        seenOld.has(uuid(candidate.originalPageId)))
      failures.push("BREED_ACTIVATION_DUPLICATE_PLANNED_PAGE");
    seenNew.add(uuid(candidate.workPageId));
    seenOld.add(uuid(candidate.originalPageId));
    if (row.status !== "SHADOW" ||
        row.breed_id !== candidate.breedId ||
        uuid(row.original_notion_page_id) !== uuid(candidate.originalPageId) ||
        uuid(row.work_notion_page_id) !== uuid(candidate.workPageId) ||
        uuid(row.original_data_source_id) !== uuid(oldSourceId) ||
        uuid(row.work_data_source_id) !== uuid(newSourceId) ||
        row.canonical_slug !== candidate.slug ||
        Number(row.fci_number) !== Number(candidate.fciNumber) ||
        row.original_sync_receipt !== candidate.originalSyncReceipt ||
        row.work_sync_receipt !== candidate.originalSyncReceipt)
      failures.push("BREED_ACTIVATION_STAGED_IDENTITY_OR_RECEIPT_CHANGED");
    if (!isPerFieldReceipt(row.work_sync_receipt))
      failures.push("BREED_ACTIVATION_PER_FIELD_RECEIPT_MISSING");
    if (!row.work_notion_last_edited_time ||
        row.work_notion_last_edited_time !== page.last_edited_time)
      failures.push("BREED_ACTIVATION_NOTION_REVISION_CHANGED");
  }
  return {
    ready: failures.length === 0 && seenNew.size === 344 && seenOld.size === 344,
    count: staged.length,
    failures: [...new Set(failures)],
  };
}
