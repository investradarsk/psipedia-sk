/**
 * Read-only identity reconciliation before linking the 60-field Notion breed
 * work copy to canonical D1. Never changes old page mappings or publication.
 */
const normalizeUuid = value => {
  const cleaned = String(value ?? "").replaceAll("-", "").toLowerCase();
  return /^[a-f0-9]{32}$/.test(cleaned) ? cleaned : "";
};
const positiveId = value => {
  const s = String(value ?? "").trim();
  const n = Number(s);
  return /^[1-9]\d*$/.test(s) && Number.isSafeInteger(n) ? n : null;
};
const valueOf = (page, name) => {
  const p = page?.properties?.[name];
  if (!p) return "";
  if (p.type === "number") return p.number == null ? "" : String(p.number);
  if (p.type === "url") return p.url ?? "";
  if (p.type === "checkbox") return p.checkbox ? "__YES__" : "__NO__";
  if (p.type === "select") return p.select?.name ?? "";
  const values = p.type === "title" ? p.title : p.rich_text;
  return Array.isArray(values)
    ? values.map(x => x.plain_text ?? x.text?.content ?? "").join("").trim()
    : "";
};
const uuidInUrl = value => {
  const tail = String(value ?? "").split(/[?#]/)[0].replace(/\/$/, "");
  return normalizeUuid(tail.slice(-36)) || normalizeUuid(tail.slice(-32));
};

/**
 * @returns {{identityReady:boolean,cutoverReady:false,issues:object[],
 *   rows:object[],summary:object}}
 */
export function planBreedWorkcopyIdentity({
  sourcePages, workPages, canonicalBreeds, productionLinks,
}) {
  if (![sourcePages, workPages, canonicalBreeds, productionLinks]
    .every(Array.isArray)) throw Error("BREED_IDENTITY_LISTS_REQUIRED");
  const issues = [], rows = [];
  const issue = (code, breedId) => issues.push({ code, ...(breedId ? { breedId } : {}) });
  if (sourcePages.length !== 344 || workPages.length !== 344)
    issue("NOTION_BREED_INVENTORY_NOT_344");

  function indexNotion(pages, area) {
    const byId = new Map(), uuids = new Set();
    for (const page of pages) {
      const id = positiveId(valueOf(page, "Psipedia ID"));
      const uuid = normalizeUuid(page?.id);
      if (!id || !uuid) { issue(area + "_INVALID_ID"); continue; }
      if (byId.has(id)) issue(area + "_DUPLICATE_BREED_ID", id);
      if (uuids.has(uuid)) issue(area + "_DUPLICATE_PAGE_ID", id);
      byId.set(id, page);
      uuids.add(uuid);
    }
    return byId;
  }
  const old = indexNotion(sourcePages, "SOURCE");
  const work = indexNotion(workPages, "WORK");
  // Unlinked drafts are outside the 344-profile migration cohort. They
  // must not be deleted or cause false slug/FCI conflicts for mapped breeds.
  const cohortIds = new Set(productionLinks.map(link =>
    positiveId(link?.breed_id)).filter(Boolean));
  const d1 = new Map(), slugs = new Set(), fciOwners = new Set();
  for (const row of canonicalBreeds) {
    const id = positiveId(row?.id);
    const slug = String(row?.slug ?? "").trim();
    if (!id) { issue("D1_INVALID_ID_OR_SLUG"); continue; }
    if (d1.has(id)) issue("D1_DUPLICATE_ID", id);
    d1.set(id, row);
    if (!cohortIds.has(id)) continue;
    if (!slug) { issue("D1_INVALID_ID_OR_SLUG", id); continue; }
    if (slugs.has(slug)) issue("D1_DUPLICATE_SLUG", id);
    slugs.add(slug);
    const fci = positiveId(row.fci_number);
    if (fci) {
      if (fciOwners.has(fci)) issue("D1_DUPLICATE_FCI", id);
      fciOwners.add(fci);
    }
  }
  const mapped = new Map(), oldLinkPageOwners = new Map();
  for (const link of productionLinks) {
    const id = positiveId(link?.breed_id), uuid = normalizeUuid(link?.notion_page_id);
    if (!id || !uuid) { issue("D1_LINK_INVALID"); continue; }
    if (mapped.has(id)) issue("D1_DUPLICATE_LINK_BREED", id);
    if (oldLinkPageOwners.has(uuid)) issue("D1_DUPLICATE_LINK_PAGE", id);
    mapped.set(id, uuid); oldLinkPageOwners.set(uuid, id);
  }

  for (const [id, page] of old) {
    const candidate = work.get(id), canonical = d1.get(id), link = mapped.get(id);
    if (!candidate) { issue("WORK_BREED_MISSING", id); continue; }
    if (!canonical) { issue("D1_BREED_MISSING", id); continue; }
    if (!link) { issue("D1_PRODUCTION_LINK_MISSING", id); continue; }
    const oldId = normalizeUuid(page.id), workId = normalizeUuid(candidate.id);
    if (link !== oldId) { issue("D1_LINK_NOT_OLD_SOURCE", id); continue; }
    if (workId === oldId || oldLinkPageOwners.has(workId)) {
      issue("WORK_PAGE_ALREADY_PRODUCTION", id); continue;
    }
    if (uuidInUrl(valueOf(candidate, "Zdrojový profil Notion")) !== oldId) {
      issue("WORK_PROVENANCE_LINK_MISMATCH", id); continue;
    }
    if (!valueOf(page, "Názov") ||
      valueOf(page, "Názov") !== valueOf(candidate, "Názov")) {
      issue("WORK_BREED_TITLE_MISMATCH", id); continue;
    }
    const sourceFci = positiveId(valueOf(page, "FCI číslo"));
    if (!sourceFci ||
      sourceFci !== positiveId(valueOf(candidate, "FCI číslo")) ||
      sourceFci !== positiveId(canonical.fci_number)) {
      issue("BREED_FCI_MISMATCH", id); continue;
    }
    if (valueOf(page, "Slug") !== canonical.slug) {
      issue("D1_SLUG_MISMATCH", id); continue;
    }
    if (valueOf(page, "Editorial complete") !==
      valueOf(candidate, "Editorial complete")) {
      issue("EDITORIAL_COMPLETE_DIFFERENCE", id); continue;
    }
    rows.push({
      breedId: id, oldPageId: page.id, newPageId: candidate.id,
      slug: canonical.slug, fciNumber: sourceFci,
    });
  }
  for (const id of work.keys())
    if (!old.has(id)) issue("WORK_PROFILE_NOT_IN_SOURCE", id);
  for (const id of old.keys())
    if (!d1.has(id)) issue("SOURCE_PROFILE_NOT_IN_D1", id);
  rows.sort((a, b) => a.breedId - b.breedId);
  return {
    identityReady: issues.length === 0 && rows.length === 344,
    cutoverReady: false,
    issues, rows,
    summary: {
      oldCount: sourcePages.length,
      workCount: workPages.length,
      canonicalCount: canonicalBreeds.length,
      productionLinks: productionLinks.length,
      matchingLinks: rows.length,
      issues: issues.length,
    },
  };
}
