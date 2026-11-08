/**
 * Safe read-only 344-row postflight after owner-initiated work-copy baselines.
 * This module receives already-read D1/Notion rows; it has no IO or mutations.
 * It compares original identity with the stored historical snapshot without
 * pretending that the still-live original receipt can never advance.
 */
export const normalizeBreedId = value =>
  String(value ?? "").replaceAll("-", "").toLowerCase();
const goodId = value => /^[a-f0-9]{32}$/.test(normalizeBreedId(value));
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function inspectBreedIndependentReceipt(value, fields) {
  if (!value?.startsWith("breed-field-v1:") || !Array.isArray(fields) ||
      !fields.length || new Set(fields).size !== fields.length) return null;
  try {
    const receipt = JSON.parse(value.slice("breed-field-v1:".length));
    if (!receipt || !/^[a-f0-9]{64}$/i.test(receipt.hash) ||
        typeof receipt.notion !== "string" || typeof receipt.admin !== "string")
      return null;
    const notion = JSON.parse(receipt.notion), admin = JSON.parse(receipt.admin);
    if (!notion || !admin || typeof notion !== "object" ||
        typeof admin !== "object" || Array.isArray(notion) || Array.isArray(admin) ||
        !fields.every(key => has(notion, key) && has(admin, key)))
      return null;
    let differences = 0;
    for (const key of fields) {
      if (JSON.stringify(notion[key]) !== JSON.stringify(admin[key]))
        differences++;
    }
    return { fieldCount: fields.length, differences };
  } catch { return null; }
}

function propertyValue(page, key) {
  const property = page?.properties?.[key];
  if (!property) return "";
  if (property.type === "number")
    return property.number == null ? "" : String(property.number);
  if (property.type === "url") return property.url ?? "";
  const parts = property.type === "title" ? property.title : property.rich_text;
  return Array.isArray(parts)
    ? parts.map(p => p.plain_text ?? p.text?.content ?? "").join("").trim() : "";
}
function uniqueMap(rows, key, errors, code) {
  const map = new Map();
  for (const row of rows ?? []) {
    const id = key(row);
    if (!id || map.has(id)) { errors.add(code); continue; }
    map.set(id, row);
  }
  return map;
}

export function auditBreedBaselinePostflight({
  canonicalBreeds, productionLinks, shadowRows, originalPages, workPages,
  originalSource, workSource, requiredFields,
}) {
  const errors = new Set(), samples = {};
  const counters = {
    canonical: canonicalBreeds?.length ?? 0,
    originalLinks: productionLinks?.length ?? 0,
    shadowLinks: shadowRows?.length ?? 0,
    originalNotionPages: originalPages?.length ?? 0,
    workNotionPages: workPages?.length ?? 0,
    independentReceiptsCompatible: 0,
    independentReceiptsMissingOrInvalid: 0,
    savedNotionRevisions: 0,
    originalLinkIdentityMatches: 0,
    workLinkIdentityMatches: 0,
    originalReceiptDrift: 0,
    originalLastSyncDrift: 0,
    workNotionRevisionDrift: 0,
    workReceiptAdminVsNotionFieldDifferences: 0,
    rowsWithErrors: 0,
    activeOrVerifiedRows: 0,
  };
  if (counters.canonical < 344 || counters.originalLinks !== 344 ||
      counters.shadowLinks !== 344 || counters.originalNotionPages !== 344 ||
      counters.workNotionPages !== 344)
    errors.add("BREED_POSTFLIGHT_COUNT_CHANGED");
  if (!goodId(originalSource) || !goodId(workSource) ||
      normalizeBreedId(originalSource) === normalizeBreedId(workSource))
    errors.add("BREED_POSTFLIGHT_SOURCES_INVALID");

  const canonical = uniqueMap(canonicalBreeds, r => String(r.id), errors,
    "BREED_POSTFLIGHT_DUPLICATE_CANONICAL");
  const old = uniqueMap(productionLinks, r => String(r.breed_id), errors,
    "BREED_POSTFLIGHT_DUPLICATE_ORIGINAL_LINK");
  const shadow = uniqueMap(shadowRows, r => String(r.breed_id), errors,
    "BREED_POSTFLIGHT_DUPLICATE_SHADOW");
  const originalNotion = uniqueMap(originalPages, r => normalizeBreedId(r.id),
    errors, "BREED_POSTFLIGHT_DUPLICATE_OLD_NOTION");
  const workNotion = uniqueMap(workPages, r => normalizeBreedId(r.id),
    errors, "BREED_POSTFLIGHT_DUPLICATE_NEW_NOTION");
  const oldIds = new Set(), workIds = new Set();
  function flag(code, breedId) {
    errors.add(code);
    if (!samples[code]) samples[code] = [];
    if (samples[code].length < 8) samples[code].push(Number(breedId));
  }
  for (const [id, row] of shadow) {
    const breed = canonical.get(id), current = old.get(id);
    const originalId = normalizeBreedId(row.original_notion_page_id);
    const workId = normalizeBreedId(row.work_notion_page_id);
    const oldPage = originalNotion.get(originalId);
    const workPage = workNotion.get(workId);
    if (!goodId(originalId) || !goodId(workId) || originalId === workId ||
        oldIds.has(originalId) || workIds.has(workId)) {
      flag("BREED_POSTFLIGHT_DUPLICATE_OR_INVALID_PAGE", id); continue;
    }
    oldIds.add(originalId); workIds.add(workId);
    if (!breed || !current || !oldPage || !workPage) {
      flag("BREED_POSTFLIGHT_MAPPING_MISSING", id); continue;
    }
    if (row.canonical_slug !== breed.slug ||
        Number(row.fci_number) !== Number(breed.fci_number) ||
        normalizeBreedId(row.original_data_source_id) !== normalizeBreedId(originalSource) ||
        normalizeBreedId(row.work_data_source_id) !== normalizeBreedId(workSource) ||
        normalizeBreedId(current.notion_page_id) !== originalId ||
        Number(propertyValue(oldPage, "Psipedia ID")) !== Number(id) ||
        Number(propertyValue(oldPage, "FCI číslo")) !== Number(breed.fci_number)) {
      flag("BREED_POSTFLIGHT_ORIGINAL_IDENTITY_DRIFT", id);
    } else counters.originalLinkIdentityMatches++;
    const provenance = normalizeBreedId(
      propertyValue(workPage, "Zdrojový profil Notion").split(/[?#]/)[0]).slice(-32);
    if (Number(propertyValue(workPage, "Psipedia ID")) !== Number(id) ||
        Number(propertyValue(workPage, "FCI číslo")) !== Number(breed.fci_number) ||
        provenance !== originalId) {
      flag("BREED_POSTFLIGHT_WORKCOPY_IDENTITY_DRIFT", id);
    } else counters.workLinkIdentityMatches++;

    if (row.status !== "SHADOW" || row.activated_at != null ||
        row.verified_at != null || row.rolled_back_at != null) {
      counters.activeOrVerifiedRows++;
      flag("BREED_POSTFLIGHT_NOT_SHADOW", id);
    }
    if (row.work_last_error_code != null) {
      counters.rowsWithErrors++;
      flag("BREED_POSTFLIGHT_RECORDED_ERROR", id);
    }
    const receipt = inspectBreedIndependentReceipt(row.work_sync_receipt, requiredFields);
    if (!receipt) {
      counters.independentReceiptsMissingOrInvalid++;
      flag("BREED_POSTFLIGHT_INDEPENDENT_RECEIPT_INVALID", id);
    } else {
      counters.independentReceiptsCompatible++;
      counters.workReceiptAdminVsNotionFieldDifferences += receipt.differences;
    }
    if (!row.work_notion_last_edited_time) {
      flag("BREED_POSTFLIGHT_WORKCOPY_REVISION_NOT_SAVED", id);
    } else {
      counters.savedNotionRevisions++;
      if (row.work_notion_last_edited_time !== workPage.last_edited_time)
        counters.workNotionRevisionDrift++;
    }
    if (row.original_sync_receipt !== current.content_hash)
      counters.originalReceiptDrift++;
    if (row.original_sync_last_synced_at !== (current.last_synced_at ?? null))
      counters.originalLastSyncDrift++;
  }
  if (shadow.size !== old.size || oldIds.size !== 344 || workIds.size !== 344)
    errors.add("BREED_POSTFLIGHT_LINK_SET_INCOMPLETE");
  const identitySafe = errors.size === 0;
  const revisionsCurrent = counters.workNotionRevisionDrift === 0;
  const legacyReceiptCurrent = counters.originalReceiptDrift === 0;
  return {
    phase: "READ_ONLY_POSTFLIGHT",
    success: identitySafe,
    identitySafe,
    revisionsCurrent,
    legacyReceiptCurrent,
    readyForSeparateCutoverReview: identitySafe &&
      revisionsCurrent && legacyReceiptCurrent,
    cutoverReady: false, // A separate decision, activation and E2E are required.
    counters, errors: [...errors], samples,
  };
}
