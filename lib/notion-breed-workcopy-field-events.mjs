/**
 * The same event-driven contract as breeder profiles:
 * only signed Notion property IDs/names are eligible for an inbound update.
 * Merged work-copy cells can contain several logical FCI/editorial fields;
 * the per-field receipt still decides which of those actually changed.
 * Never infer edited fields from a whole-profile hash.
 */
import { breedWorkcopyPhysicalProperty } from "./breed-notion-workcopy-field-contract.mjs";
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
    const name = breedWorkcopyPhysicalProperty(entry.notion);
    if (!name) continue;
    const property = page.properties[name];
    if (!property) continue;
    if (updated.has(name) || (typeof property.id === "string" && updated.has(property.id)))
      found.push(entry.id);
  }
  return [...new Set(found)];
}

/** A signed, changed and present value may be blank: explicit clearing is valid. */
export function workCopyNonblankChangedFields({ allowed, changed, values, accepted }) {
  const touched = new Set(allowed);
  const changedSet = new Set(changed);
  return accepted.filter(field =>
    touched.has(field) && changedSet.has(field) &&
    Object.hasOwn(values, field) && values[field] !== undefined);
}

/** Admin saves a full entity locally, but sends only actually edited cells. */
export function workCopyAdminChangedFields(before, after, editable, requested) {
  const allow = new Set(editable);
  const submitted = requested === undefined ? null : new Set(requested);
  return editable.filter(field => allow.has(field) &&
    (!submitted || submitted.has(field)) &&
    JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}
