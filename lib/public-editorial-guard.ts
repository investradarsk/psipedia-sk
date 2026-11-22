/**
 * Public editorial hygiene: the Notion body may contain private publishing notes
 * after the reader-facing article. Keep these headings out of public rendering and
 * out of future Notion article imports. Never mutate persisted source blocks here.
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
  return /^(?:fotografia a licencia|socialne siete(?:\s*-\s*interny navrh)?|redakcne poznamky|redakcne prvky pre administraciu|redakcne prvky pre psipedia admin|psipedia bloky)$/.test(heading);
}

/** A legacy breed sport note can combine a valid note with an unpublished review directive. */
export function isInternalBreedSportNote(value: string): boolean {
  const note = normalizedEditorialText(value);
  return /\b(?:redakcne hodnotenie|redakcna kontrola|redakcny audit|finalny audit|finalne overit|finalna kontrola|pred publikovanim|overit pred publikovanim|overit zdroje)\b/.test(note);
}
