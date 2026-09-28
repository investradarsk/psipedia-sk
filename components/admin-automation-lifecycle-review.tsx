"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/admin-operations-ux.module.css";
import type { AutomationLifecycleSuggestion } from "@/lib/data-automation-lifecycle-store";

function entityTypeLabel(entityType: AutomationLifecycleSuggestion["entityType"]) {
  if (entityType === "EVENT") return "Podujatie";
  if (entityType === "ADOPTION") return "Adopcia";
  if (entityType === "FOSTER") return "Dočasná opatera";
  return "Stratené / nájdené";
}

export function AdminAutomationLifecycleReview({
  suggestions,
}: {
  suggestions: AutomationLifecycleSuggestion[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function decide(suggestion: AutomationLifecycleSuggestion, action: "accept" | "reject") {
    const question = action === "accept"
      ? `${suggestion.actionLabel}?`
      : `Zamietnuť tento návrh zmeny stavu pre ${suggestion.entityLabel}?`;
    if (!window.confirm(question)) return;

    setPendingId(suggestion.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/automation-lifecycle/${suggestion.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          expectedFingerprint: suggestion.fingerprint,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Zmenu stavu sa nepodarilo spracovať.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zmenu stavu sa nepodarilo spracovať.");
    } finally {
      setPendingId(null);
    }
  }

  if (!suggestions.length) {
    return <div className={styles.empty}>Momentálne nie sú žiadne otvorené návrhy zmien stavu.</div>;
  }

  return (
    <div className={styles.itemList}>
      {error ? <p role="alert">{error}</p> : null}
      {suggestions.map((suggestion) => (
        <article className={styles.itemCard} key={suggestion.id}>
          <div className={styles.itemMain}>
            <div className={styles.hubKicker}>{entityTypeLabel(suggestion.entityType)}</div>
            <h2>{suggestion.entityLabel}</h2>
            <div className={styles.reviewSummary}>
              <div>
                <span>Teraz</span>
                <strong>{suggestion.currentStateLabel}</strong>
              </div>
              <div>
                <span>Zdroj uvádza</span>
                <strong>{suggestion.evidenceText}</strong>
              </div>
              <div>
                <span>Navrhovaný stav</span>
                <strong>{suggestion.proposedStateLabel}</strong>
              </div>
              <div>
                <span>Zdroj</span>
                <strong>{suggestion.sourceLabel}</strong>
              </div>
            </div>
            {!suggestion.canApply
              ? <p>Aktuálny canonical stav nepovoľuje bezpečný priamy prechod. Otvor záznam a vyrieš ho manuálne.</p>
              : null}
            <details className={styles.advanced}>
              <summary>Pokročilé</summary>
              <div className={styles.advancedBody}>
                <div className={styles.techGrid}>
                  <div className={styles.techRow}><strong>Technický signál</strong><span>{suggestion.signalType}</span><span>finding #{suggestion.id}</span></div>
                  <div className={styles.techRow}><strong>Prvý záchyt</strong><span>{suggestion.firstDetectedAt}</span><span>{suggestion.lastDetectedAt}</span></div>
                  <div className={styles.techRow}><strong>Source record</strong><span>{suggestion.sourceRecordId}</span><span>{suggestion.fingerprint}</span></div>
                </div>
              </div>
            </details>
          </div>
          <div className={styles.actionStack}>
            {suggestion.canApply ? (
              <button
                className={styles.itemActionPrimary}
                type="button"
                disabled={pendingId === suggestion.id}
                aria-label={suggestion.actionLabel}
                onClick={() => void decide(suggestion, "accept")}
              >
                {pendingId === suggestion.id ? "Ukladám…" : "Potvrdiť zmenu"}
              </button>
            ) : null}
            <button
              className={styles.itemAction}
              type="button"
              disabled={pendingId === suggestion.id}
              aria-label={`Zamietnuť návrh zmeny stavu pre ${suggestion.entityLabel}`}
              onClick={() => void decide(suggestion, "reject")}
            >
              Zamietnuť
            </button>
            {suggestion.sourceUrl ? (
              <a className={styles.itemAction} href={suggestion.sourceUrl} target="_blank" rel="noreferrer noopener">
                Otvoriť zdroj ↗
              </a>
            ) : null}
            {suggestion.canonicalHref ? (
              <Link className={styles.itemAction} href={suggestion.canonicalHref}>
                Otvoriť canonical záznam
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
