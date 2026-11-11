/**
 * Prepare a 60-field Notion breed work-copy page for the EXISTING editorial
 * parser. Only the canonical D1 slug is synthesized to satisfy parser input;
 * system metadata is never fabricated or written to the work-copy database.
 *
 * No publication, identity, photo, SEO override, relationship, or D1 mapping
 * is ever updated by this function. The caller must keep those Admin-owned.
 */
import { expandBreed60WorkPage } from "./notion-breed-workcopy-adapter.mjs";

function plain(p) {
  if (p?.type === "number") return p.number == null ? "" : String(p.number);
  const items = p?.rich_text ?? p?.title;
  return Array.isArray(items)
    ? items.map(x => x.plain_text ?? x.text?.content ?? "").join("").trim()
    : "";
}
function textProperty(text) {
  return { type: "rich_text", rich_text: [{
    type: "text", plain_text: text, text: { content: text },
  }] };
}
export function materializeBreedWorkCopyForRead(workPage, canonical, options) {
  if (!canonical || !Number.isSafeInteger(Number(canonical.id)) ||
    !/^[a-z0-9-]{2,90}$/.test(String(canonical.slug ?? ""))) {
    throw Error("BREED_WORKCOPY_CANONICAL_IDENTITY_MISSING");
  }
  const storedId = plain(workPage?.properties?.["Psipedia ID"]);
  // Match ONLY on the immutable Psipedia ID. The FCI number is an editable
  // numeric fact and must not prevent a different signed field from syncing.
  if (storedId !== String(canonical.id)) {
    throw Error("BREED_WORKCOPY_PSI_ID_MISMATCH");
  }
  const projection = expandBreed60WorkPage(workPage, options);
  // Operational single-field events can isolate a malformed labeled part.
  // Complete preflight and baseline calls remain STRICT by default.
  if (projection.errors.length && options?.allowPartial !== true) {
    return { valid: false, errors: projection.errors, page: null };
  }
  const properties = {
    ...projection.page.properties,
    // Virtual ONLY: the new Notion database has no Slug property.
    "Slug": textProperty(canonical.slug),
  };
  return {
    valid: true,
    errors: projection.errors,
    page: { ...projection.page, properties },
    // Never confuse a derived field with a real editable work-copy cell.
    sourcePropertyNames: Object.keys(workPage.properties ?? {}),
    derivedPropertyNames: Object.keys(properties)
      .filter(field => !(field in (workPage.properties ?? {}))),
    // Guardrail for future callers: the synthetic page is read-only.
    writebackAllowed: false,
  };
}
