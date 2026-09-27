import type { CanonicalDraftFlag } from "@/lib/canonical-draft-flags";

export function AdminAutomationDraftWarning({ warning }: { warning: CanonicalDraftFlag | null }) {
  if (!warning) return null;
  return (
    <section className="admin-panel" aria-label="Upozornenie na možnú duplicitu">
      <p role="alert"><strong>⚠️ Možná duplicita</strong></p>
      <p>Automatizácia vytvorila tento koncept aj napriek neistej zhode. Pred publikovaním porovnaj podobný existujúci záznam.</p>
      {warning.details.candidateIds.length > 0 && (
        <p>{warning.details.candidateIds.map((id) => `Podobný záznam #${id}`).join(" · ")}</p>
      )}
      {warning.details.sourceUrl && <p><a href={warning.details.sourceUrl} target="_blank" rel="noreferrer">Otvoriť pôvodný zdroj ↗</a></p>}
    </section>
  );
}
