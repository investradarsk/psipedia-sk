/**
 * Read-only compatibility during gradual Notion 109 -> 60 field consolidation.
 *
 * Until every public profile, Admin adapter and FCI subfield is cut over,
 * previously rendered legacy fields remain the canonical presentation.
 * If a future migration copies the same text into a retained field, strip
 * ONLY the appended, uniquely labeled suffix from public rendering so
 * readers do not see duplicate FCI details or editorial tips.
 *
 * This never edits the stored data. Remove only in the atomic final cutover.
 */
export const STAGED_BREED_MERGE_HEADINGS = [
  "Chov podľa FCI",
  "Chvost podľa FCI",
  "Historický súhrn podľa FCI",
  "Koža podľa FCI",
  "Krk podľa FCI",
  "FCI nomenklatúra – zdroj",
  "Oči podľa FCI",
  "Názov sekcie FCI",
  "Číslo sekcie FCI",
  "Názov skupiny FCI",
  "Stav plemena podľa FCI",
  "Tvárová časť podľa FCI",
  "Uši podľa FCI",
  "Veľkosť a hmotnosť podľa FCI",
  "Pôvodné využitie podľa FCI",
  "Dátum platnosti štandardu FCI",
  "Každodenné potreby",
  "Pracovná skúška",
  "Praktický tip k pohybu",
  "Praktický tip k srsti",
  "Praktický tip k výcviku",
  "Praktický tip k zdraviu",
  "Kategória plemena"
] as const;

const STAGED_MARKERS = STAGED_BREED_MERGE_HEADINGS.map(
  (heading) => " — " + heading + ": ",
);

export function stripStagedBreedMerge(
  value: string | null | undefined,
): string {
  if (!value) return "";
  let end = value.length;
  for (const marker of STAGED_MARKERS) {
    const index = value.indexOf(marker);
    if (index >= 0 && index < end) end = index;
  }
  return end === value.length ? value : value.slice(0, end).trimEnd();
}
