import Link from "next/link";
import type { AutomationDraftDuplicateWarning } from "@/lib/data-automation-store";

export function AdminAutomationDraftWarning({ warning }: { warning: AutomationDraftDuplicateWarning | null }) {
  if (!warning) return null;
  return (
    <section className="admin-panel" aria-label="Upozornenie na možnú duplicitu">
      <p role="alert"><strong>⚠️ Možná duplicita</strong></p>
      <p>Automatizácia vytvorila tento koncept aj napriek neistej zhode. Pred publikovaním porovnaj podobný existujúci záznam.</p>
      {warning.candidates.length > 0 && (
        <p>
          {warning.candidates.map((candidate, index) => (
            <span key={candidate.id}>
              {index > 0 ? " · " : ""}
              {candidate.href ? <Link href={candidate.href}>Zobraziť podobný záznam #{candidate.id}</Link> : <>Podobný záznam #{candidate.id}</>}
            </span>
          ))}
        </p>
      )}
      {warning.sourceUrl && <p><a href={warning.sourceUrl} target="_blank" rel="noreferrer">Otvoriť pôvodný zdroj ↗</a></p>}
    </section>
  );
}
