/**
 * Step 4 — aggregate-only read-only audit of the two independent snapshots
 * stored by step 2. This is historical BASELINE disagreement, not a list of
 * newly edited Notion fields or a mandate to reconcile anything.
 * Never put raw Notion/Admin values, names, page IDs or breed content in output.
 */
const blocked = new Set([
  "image", "gallery", "relatedBreedIds", "relatedArticleIds",
  "directoryProfileIds", "sports", "fciStandard", "editorial",
]);
const category = key =>
  key.startsWith("fciStandard.") ? "fciStandard" :
  key.startsWith("editorial.") ? "editorial" :
  key.startsWith("seo.") ? "seo" :
  blocked.has(key) ? "mediaRelationsSports" : "otherContent";
const blank = value => value == null ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const typeofValue = value => value == null ? "null" :
  Array.isArray(value) ? "array" : typeof value;

export function summarizeBreedWorkcopyBaselineDifferences(rows, registry) {
  const fields = Array.isArray(registry) ?
    registry.filter(x => x?.mode === "content" && typeof x.id === "string") : [];
  if (!Array.isArray(rows) || rows.length !== 344 || !fields.length ||
      new Set(fields.map(x => x.id)).size !== fields.length)
    throw Error("BREED_DIFF_COHORT_OR_REGISTRY_INVALID");
  const byField = Object.fromEntries(fields.map(x => [x.id, {
    fieldId: x.id, notionProperty: x.notion, group: category(x.id),
    excludedFromNormalWorkcopySync: blocked.has(x.id),
    differingProfiles: 0, notionOnly: 0, adminOnly: 0,
    differentNonempty: 0, blankRepresentationOnly: 0,
    typeMismatch: 0, sameProfiles: 0,
  }]));
  const byGroup = Object.fromEntries(
    [...new Set(fields.map(x => category(x.id)))].map(group => [
      group, { group, fields: 0, differingCells: 0, withAnyDifference: 0 },
    ]),
  );
  for (const field of fields) byGroup[category(field.id)].fields++;
  const seenIds = new Set();
  let differingCells = 0, rowsWithDifferences = 0;
  let excludedDifferences = 0;
  for (const row of rows) {
    const id = Number(row?.breed_id);
    if (!Number.isSafeInteger(id) || id <= 0 || seenIds.has(id) ||
        row.status !== "SHADOW" ||
        typeof row.work_sync_receipt !== "string" ||
        !row.work_sync_receipt.startsWith("breed-field-v1:"))
      throw Error("BREED_DIFF_ROW_IDENTITY_OR_RECEIPT_INVALID");
    seenIds.add(id);
    let payload, notion, admin;
    try {
      payload = JSON.parse(row.work_sync_receipt.slice("breed-field-v1:".length));
      notion = JSON.parse(payload.notion);
      admin = JSON.parse(payload.admin);
    } catch { throw Error("BREED_DIFF_RECEIPT_PARSE_FAILED"); }
    if (!notion || !admin || Array.isArray(notion) || Array.isArray(admin) ||
        typeof notion !== "object" || typeof admin !== "object" ||
        fields.some(({ id: field }) =>
          !Object.hasOwn(notion, field) || !Object.hasOwn(admin, field)))
      throw Error("BREED_DIFF_RECEIPT_INCOMPLETE");
    let thisRowDifferent = false;
    const rowGroups = new Set();
    for (const { id: field } of fields) {
      const stat = byField[field], a = notion[field], b = admin[field];
      if (same(a, b)) { stat.sameProfiles++; continue; }
      stat.differingProfiles++; differingCells++;
      thisRowDifferent = true; rowGroups.add(stat.group);
      if (stat.excludedFromNormalWorkcopySync) excludedDifferences++;
      const notionBlank = blank(a), adminBlank = blank(b);
      if (notionBlank && adminBlank) stat.blankRepresentationOnly++;
      else if (!notionBlank && adminBlank) stat.notionOnly++;
      else if (notionBlank && !adminBlank) stat.adminOnly++;
      else stat.differentNonempty++;
      if (typeofValue(a) !== typeofValue(b)) stat.typeMismatch++;
      byGroup[stat.group].differingCells++;
    }
    if (thisRowDifferent) rowsWithDifferences++;
    for (const group of rowGroups) byGroup[group].withAnyDifference++;
  }
  const ranked = Object.values(byField).sort((a, b) =>
    b.differingProfiles - a.differingProfiles ||
    a.fieldId.localeCompare(b.fieldId));
  return {
    scope: "INDEPENDENT_BASELINES_NOT_NEW_EDITS",
    records: rows.length,
    comparedFieldsPerRecord: fields.length,
    comparedCells: rows.length * fields.length,
    differingCells,
    equalCells: rows.length * fields.length - differingCells,
    recordsWithDifferences: rowsWithDifferences,
    excludedFromNormalSyncDifferences: excludedDifferences,
    byGroup: Object.values(byGroup),
    byField: ranked,
    // The safety gate is not a function of aggregate difference counts.
    canAuthorizeProductionWrites: false,
    requiresOwnerFieldLevelReview: true,
  };
}
