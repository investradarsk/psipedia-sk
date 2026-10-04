"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AutomationSourceAdminRow,
  AutomationSourceCandidateRow,
} from "@/lib/data-automation-source-store";
import { automationSourceDomain } from "@/lib/admin-automation-presentation";
import { candidateProvisioningConfigFor } from "@/lib/data-automation-source-provisioning";
import {
  automationSourceReadiness,
  type AutomationSourceReadiness,
} from "@/lib/data-automation-capability-registry";
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

function sourceShapeLabel(readiness: AutomationSourceReadiness) {
  if (readiness.sourceShape === "SINGLE_ITEM") return "Detail jednej položky";
  if (readiness.sourceShape === "MULTI_ITEM_LIST") return "Zoznam položiek";
  if (readiness.sourceShape === "SOURCE_DEFINED") return "Štruktúrovaný zdroj";
  return "Neurčené";
}

function readinessLabel(readiness: AutomationSourceReadiness) {
  if (readiness.ready) return "Pripravený";
  if (readiness.reason === "UNSUPPORTED_CONNECTOR") return "Nepodporovaný typ zdroja";
  return "Chýba spoľahlivý spôsob automatického čítania";
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
    activation: { enabled: boolean; blockedReason: string | null } | null;
  } | null>(null);
  const readiness = automationSourceReadiness(existingSource ?? {
    entityType: candidate.entityType,
    connectorType: candidate.suggestedConnectorType,
    sourceUrl: candidate.canonicalUrl,
    config: candidateProvisioningConfigFor({
      entityType: candidate.entityType,
      canonicalUrl: candidate.canonicalUrl,
      metadata: candidate.metadata,
    }),
  });

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
        activation?: { enabled: boolean; blockedReason: string | null } | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Rozhodnutie sa nepodarilo uložiť.");

      if (action === "approve") {
        const result = {
          source: payload.source ?? null,
          preview: payload.preview ?? null,
          activation: payload.activation ?? null,
        };
        setApprovalResult(result);
        const reuseCopy = existingSource && result.source?.id === existingSource.id
          ? "Tento web už máme ako zdroj: " + existingSource.label + ". "
          : "";
        const testCopy = result.activation?.enabled
          ? "Zdroj je schválený a Psipedia ho bude kontrolovať automaticky."
          : result.preview?.ok
            ? "Zdroj je schválený. Sledovanie je bezpečne pozastavené, kým technická bezpečnostná kontrola nepovolí aktiváciu."
            : "Zdroj je schválený, ale potrebuje technické nastavenie. Sledovanie zostáva bezpečne pozastavené.";
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

        <p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Otvoriť nájdený web ↗</a></p>

        {existingSource && (
          <div className={styles.reviewReason}>
            <span>Tento web už máme ako zdroj</span>
            <p><strong>{existingSource.label}</strong> používa túto doménu pre rovnaký typ obsahu. Schválenie nevytvorí duplicitný generický zdroj.</p>
            <p><Link href={"/admin/automatizacie/zdroje/" + existingSource.id}>Pokračovať s týmto zdrojom →</Link></p>
          </div>
        )}
      </section>

      {readiness.applicable && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Bezpečnostná kontrola</h2>
              <p>{readiness.ready
                ? "Psipedia tento typ zdroja pozná a vie ho bezpečne otestovať."
                : "Tento zdroj zatiaľ nevieme spoľahlivo automaticky čítať. Kým nebude pripravený, zostane vypnutý."}</p>
            </div>
            <span className={[styles.badge, readiness.ready ? styles.badgeGood : styles.badgeWarning].join(" ")}>
              {readiness.ready ? "V poriadku" : "Vyžaduje technickú kontrolu"}
            </span>
          </div>
          {!readiness.ready && <p><strong>Monitoring nie je možné zapnúť.</strong> Bezpečnostné guardy zostávajú autoritatívne.</p>}
          <details className={styles.advanced}>
            <summary>Pokročilé — technická pripravenosť</summary>
            <div className={styles.advancedBody}>
              <div className={styles.reviewSummary}>
                <div><span>Typ zdroja</span><strong>{sourceShapeLabel(readiness)}</strong></div>
                <div><span>Pripravenosť</span><strong>{readinessLabel(readiness)}</strong></div>
                <div><span>Adapter</span><strong>{readiness.adapterLabel ?? "Nie je priradený"}</strong></div>
              </div>
              <p><strong>Dôvod:</strong> {readiness.reason}</p>
              <p><strong>Adapter key:</strong> {readiness.adapterKey ?? "—"}</p>
            </div>
          </details>
        </section>
      )}



      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Rozhodnutie</h2>
            <p>{existingSource
              ? "ÁNO znamená, že Psipedia má tento zdroj používať. Existujúci zdroj sa znovu využije."
              : "ÁNO znamená, že Psipedia má tento zdroj používať. Technické bezpečnostné kontroly zostávajú pod kapotou."}</p>
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
            <button className="is-primary" type="button" disabled={busy} onClick={() => void review("approve")}>ÁNO — používať</button>
            <button className="is-danger" type="button" disabled={busy} onClick={() => void review("reject")}>NIE — nepoužívať</button>
            <details className={styles.advanced}><summary>Ďalšie možnosti</summary><div className={styles.advancedBody}><button type="button" disabled={busy} onClick={() => void review("suppress")}>Odložiť 30 dní</button></div></details>
          </div>
        ) : (
          <p>Tento návrh už bol vybavený. <Link href={"/admin/automatizacie/" + categorySlug}>Späť na kategóriu →</Link></p>
        )}
      </section>

      {approvalResult && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}>
            <div>
              <h2>{approvalResult.activation?.enabled ? "Zdroj sa používa" : "Zdroj je schválený"}</h2>
              <p>{approvalResult.activation?.enabled
                ? "Psipedia ho bude kontrolovať automaticky. Nájdený obsah sa vytvorí ako koncept v príslušnej admin sekcii."
                : "Sledovanie zatiaľ zostáva bezpečne pozastavené. Bežný používateľ nemusí skladať technické kroky."}</p>
            </div>
          </div>
          {approvalResult.preview?.ok && <p><strong>Našlo sa {approvalResult.preview.recordsFound} položiek.</strong></p>}
          {approvalResult.source && !approvalResult.activation?.enabled && <p><Link href={"/admin/automatizacie/zdroje/" + approvalResult.source.id}>Pokročilé: technický stav zdroja →</Link></p>}
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
            <div className={styles.techRow}><strong>Discovery reason</strong><span>{candidate.reason || "—"}</span><span>candidate lifecycle {candidate.lifecycle}</span></div>
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
