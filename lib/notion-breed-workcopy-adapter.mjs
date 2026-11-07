/**
 * Pure, read-only parser for the standalone 60-field Notion breed work copy.
 *
 * The working database stores 23 legacy FCI/editorial values as labeled
 * subsections in 11 visible fields. This adapter exposes the original logical
 * fields again WITHOUT writing to Notion or changing production page IDs.
 *
 * It deliberately does not fabricate Slug, Stav, Sync stav, publication,
 * relations or D1 synchronization receipts. Those require a separate cutover.
 */
import {
  BREED_COMPACT_MERGE,
  BREED_COMPACT_HEADINGS,
} from "./breed-notion-compact-consolidation.mjs";

function plainText(property) {
  if (!property || typeof property !== "object") return "";
  if (property.type === "url") return property.url ?? "";
  if (property.type === "date") return property.date?.start ?? "";
  if (property.type === "number") return property.number == null ? "" : String(property.number);
  const parts = property.rich_text ?? property.title;
  return Array.isArray(parts) ? parts.map(p => p.plain_text ?? p.text?.content ?? "").join("") : "";
}

function richText(value) {
  const characters = Array.from(String(value ?? ""));
  const spans = [];
  for (let i = 0; i < characters.length; i += 1800) {
    const content = characters.slice(i, i + 1800).join("");
    spans.push({ type: "text", text: { content }, plain_text: content });
  }
  return { type: "rich_text", rich_text: spans };
}

function sourceProperty(name, value) {
  const str = String(value ?? "").trim();
  if (name === "FCI nomenklatúra URL") {
    const unwrapped = str.replace(/^\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)$/,
      (full, label, destination) => label === destination ? destination : full);
    if (unwrapped && !/^https?:\/\/\S+$/i.test(unwrapped)) return null;
    return { type: "url", url: unwrapped || null };
  }
  if (name === "Platnosť FCI štandardu") {
    if (str && !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    return { type: "date", date: str ? { start: str } : null };
  }
  return richText(str);
}

function sourceMarkers(target) {
  return Object.entries(BREED_COMPACT_MERGE)
    .filter(([, to]) => to === target)
    .map(([source]) => ({ source, label: BREED_COMPACT_HEADINGS[source] + ": " }));
}

/**
 * Return the original target text and independently labeled legacy parts.
 * Unknown prose is not discarded. Duplicate/empty labels are reported rather
 * than guessed or silently overwritten.
 */
export function splitBreedWorkCopyField(target, content) {
  const text = String(content ?? "");
  const labels = sourceMarkers(target);
  const found = [];
  const issues = [];
  for (const marker of labels) {
    const withSeparator = " — " + marker.label;
    let position = text.indexOf(withSeparator);
    let length = withSeparator.length;
    if (position < 0 && text.startsWith(marker.label)) {
      position = 0;
      length = marker.label.length;
    }
    if (position < 0) continue;
    if (text.indexOf(withSeparator, position + length) >= 0)
      issues.push({ target, source: marker.source, code: "DUPLICATE_LABELED_PART" });
    found.push({ ...marker, position, length });
  }
  found.sort((a, b) => a.position - b.position);
  const base = found.length ? text.slice(0, found[0].position).trimEnd() : text;
  const sources = {};
  for (let i = 0; i < found.length; i++) {
    const item = found[i];
    const end = found[i + 1]?.position ?? text.length;
    if (end < item.position + item.length) {
      issues.push({ target, source: item.source, code: "OVERLAPPING_LABELS" });
      continue;
    }
    const segment = text.slice(item.position + item.length, end).trim();
    if (!segment) {
      issues.push({ target, source: item.source, code: "EMPTY_LABELED_PART" });
      continue;
    }
    sources[item.source] = segment;
  }
  return { base, sources, issues };
}

/**
 * Expansion is a temporary logical view for future adapter tests, not a
 * production source switch. Missing legacy fields remain absent.
 */
export function expandBreed60WorkPage(page, options = {}) {
  const original = page?.properties ?? {};
  if (!original["Psipedia ID"] || !original["Zdrojový profil Notion"] ||
      original["Slug"] || original["Sync stav"]) {
    throw new Error("BREED_WORK_COPY_SCHEMA_OR_IDENTITY_INVALID");
  }
  const expanded = { ...original };
  const errors = [];
  const targets = [...new Set(Object.values(BREED_COMPACT_MERGE))]
    .filter(target => !options.onlyTargets || options.onlyTargets.has(target));
  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(original, target)) {
      errors.push({ target, code: "MERGE_TARGET_MISSING" });
      continue;
    }
    const { base, sources, issues } = splitBreedWorkCopyField(target, plainText(original[target]));
    errors.push(...issues);
    expanded[target] = richText(base);
    for (const [name, value] of Object.entries(sources)) {
      const property = sourceProperty(name, value);
      if (!property) {
        errors.push({ target, source: name, code: "LEGACY_VALUE_INVALID" });
        continue;
      }
      expanded[name] = property;
    }
  }
  // Preserve all 60 raw properties and two technical keys. Never construct
  // system fields or silently clear missing legacy fields.
  return { page: { ...page, properties: expanded }, errors };
}
