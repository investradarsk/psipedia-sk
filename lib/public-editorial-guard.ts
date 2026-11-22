/**
 * Shared boundary between publishable article content and Notion-only work notes.
 * Photo license attribution is handled separately: it must never disappear
 * unless the public article has an equivalent image-credit field.
 */
function normalizedEditorialText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim().replace(/[:.]+$/, "");
}

export function isPrivateEditorialArticleHeading(value: string): boolean {
  const heading = normalizedEditorialText(value);
  return /^(?:psipedia bloky|pred publikovanim|synchronizacny manifest(?: psipedia bloky)?|socialne siete\s*-\s*(?:interny|redakcny) navrh|redakcne (?:poznamky|pokyny|podklady|instrukcie)(?:\s*-.*)?|redakcne prvky pre (?:administraciu|psipedia admin)|interne redakcne poznamky|technicke poznamky pre administraciu)$/.test(heading);
}

export function isPhotoAttributionHeading(value: string): boolean {
  const heading = normalizedEditorialText(value);
  return heading === "fotografia a licencia" || heading === "fotografia - licencia";
}

/** Prevent unpublished review directives in old breed-sport notes from leaking. */
export function isInternalBreedSportNote(value: string): boolean {
  const note = normalizedEditorialText(value);
  return /\b(?:redakcne hodnotenie|redakcna kontrola|redakcny audit|finalny audit|finalne overit|finalna kontrola|pred publikovanim|overit pred publikovanim|overit zdroje)\b/.test(note);
}
