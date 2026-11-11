/**
 * Pure bridge between existing Admin field IDs and writeable properties in
 * the 90-column Notion breed database. Creates ONE property PATCH at a time.
 *
 * This does not call an API. The executor must verify identity and reread the
 * page immediately before applying it. Notion has no per-property CAS writes.
 */
import { breedWorkcopyPhysicalProperty, BREED_WORKCOPY_EDITORIAL_PROPERTIES } from "./breed-notion-workcopy-field-contract.mjs";

const editable = new Set(BREED_WORKCOPY_EDITORIAL_PROPERTIES);
const restricted = new Set(["FCI číslo"]);
const norm = s => String(s ?? "").replace(
  /\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g,
  (full, label, href) => label === href ? href : full,
).trim();

function readCell(property) {
  if (!property) return null;
  if (property.type === "number") return property.number;
  if (property.type === "checkbox") return property.checkbox === true;
  if (property.type === "url") return property.url ?? "";
  if (property.type === "rich_text" || property.type === "title") {
    const parts = property.type === "title" ? property.title : property.rich_text;
    return (parts ?? []).map(part =>
      part.plain_text ?? part.text?.content ?? "").join("");
  }
  return null;
}
function typedText(type, value) {
  if (type === "url") {
    // The 90-column source stores these fields as text. Never impose
    // URL validation on a free-text editorial value.
    if (typeof value !== "string") throw Error("BREED_WORKCOPY_TEXT_REQUIRED");
    return value;
  }
  if (type === "date") {
    if (typeof value !== "string" ||
      (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)))
      throw Error("BREED_WORKCOPY_DATE_INVALID");
    return value;
  }
  if ((type !== "text" && type !== "title") || typeof value !== "string")
    throw Error("BREED_WORKCOPY_TEXT_REQUIRED");
  return value;
}
const listFields = new Set(["healthRisks", "goodFor", "consider"]);
/**
 * The Notion editor keeps these user-facing lists in ordinary text
 * cells. Use the same semicolon format as the existing Notion breed parser.
 * Never silently coerce a malformed array into an empty Notion cell.
 */
function encodeStructuredValue(fieldId, value) {
  if (fieldId === "image") {
    // D1 stores local media paths; Notion requires absolute URL properties.
    return typeof value === "string" && value.startsWith("/")
      ? "https://psipedia.sk" + value : value;
  }
  if (fieldId === "gallery" || fieldId === "sports") {
    if (!Array.isArray(value)) throw Error("BREED_WORKCOPY_MEDIA_ARRAY_INVALID");
    return JSON.stringify(value);
  }
  if (listFields.has(fieldId)) {
    if (!Array.isArray(value) || !value.every(item =>
      typeof item === "string" && item.trim() && !item.includes(";")))
      throw Error("BREED_WORKCOPY_LIST_INVALID");
    return value.map(item => item.trim()).join("; ");
  }
  if (fieldId === "sources") {
    // Text rows are accepted verbatim; their URLs are optional editorial
    // content, never validation gates for another breed field.
    if (!Array.isArray(value) || !value.every(item => item &&
      typeof item.label === "string" && typeof item.url === "string"))
      throw Error("BREED_WORKCOPY_SOURCES_TYPE_INVALID");
    return value.map(item => item.label + (item.url ? " | " + item.url : ""))
      .join("\n");
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
  if (type === "title") return { title: textCell(typedText(type, value)).rich_text };
  throw Error("BREED_WORKCOPY_FIELD_TYPE_UNSUPPORTED");
}

/**
 * By default the last receipt is checked for existing offline callers.
 * For an authenticated, actively saved Admin field allowCurrentRemote makes
 * Admin the latest writer; page revision and readback are still mandatory.
 */
export function planBreedWorkCopyFieldWrite({
  schema, page, fieldId, value, baseline, expectedPageRevision,
  allowCurrentRemote = false,
}) {
  const entry = Array.isArray(schema) ?
    schema.find(spec => spec.mode === "content" && spec.id === fieldId) : null;
  if (!entry || (!allowCurrentRemote && baseline === undefined))
    throw Error("BREED_WORKCOPY_FIELD_OR_BASELINE_UNKNOWN");
  const property = breedWorkcopyPhysicalProperty(entry.notion);
  if (!property || !editable.has(property) || restricted.has(property))
    throw Error("BREED_WORKCOPY_FIELD_NOT_EDITABLE");
  if (!page?.properties || !Object.hasOwn(page.properties, property))
    throw Error("BREED_WORKCOPY_TARGET_MISSING");
  if (!expectedPageRevision || page.last_edited_time !== expectedPageRevision)
    throw Error("BREED_WORKCOPY_PAGE_REVISION_CHANGED");

  // Physical Notion properties are authoritative. Former URL fields were
  // migrated to ordinary rich_text, while numeric/select values are handled
  // by their separately typed field adapter.
  const physicalType = page.properties[property].type;
  const expectedType = entry.type === "text" ? "rich_text" : entry.type;
  if (physicalType !== expectedType &&
      !(entry.type === "url" && physicalType === "rich_text"))
    throw Error("BREED_WORKCOPY_PROPERTY_TYPE_MISMATCH");
  const type = physicalType === "rich_text" ? "text" : physicalType;

  const remote = readCell(page.properties[property]);
  const cellValue = encodeStructuredValue(fieldId, value);
  const cellBaseline = allowCurrentRemote ? remote : encodeStructuredValue(fieldId, baseline);
  const same = entry.type === "text" || entry.type === "title" || entry.type === "url"
    ? norm(remote) === norm(cellBaseline)
    : JSON.stringify(remote) === JSON.stringify(cellBaseline);
  if (!allowCurrentRemote && !same) throw Error("BREED_WORKCOPY_FIELD_CHANGED_IN_NOTION");
  const equal = entry.type === "text" || entry.type === "title" || entry.type === "url"
    ? norm(cellValue) === norm(remote)
    : JSON.stringify(cellValue) === JSON.stringify(remote);
  const next = directCell(entry.type, cellValue);
  return { fieldId, property, pageRevision: expectedPageRevision,
    changed: !equal, properties: equal ? {} : { [property]: next } };
}
