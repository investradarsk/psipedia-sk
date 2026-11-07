/**
 * The same event-driven contract as breeder profiles:
 * only signed Notion property IDs/names are eligible for an inbound update.
 * Merged work-copy cells can contain several logical FCI/editorial fields;
 * the per-field receipt still decides which of those actually changed.
 * Never infer edited fields from a whole-profile hash.
 */
import { BREED_COMPACT_MERGE, BREED_COMPACT_VISIBLE } from "./breed-notion-compact-consolidation.mjs";
const visible = new Set(BREED_COMPACT_VISIBLE);
const restricted = new Set([
  "image", "gallery", "relatedBreedIds", "relatedArticleIds",
  "directoryProfileIds", "sports", "fciStandard", "editorial",
]);

export function workCopyChangedEditorialIds(page, changedProperties, schema) {
  if (!Array.isArray(changedProperties) || !changedProperties.length ||
      !Array.isArray(schema) || !page?.properties) return [];
  const updated = new Set(changedProperties.filter(x => typeof x === "string"));
  const found = [];
  for (const entry of schema) {
    if (entry.mode !== "content" || restricted.has(entry.id)) continue;
    const name = BREED_COMPACT_MERGE[entry.notion] ?? entry.notion;
    if (!visible.has(name)) continue;
    const property = page.properties[name];
    if (!property) continue;
    if (updated.has(name) || (typeof property.id === "string" && updated.has(property.id)))
      found.push(entry.id);
  }
  return [...new Set(found)];
}

/** Never treat a blank Notion field as a request to erase existing content. */
export function workCopyNonblankChangedFields({ allowed, changed, values, accepted }) {
  const touched = new Set(allowed);
  const changedSet = new Set(changed);
  return accepted.filter(field =>
    touched.has(field) && changedSet.has(field) &&
    values[field] !== null && values[field] !== undefined &&
    !(typeof values[field] === "string" && !values[field].trim()) &&
    !(Array.isArray(values[field]) && values[field].length === 0));
}

/** Admin saves a full entity locally, but sends only actually edited cells. */
export function workCopyAdminChangedFields(before, after, editable, requested) {
  const allow = new Set(editable);
  const submitted = requested === undefined ? null : new Set(requested);
  return editable.filter(field => allow.has(field) &&
    (!submitted || submitted.has(field)) &&
    JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}
