import Link from "next/link";
import type { AdminAutomationReliabilitySummary } from "@/lib/admin-automation-reliability";

type Props = {
  summary: AdminAutomationReliabilitySummary;
  refreshHref: string;
};

function checkedAtLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsed);
}

export function AdminAutomationAvailabilityState({ summary, refreshHref }: Props) {
  if (summary.status !== "PARTIAL" && summary.status !== "UNAVAILABLE") return null;

  const refs = summary.errorRefs.slice(0, 3);
  const remaining = Math.max(0, summary.errorRefs.length - refs.length);

  return (
    <section className="admin-panel" role="status" data-admin-automation-availability={summary.status}>
      <h2>{summary.status === "PARTIAL" ? "Časť údajov je dočasne nedostupná" : "Údaje sú dočasne nedostupné"}</h2>
      <p>
        {summary.status === "PARTIAL"
          ? "Dostupné časti stránky zostávajú použiteľné. Nedostupné údaje nezobrazujeme ako prázdny úspešný stav."
          : "Načítanie zlyhalo. Táto stránka nevykonala žiadnu zmenu dát."}
      </p>
      <p><strong>Čas kontroly:</strong> {checkedAtLabel(summary.checkedAt)}</p>
      {refs.length ? (
        <p>
          <strong>Referencia chyby:</strong>{" "}
          <code>{refs.join(", ")}{remaining ? ` (+${remaining})` : ""}</code>
        </p>
      ) : null}
      <p><Link href={refreshHref}>Obnoviť údaje</Link></p>
    </section>
  );
}
