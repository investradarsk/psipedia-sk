/**
 * Pure bridge between existing Admin field IDs and writeable properties in
 * the 60+2 Notion breed database. Creates ONE property PATCH at a time.
 *
 * This does not call an API. The executor must verify identity and reread the
 * page immediately before applying it. Notion has no per-property CAS writes.
 */
import {
  BREED_COMPACT_VISIBLE, BREED_COMPACT_MERGE,
} from "./breed-notion-compact-consolidation.mjs";
import {
  splitBreedWorkCopyField,
} from "./notion-breed-workcopy-adapter.mjs";
import {
  planBreedWorkCopyMergedFieldPatch,
} from "./notion-breed-workcopy-field-patch.mjs";

const editable = new Set(BREED_COMPACT_VISIBLE);
const mergedTargets = new Set(Object.values(BREED_COMPACT_MERGE));
const restricted = new Set(["Názov", "FCI číslo", "Hlavný obrázok URL", "Galéria JSON"]);
const norm = s => String(s ?? "").replace(
  /\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g,
  (full, label, href) => label === href ? href : full,
).trim();

function readCell(property) {
  if (!property) return null;
  if (property.type === "number") return property.number;
  if (property.type === "checkbox") return property.checkbox === true;
  if (property.type === "url") return property.url ?? "";
  if (property.type === "rich_text") {
    return (property.rich_text ?? []).map(part =>
      part.plain_text ?? part.text?.content ?? "").join("");
  }
  return null;
}
function typedText(type, value) {
  if (type === "url") {
    if (typeof value !== "string" ||
      (value && !/^https?:\/\/\S+$/i.test(value)))
      throw Error("BREED_WORKCOPY_URL_INVALID");
    return value;
  }
  if (type === "date") {
    if (typeof value !== "string" ||
      (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)))
      throw Error("BREED_WORKCOPY_DATE_INVALID");
    return value;
  }
  if (type !== "text" || typeof value !== "string")
    throw Error("BREED_WORKCOPY_TEXT_REQUIRED");
  return value;
}
const listFields = new Set(["healthRisks", "goodFor", "consider"]);
/**
 * The compact Notion model keeps these user-facing lists in ordinary text
 * cells. Use the same semicolon format as the existing Notion breed parser.
 * Never silently coerce a malformed array into an empty Notion cell.
 */
function encodeStructuredValue(fieldId, value) {
  if (listFields.has(fieldId)) {
    if (!Array.isArray(value) || !value.every(item =>
      typeof item === "string" && item.trim() && !item.includes(";")))
      throw Error("BREED_WORKCOPY_LIST_INVALID");
    return value.map(item => item.trim()).join("; ");
  }
  if (fieldId === "sources") {
    if (!Array.isArray(value) || !value.every(item =>
      item && typeof item === "object" &&
      typeof item.label === "string" && typeof item.url === "string" &&
      !item.label.includes(";") && !item.url.includes(";") &&
      /^https?:\/\/\S+$/i.test(item.url)))
      throw Error("BREED_WORKCOPY_SOURCES_INVALID");
    return value.map(item => item.label + "|" + item.url).join("; ");
  }
  return value;
}
function textCell(value) {
  const chars = Array.from(value);
  if (chars.length > 180000) throw Error("BREED_WORKCOPY_TEXT_TOO_LONG");
  const parts = [];
  for (let at = 0; at < chars.length; at += 1800) {
    parts.push({ type: "text", text: { content: chars.slice(at, at + 1800).join("") } });
  }
  return { rich_text: parts };
}
function directCell(type, value) {
  if (type === "number") {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value)))
      throw Error("BREED_WORKCOPY_NUMBER_INVALID");
    return { number: value };
  }
  if (type === "checkbox") {
    if (typeof value !== "boolean") throw Error("BREED_WORKCOPY_CHECKBOX_INVALID");
    return { checkbox: value };
  }
  if (type === "url") return { url: typedText(type, value) || null };
  if (type === "text") return textCell(typedText(type, value));
  throw Error("BREED_WORKCOPY_FIELD_TYPE_UNSUPPORTED");
}

/**
 * baseline is the LAST ACKNOWLEDGED logical value (not the containing field).
 * An intervening Notion edit to the same field blocks Admin overwrite.
 */
export function planBreedWorkCopyFieldWrite({
  schema, page, fieldId, value, baseline, expectedPageRevision,
}) {
  const entry = Array.isArray(schema) ?
    schema.find(spec => spec.mode === "content" && spec.id === fieldId) : null;
  if (!entry || baseline === undefined) throw Error("BREED_WORKCOPY_FIELD_OR_BASELINE_UNKNOWN");
  const property = BREED_COMPACT_MERGE[entry.notion] ?? entry.notion;
  if (!editable.has(property) || restricted.has(property))
    throw Error("BREED_WORKCOPY_FIELD_NOT_EDITABLE");
  if (!page?.properties || !Object.hasOwn(page.properties, property))
    throw Error("BREED_WORKCOPY_TARGET_MISSING");
  if (!expectedPageRevision || page.last_edited_time !== expectedPageRevision)
    throw Error("BREED_WORKCOPY_PAGE_REVISION_CHANGED");

  if (mergedTargets.has(property)) {
    const raw = readCell(page.properties[property]);
    if (typeof raw !== "string")
      throw Error("BREED_WORKCOPY_MERGED_TEXT_INVALID");
    const sections = splitBreedWorkCopyField(property, raw);
    if (sections.issues.length)
      throw Error("BREED_WORKCOPY_MERGED_TEXT_INVALID");
    const remote = entry.notion === property ? sections.base : sections.sources[entry.notion] ?? "";
    if (norm(remote) !== norm(baseline))
      throw Error("BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION");
    const next = planBreedWorkCopyMergedFieldPatch({
      target: property, field: entry.notion,
      currentText: raw, expectedText: raw, newValue: typedText(entry.type, value),
    });
    return { fieldId, property, pageRevision: expectedPageRevision,
      changed: next.changed, properties: next.properties, nextText: next.nextText };
  }

  const remote = readCell(page.properties[property]);
  const cellValue = encodeStructuredValue(fieldId, value);
  const cellBaseline = encodeStructuredValue(fieldId, baseline);
  const same = entry.type === "text" || entry.type === "url"
    ? norm(remote) === norm(cellBaseline)
    : JSON.stringify(remote) === JSON.stringify(cellBaseline);
  if (!same) throw Error("BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION");
  const equal = entry.type === "text" || entry.type === "url"
    ? norm(cellValue) === norm(remote)
    : JSON.stringify(cellValue) === JSON.stringify(remote);
  const next = directCell(entry.type, cellValue);
  return { fieldId, property, pageRevision: expectedPageRevision,
    changed: !equal, properties: equal ? {} : { [property]: next } };
}
