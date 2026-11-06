/** Pure, dependency-free breed 109 → 60 content parity checks. Works in Node and Cloudflare Workers. No writes. */
import { BREED_COMPACT_VISIBLE, BREED_COMPACT_HIDDEN, BREED_COMPACT_MERGE, BREED_COMPACT_HEADINGS, BREED_COMPACT_OPERATIONAL, BREED_COMPACT_RETIRE_AFTER_AUDIT } from "./breed-notion-compact-consolidation.mjs";

export function normalizeBreedWorkText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      (full, label, href) => label === href ? href : full)
    .trim();
}

export function breedNotionScalar(property) {
  if (!property || typeof property !== "object") return "";
  if (property.type === "number") return property.number == null ? "" : String(property.number);
  if (property.type === "checkbox") return property.checkbox ? "__YES__" : "__NO__";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "url") return property.url ?? "";
  if (property.type === "date") return property.date?.start ?? "";
  const spans = property.type === "title" ? property.title : property.rich_text;
  return Array.isArray(spans)
    ? spans.map(p => p.plain_text ?? p.text?.content ?? "").join("")
    : "";
}

function addMergedSection(base, source, label) {
  const value = normalizeBreedWorkText(source);
  if (!value) return base;
  const heading = label + ": ";
  if (base.startsWith(heading) || base.includes(" — " + heading)) return base;
  if (value.length >= 45 && base.includes(value)) return base;
  return (base ? base + " — " : "") + heading + value;
}

export function projectBreed60(sourcePage) {
  const original = sourcePage?.properties ?? {};
  const projected = Object.fromEntries(
    BREED_COMPACT_VISIBLE.map(field => [field, normalizeBreedWorkText(breedNotionScalar(original[field]))]),
  );
  for (const [sourceName, targetName] of Object.entries(BREED_COMPACT_MERGE)) {
    const source = breedNotionScalar(original[sourceName]);
    projected[targetName] = addMergedSection(
      projected[targetName], source, BREED_COMPACT_HEADINGS[sourceName],
    );
  }
  return projected;
}

function uuidFromNotionUrl(value) {
  const match = String(value ?? "").match(/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-f0-9]{32})(?:[/?#]|$)/i);
  return match ? match[1].replaceAll("-", "").toLowerCase() : "";
}

function isTruncatedProperty(p) {
  return (p?.type === "rich_text" && (p.rich_text?.length ?? 0) >= 25)
    || (p?.type === "title" && (p.title?.length ?? 0) >= 25);
}

export function inspectBreedWorkCopy(sourcePages, workPages) {
  const issues = [];
  const stats = {
    original: sourcePages.length,
    workingCopy: workPages.length,
    matchedIds: 0,
    completedOriginal: 0,
    completedWorkCopy: 0,
    comparedCells: 0,
    mismatchedCells: 0,
    richTextNeedsPagination: 0,
    legacyNonempty: {},
    operationalNonempty: {},
  };
  if (sourcePages.length !== 344 || workPages.length !== 344)
    issues.push({ code: "COUNT_MISMATCH" });

  const oldById = new Map();
  for (const page of sourcePages) {
    if (!page?.id || Object.keys(page.properties ?? {}).length !== 109)
      issues.push({ code: "SOURCE_SCHEMA_DRIFT", page: page?.id ?? "" });
    if (Object.values(page.properties ?? {}).some(isTruncatedProperty)) {
      stats.richTextNeedsPagination++;
      issues.push({ code: "SOURCE_RICH_TEXT_PAGINATION_REQUIRED", page: page.id });
    }
    const id = breedNotionScalar(page.properties?.["Psipedia ID"]);
    if (!id || oldById.has(id)) issues.push({ code: "SOURCE_ID_NOT_UNIQUE", id });
    else oldById.set(id, page);
    if (breedNotionScalar(page.properties?.["Editorial complete"]) === "__YES__")
      stats.completedOriginal++;
    for (const key of BREED_COMPACT_OPERATIONAL) {
      if (normalizeBreedWorkText(breedNotionScalar(page.properties?.[key])))
        stats.operationalNonempty[key] = (stats.operationalNonempty[key] ?? 0) + 1;
    }
    for (const key of BREED_COMPACT_RETIRE_AFTER_AUDIT) {
      if (normalizeBreedWorkText(breedNotionScalar(page.properties?.[key]))
        && breedNotionScalar(page.properties?.[key]) !== "__NO__")
        stats.legacyNonempty[key] = (stats.legacyNonempty[key] ?? 0) + 1;
    }
  }
  const seen = new Set();
  for (const page of workPages) {
    if (!page?.id || Object.keys(page.properties ?? {}).length !== 62)
      issues.push({ code: "WORK_SCHEMA_DRIFT", page: page?.id ?? "" });
    if (Object.values(page.properties ?? {}).some(isTruncatedProperty)) {
      stats.richTextNeedsPagination++;
      issues.push({ code: "WORK_RICH_TEXT_PAGINATION_REQUIRED", page: page.id });
    }
    const id = breedNotionScalar(page.properties?.["Psipedia ID"]);
    if (!id || seen.has(id)) {
      issues.push({ code: "WORK_ID_NOT_UNIQUE", id });
      continue;
    }
    seen.add(id);
    const original = oldById.get(id);
    if (!original) {
      issues.push({ code: "WORK_ID_NOT_IN_SOURCE", id });
      continue;
    }
    stats.matchedIds++;
    if (breedNotionScalar(page.properties?.["Editorial complete"]) === "__YES__")
      stats.completedWorkCopy++;
    if (uuidFromNotionUrl(breedNotionScalar(page.properties?.["Zdrojový profil Notion"])) !==
      original.id.replaceAll("-", "").toLowerCase())
      issues.push({ code: "SOURCE_PAGE_LINK_MISMATCH", id });
    if (normalizeBreedWorkText(breedNotionScalar(original.properties["Názov"])) !==
      normalizeBreedWorkText(breedNotionScalar(page.properties["Názov"])) ||
      breedNotionScalar(original.properties["FCI číslo"]) !==
      breedNotionScalar(page.properties["FCI číslo"]))
      issues.push({ code: "NAME_OR_FCI_IDENTITY_MISMATCH", id });
    const projected = projectBreed60(original);
    for (const field of BREED_COMPACT_VISIBLE) {
      stats.comparedCells++;
      if (normalizeBreedWorkText(projected[field]) !==
          normalizeBreedWorkText(breedNotionScalar(page.properties?.[field]))) {
        stats.mismatchedCells++;
        issues.push({ code: "CONTENT_MISMATCH", id, field });
      }
    }
  }
  for (const id of oldById.keys()) {
    if (!seen.has(id)) issues.push({ code: "SOURCE_ID_NOT_IN_WORK", id });
  }
  if (new Set([...BREED_COMPACT_VISIBLE, ...BREED_COMPACT_HIDDEN]).size !== 109)
    issues.push({ code: "MANIFEST_SCHEMA_INVALID" });
  return {
    dataParity: issues.length === 0,
    // Metadata, publication, D1 mapping, and both automations have NOT cut over.
    productionCutoverReady: false,
    issues,
    stats,
    pending: [
      "D1 breed_notion_sync mapping: original page IDs must not be replaced blindly",
      "System fields absent from work copy: Slug, Stav, Sync stav, Sync chyba, URL Psipedia",
      "60-field parser/renderer and both-directional writeback",
      "Two editorial automations must switch at the same controlled cutover",
      "Production D1, publication, media and relationship readback before go-live",
    ],
  };
}
