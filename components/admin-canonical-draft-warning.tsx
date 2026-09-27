import type { CanonicalDraftDuplicateWarning } from "@/lib/canonical-draft-flags";

export function AdminCanonicalDraftWarning({ warning }: { warning: CanonicalDraftDuplicateWarning | null }) {
  if (!warning) return null;
  return (
    <section className="admin-panel" aria-label="Upozornenie na možnú duplicitu">
      <p role="alert"><strong>⚠️ Možná duplicita</strong></p>
      <p>Tento koncept má review flag možnej duplicity. Pred publikovaním porovnaj podobný existujúci záznam.</p>
      {warning.candidates.length > 0 && (
        <p>{warning.candidates.map((candidate) => `Podobný záznam #${candidate.id}`).join(" · ")}</p>
      )}
      {warning.sourceUrl && <p><a href={warning.sourceUrl} target="_blank" rel="noreferrer">Otvoriť pôvodný zdroj ↗</a></p>}
    </section>
  );
}
