"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AutomationSourceAdminRow,
  AutomationSourceCandidateRow,
} from "@/lib/data-automation-source-store";
import { automationSourceDomain } from "@/lib/admin-automation-presentation";
import styles from "./admin-operations-ux.module.css";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function reviewLabel(status: AutomationSourceCandidateRow["reviewStatus"]) {
  if (status === "APPROVED") return "Schválený";
  if (status === "REJECTED") return "Zamietnutý";
  if (status === "SUPPRESSED") return "Odložený";
  return "Čaká na rozhodnutie";
}

type CandidateApprovalPreview = {
  ok: boolean;
  recordsFound: number;
  errorDetails: Array<{ code: string; detail: string }>;
  writes: { observations: number; findings: number; canonical: number; publications: number };
};

export function AdminAutomationCandidateReview({
  candidate,
  categorySlug,
  existingSource,
}: {
  candidate: AutomationSourceCandidateRow;
  categorySlug: string;
  existingSource: AutomationSourceAdminRow | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(candidate.reviewerNotes ?? "");
  const [message, setMessage] = useState("");
  const [approvalResult, setApprovalResult] = useState<{
    source: AutomationSourceAdminRow | null;
    preview: CandidateApprovalPreview | null;
  } | null>(null);

  async function review(action: "approve" | "reject" | "suppress") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-source-candidates/" + candidate.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          notes,
          suppressedDays: 30,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        source?: AutomationSourceAdminRow | null;
        preview?: CandidateApprovalPreview | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Rozhodnutie sa nepodarilo uložiť.");

      if (action === "approve") {
        const result = { source: payload.source ?? null, preview: payload.preview ?? null };
        setApprovalResult(result);
        const reuseCopy = existingSource && result.source?.id === existingSource.id
          ? "Tento web už máme ako zdroj: " + existingSource.label + ". "
          : "";
        const testCopy = result.preview?.ok
          ? "Zdroj funguje — našlo sa " + result.preview.recordsFound + " položiek."
          : "Zdroj potrebuje technické nastavenie pred zapnutím monitoringu.";
        setMessage(reuseCopy + testCopy);
      } else {
        setMessage(action === "reject"
          ? "Návrh zdroja bol zamietnutý."
          : "Návrh zdroja bol odložený na 30 dní.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      <section className={[styles.statusHero, candidate.reviewStatus === "NEW" ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div>
          <strong>{reviewLabel(candidate.reviewStatus)}</strong>
          <p>{automationSourceDomain(candidate.sourceUrl)} · nájdené {formatDate(candidate.firstDetectedAt)}</p>
        </div>
        <div className={styles.badges}>
          <span className={[styles.badge, candidate.lifecycle === "ACTIVE" ? styles.badgeGood : styles.badgeWarning].join(" ")}>
            {candidate.lifecycle === "ACTIVE" ? "Aktuálny návrh" : candidate.lifecycle}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Nájdený zdroj</h2>
            <p>Skontroluj, či tento web patrí medzi zdroje, ktoré má Psipedia sledovať pre danú kategóriu.</p>
          </div>
        </div>

        <div className={styles.reviewSummary}>
          <div><span>Názov</span><strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong></div>
          <div><span>Doména</span><strong>{automationSourceDomain(candidate.sourceUrl)}</strong></div>
          <div><span>Nájdené</span><strong>{formatDate(candidate.firstDetectedAt)}</strong></div>
          <div><span>Naposledy potvrdené</span><strong>{formatDate(candidate.lastSeenAt)}</strong></div>
        </div>

        <div className={styles.reviewReason}>
          <span>Prečo bol zdroj navrhnutý</span>
          <p>{candidate.reason || "Bez doplňujúceho vysvetlenia."}</p>
        </div>

        <p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Otvoriť nájdený web ↗</a></p>

        {existingSource && (
          <div className={styles.reviewReason}>
            <span>Tento web už máme ako zdroj</span>
            <p><strong>{existingSource.label}</strong> používa túto doménu pre rovnaký typ obsahu. Schválenie nevytvorí duplicitný generický zdroj.</p>
            <p><Link href={"/admin/automatizacie/zdroje/" + existingSource.id}>Pokračovať s týmto zdrojom →</Link></p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Rozhodnutie</h2>
            <p>{existingSource
              ? "Schválenie použije existujúci zdroj a bezpečne ho otestuje. Monitoring sa tým automaticky nezapne."
              : "Schválenie pripraví vypnutý zdroj. Ak ešte nemá bezpečné technické nastavenie, zostane čakať na konfiguráciu."}</p>
          </div>
        </div>

        <label className="admin-field">
          <span>Interná poznámka</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Voliteľné: prečo zdroj schvaľuješ, zamietaš alebo odkladáš…"
            disabled={candidate.reviewStatus !== "NEW" || busy}
          />
        </label>

        {candidate.reviewStatus === "NEW" ? (
          <div className="admin-form-actions">
            <button className="is-primary" type="button" disabled={busy} onClick={() => void review("approve")}>Schváliť</button>
            <button className="is-danger" type="button" disabled={busy} onClick={() => void review("reject")}>Zamietnuť</button>
            <button type="button" disabled={busy} onClick={() => void review("suppress")}>Odložiť 30 dní</button>
          </div>
        ) : (
          <p>Tento návrh už bol vybavený. <Link href={"/admin/automatizacie/" + categorySlug}>Späť na kategóriu →</Link></p>
        )}
      </section>

      {approvalResult && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}>
            <div>
              <h2>{approvalResult.preview?.ok ? "Zdroj funguje" : "Zdroj potrebuje technické nastavenie"}</h2>
              <p>{approvalResult.preview?.ok
                ? "Read-only test prešiel a nič sa nezapísalo ani nezverejnilo."
                : "Zdroj zostáva vypnutý. Technický detail je dostupný pod Pokročilé."}</p>
            </div>
          </div>
          {approvalResult.preview?.ok && <p><strong>Našlo sa {approvalResult.preview.recordsFound} položiek.</strong></p>}
          {approvalResult.source && <p><Link href={"/admin/automatizacie/zdroje/" + approvalResult.source.id}>Otvoriť zdroj a pokračovať →</Link></p>}
          {approvalResult.preview && approvalResult.preview.errorDetails.length > 0 && (
            <details className={styles.advanced}>
              <summary>Pokročilé — technický výsledok testu</summary>
              <div className={styles.advancedBody}>
                {approvalResult.preview.errorDetails.map((item) => <p key={item.code}><strong>{item.code}</strong>: {item.detail}</p>)}
                <p>Writes: observations {approvalResult.preview.writes.observations}, findings {approvalResult.preview.writes.findings}, canonical {approvalResult.preview.writes.canonical}, publications {approvalResult.preview.writes.publications}.</p>
              </div>
            </details>
          )}
        </section>
      )}

      <details className={styles.advanced}>
        <summary>Pokročilé / technické údaje</summary>
        <div className={styles.advancedBody}>
          <div className={styles.techGrid}>
            <div className={styles.techRow}><strong>Candidate</strong><span>#{candidate.id} · {candidate.entityType}</span><span>{candidate.discoveryType}</span></div>
            <div className={styles.techRow}><strong>Suggested connector</strong><span>{candidate.suggestedConnectorType}</span><span>{candidate.evidencePathCount} discovery paths · {candidate.freshEvidencePathCount} fresh</span></div>
            <div className={styles.techRow}><strong>Canonical URL</strong><span>{candidate.canonicalUrl}</span><span>duplicate source {candidate.duplicateSourceId ?? "—"}</span></div>
          </div>
          <details className={styles.advanced}>
            <summary>Metadata JSON</summary>
            <div className={styles.advancedBody}><pre className={styles.codeBlock}>{JSON.stringify(candidate.metadata, null, 2)}</pre></div>
          </details>
        </div>
      </details>
    </>
  );
}
