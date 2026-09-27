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
  automationHelpSourceReadiness,
  isAutomationHelpEntityType,
  type AutomationHelpSourceReadiness,
} from "@/lib/data-automation-help-source-readiness";
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

function helpShapeLabel(readiness: AutomationHelpSourceReadiness) {
  if (readiness.sourceShape === "SINGLE_ITEM") return "Detail jednej položky";
  if (readiness.sourceShape === "MULTI_ITEM_LIST") return "Zoznam položiek";
  return "Neurčené";
}

function helpReadinessLabel(readiness: AutomationHelpSourceReadiness) {
  if (readiness.ready) return "Pripravený";
  if (readiness.reason === "UNSUPPORTED_SOURCE") return "Nepodporovaný typ zdroja";
  return "Potrebuje podporovaný adapter";
}

type CandidateApprovalPreview = {
  ok: boolean;
  recordsFound: number;
  errorDetails: Array<{ code: string; detail: string }>;
  writes: { observations: number; findings: number; canonical: number; publications: number };
};

type OrganizationConceptResult = {
  candidateId: number;
  outcome: "NEW_ORGANIZATION" | "EXISTING_ORGANIZATION" | "POSSIBLE_MATCH" | "INSUFFICIENT_EVIDENCE";
  proposed: Record<string, unknown>;
  provenance: Array<{
    field: string;
    sourceUrl: string;
    evidenceId: number | null;
    evidenceKind: "TAVILY" | "OFFICIAL_SITE";
    confidence: "HIGH" | "MEDIUM";
    reason: string;
  }>;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  matchQuality: string;
  matchReason: string;
  findingId: number | null;
  sourceId: number;
  sourceStatus: {
    enabled: boolean;
    reviewStatus: string;
    connectorType: string;
  };
};

function conceptOutcomeLabel(value: OrganizationConceptResult["outcome"]) {
  if (value === "NEW_ORGANIZATION") return "Nová organizácia";
  if (value === "EXISTING_ORGANIZATION") return "Navrhovaná zmena existujúcej organizácie";
  if (value === "POSSIBLE_MATCH") return "Možná zhoda — vyžaduje rozhodnutie identity";
  return "Nedostatok dôkazov";
}

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
  const [organizationConcept, setOrganizationConcept] = useState<OrganizationConceptResult | null>(null);
  const helpReadiness = isAutomationHelpEntityType(candidate.entityType)
    ? automationHelpSourceReadiness(existingSource ?? {
      entityType: candidate.entityType,
      connectorType: candidate.suggestedConnectorType,
      config: candidateProvisioningConfigFor({
        entityType: candidate.entityType,
        canonicalUrl: candidate.canonicalUrl,
        metadata: candidate.metadata,
      }),
    })
    : null;

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

  async function prepareOrganizationConcept() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-source-candidates/" + candidate.id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare_organization_concept" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        concept?: OrganizationConceptResult;
        error?: string;
      };
      if (!response.ok || !payload.concept) {
        throw new Error(payload.error || "Návrh organizácie sa nepodarilo pripraviť.");
      }
      setOrganizationConcept(payload.concept);
      setMessage(payload.concept.outcome === "INSUFFICIENT_EVIDENCE"
        ? "Kandidát nemá dosť bezpečných identity dôkazov. Nič nebolo publikované."
        : "Návrh organizácie je pripravený na ľudské review. Nič nebolo publikované.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Návrh organizácie sa nepodarilo pripraviť.");
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

      {helpReadiness && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Pripravenosť HELP zdroja</h2>
              <p>Schválenie discovery kandidáta samo osebe neznamená, že zdroj je technicky pripravený na automatické spracovanie.</p>
            </div>
          </div>
          <div className={styles.reviewSummary}>
            <div><span>Typ zdroja</span><strong>{helpShapeLabel(helpReadiness)}</strong></div>
            <div><span>Technická pripravenosť</span><strong>{helpReadinessLabel(helpReadiness)}</strong></div>
            <div><span>Adapter</span><strong>{helpReadiness.adapterLabel ?? "Nie je priradený"}</strong></div>
          </div>
          {!helpReadiness.ready && (
            <p><strong>Zdroj zostane vypnutý.</strong> Na preview a monitoring potrebuje explicitne podporovaný adapter pre tento HELP typ a source shape.</p>
          )}
          <details className={styles.advanced}>
            <summary>Pokročilé — readiness detail</summary>
            <div className={styles.advancedBody}>
              <p><strong>Dôvod:</strong> {helpReadiness.reason}</p>
              <p><strong>Adapter key:</strong> {helpReadiness.adapterKey ?? "—"}</p>
            </div>
          </details>
        </section>
      )}

      {candidate.entityType === "ORGANIZATION" && candidate.discoveryType === "SEARCH_PROVIDER" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Organizácia z discovery leadu</h2>
              <p>Pripraví entity návrh z Tavily evidence a generic official-site enrichmentu. Monitoring zdroja sa nezapne a publikovanie sa nevykoná automaticky.</p>
            </div>
          </div>

          {candidate.reviewStatus === "APPROVED" ? (
            <div className="admin-form-actions">
              <button className="is-primary" type="button" disabled={busy} onClick={() => void prepareOrganizationConcept()}>
                Pripraviť návrh organizácie
              </button>
            </div>
          ) : (
            <p>Najprv schváľ discovery candidate. Schválenie pripraví alebo reuse-ne vypnutý zdroj; nie je to aktivácia monitoringu.</p>
          )}

          {organizationConcept && (
            <div className={styles.advancedBody} style={{ marginTop: 16 }}>
              <h3>{conceptOutcomeLabel(organizationConcept.outcome)}</h3>
              <div className={styles.reviewSummary}>
                <div><span>Názov</span><strong>{String(organizationConcept.proposed.name ?? "—")}</strong></div>
                <div><span>Web</span><strong>{String(organizationConcept.proposed.websiteUrl ?? "—")}</strong></div>
                <div><span>Typ</span><strong>{String(organizationConcept.proposed.type ?? "—")}</strong></div>
                <div><span>Mesto</span><strong>{String(organizationConcept.proposed.city ?? "—")}</strong></div>
                <div><span>Telefón</span><strong>{String(organizationConcept.proposed.publicPhone ?? "—")}</strong></div>
                <div><span>E-mail</span><strong>{String(organizationConcept.proposed.publicEmail ?? "—")}</strong></div>
              </div>
              <p><strong>Match:</strong> {organizationConcept.matchQuality} · {organizationConcept.matchReason}</p>
              {organizationConcept.canonicalEntityId && (
                <p><strong>Canonical organizácia:</strong> #{organizationConcept.canonicalEntityId}</p>
              )}
              {organizationConcept.findingId && (
                <p><Link href={"/admin/operations/automation/" + organizationConcept.findingId}>
                  Otvoriť review návrhu →
                </Link></p>
              )}
              <details className={styles.advanced}>
                <summary>Dôkazy / provenance</summary>
                <div className={styles.advancedBody}>
                  {organizationConcept.provenance.map((item, index) => (
                    <p key={item.field + ":" + index}>
                      <strong>{item.field}</strong> · {item.evidenceKind} · {item.confidence}
                      {item.evidenceId ? " · evidence #" + item.evidenceId : ""}<br />
                      {item.reason}
                    </p>
                  ))}
                </div>
              </details>
              <p><small>Source #{organizationConcept.sourceId}: {organizationConcept.sourceStatus.connectorType} · {organizationConcept.sourceStatus.enabled ? "enabled" : "disabled"} · {organizationConcept.sourceStatus.reviewStatus}</small></p>
            </div>
          )}
        </section>
      )}

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
