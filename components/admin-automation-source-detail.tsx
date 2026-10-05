"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AutomationSourceAdminRow } from "@/lib/data-automation-source-store";
import type { AutomationGovernanceEvaluation, AutomationGovernanceRead } from "@/lib/data-automation-governance";
import { automationConnectorTypes, automationEntityTypes } from "@/lib/data-automation";
import { automationReadableError } from "@/lib/admin-automation-presentation";
import {
  automationSourceReadiness,
  type AutomationSourceReadiness,
} from "@/lib/data-automation-capability-registry";
import styles from "./admin-operations-ux.module.css";

type Preview = {
  ok: boolean;
  sourceStatus: string;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  finalUrl: string | null;
  redirectCount: number;
  timingMs: number;
  recordsFound: number;
  recordsNormalized: number;
  possibleMatches: number;
  newCandidates: number;
  possibleUpdates: number;
  errors: string[];
  parserErrors: string[];
  errorDetails: Array<{ code: string; detail: string }>;
  writes: { observations: number; findings: number; canonical: number; publications: number };
};

type RunSummary = {
  sourceId?: number;
  status: string | null;
  checked: number;
  newFindings: number;
  updatedFindings: number;
  newDataFindings?: number;
  sourceErrors?: number;
  errors: number;
  durationMs?: number | null;
  nextCheckAt: string | null;
  lastCheckedAt?: string | null;
  lastErrorCode?: string | null;
};

async function mutate(url: string, method: "POST" | "PUT", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Operácia zlyhala.");
  return payload;
}

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

function statusCopy(
  source: AutomationSourceAdminRow,
  governanceEvaluation: AutomationGovernanceEvaluation,
  readiness: AutomationSourceReadiness,
  genericProbeEligible: boolean,
) {
  if (source.enabled) {
    if (source.lastRunStatus === "FAILED" || source.lastErrorCode) {
      return { title: "Zdroj hlási problém", text: "Skontroluj zdroj. Technické detaily chyby sú dostupné pod Pokročilé.", warning: true };
    }
    return { title: "Zdroj je aktívny", text: "Psipedia ho kontroluje podľa nastaveného harmonogramu.", warning: false };
  }
  if (readiness.applicable && !readiness.ready && !genericProbeEligible) {
    return {
      title: "Zdroj potrebuje technické nastavenie",
      text: "Sledovanie zostáva vypnuté, kým Psipedia nevie tento typ zdroja bezpečne spracovať.",
      warning: true,
    };
  }
  if (genericProbeEligible && source.reviewStatus === "APPROVED" && governanceEvaluation.allowed) {
    return {
      title: "Zdroj čaká na bezpečné overenie",
      text: "Psipedia môže skúsiť generické čítanie v schválenom rozsahu. Pri zapnutí sa zdroj najprv overí.",
      warning: true,
    };
  }
  if (source.reviewStatus === "PENDING") {
    return { title: "Zdroj je pripravený na kontrolu", text: "Over zdroj a rozhodni, či ho Psipedia môže používať.", warning: true };
  }
  if (source.reviewStatus === "REJECTED") {
    return { title: "Zdroj je zamietnutý", text: "Nebude sa automaticky kontrolovať, kým ho znovu neschváliš.", warning: true };
  }
  if (!source.enabled && !governanceEvaluation.allowed) {
    return { title: "Zdroj potrebuje technickú kontrolu", text: "Sledovanie zostane vypnuté, kým bezpečnostné pravidlá nepovolia pravidelnú kontrolu.", warning: true };
  }
  return { title: "Zdroj je pripravený na sledovanie", text: "Bezpečnostná kontrola je v poriadku. Zdroj môžeš zapnúť.", warning: true };
}

export function AdminAutomationSourceDetail({
  source,
  governance,
  governanceEvaluation,
  governanceHistory,
}: {
  source: AutomationSourceAdminRow;
  governance: AutomationGovernanceRead;
  governanceEvaluation: AutomationGovernanceEvaluation;
  governanceHistory: Array<Record<string, unknown>>;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"action" | "test" | "run" | null>(source.lastRunStatus === "RUNNING" ? "run" : null);
  const busy = busyAction !== null;
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [notes, setNotes] = useState(source.reviewNotes ?? "");
  const governanceState = governance.state;
  const [governanceForm, setGovernanceForm] = useState({
    accessStatus: governanceState?.accessStatus ?? "UNKNOWN",
    robotsStatus: governanceState?.robotsStatus ?? "UNKNOWN",
    termsStatus: governanceState?.termsStatus ?? "UNKNOWN",
    recurringStatus: governanceState?.recurringStatus ?? "UNKNOWN",
    retentionStatus: governanceState?.retentionStatus ?? "UNKNOWN",
    retainUrl: governanceState?.retainUrl ?? false,
    retainTitle: governanceState?.retainTitle ?? false,
    retainSnippet: governanceState?.retainSnippet ?? false,
    retainMetadata: governanceState?.retainMetadata ?? false,
    retentionDays: governanceState?.retentionDays ? String(governanceState.retentionDays) : "",
    minCadenceMinutes: governanceState?.minCadenceMinutes ? String(governanceState.minCadenceMinutes) : "",
    maxRequestsPerDay: governanceState?.maxRequestsPerDay ? String(governanceState.maxRequestsPerDay) : "",
    manualOnly: governanceState?.manualOnly ?? false,
    pathScope: governanceState?.pathScope ?? "",
    restrictionsNote: governanceState?.restrictionsNote ?? "",
    termsUrl: governanceState?.termsUrl ?? "",
    privacyUrl: governanceState?.privacyUrl ?? "",
    robotsUrl: governanceState?.robotsUrl ?? "",
    evidenceUrl: governanceState?.evidenceUrl ?? "",
    rationale: "",
    expiresAt: governanceState?.expiresAt ?? "",
    reviewDueAt: governanceState?.reviewDueAt ?? "",
    expectedUpdatedAt: governanceState?.updatedAt ?? null,
  });
  const [form, setForm] = useState<{
    sourceKey: string; label: string; entityType: string; connectorType: string; sourceUrl: string;
    cadenceMinutes: string; throttleMs: string; timeoutMs: string; retryMaxAttempts: string; retryBackoffMs: string;
    maxRecordsPerRun: string; config: string;
  }>({
    sourceKey: source.sourceKey,
    label: source.label,
    entityType: source.entityType,
    connectorType: source.connectorType,
    sourceUrl: source.sourceUrl ?? "",
    cadenceMinutes: String(source.cadenceMinutes),
    throttleMs: String(source.throttleMs),
    timeoutMs: String(source.timeoutMs),
    retryMaxAttempts: String(source.retryMaxAttempts),
    retryBackoffMs: String(source.retryBackoffMs),
    maxRecordsPerRun: String(source.maxRecordsPerRun),
    config: JSON.stringify(source.config, null, 2),
  });

  const readiness = automationSourceReadiness(source);
  const adoptionSourceOrganization = source.entityType === "ADOPTION"
    && typeof source.config.staticFields?.organizationName === "string"
    ? source.config.staticFields.organizationName.trim()
    : "";
  const genericProbeEligible = readiness.capabilities.some((capability) =>
    capability.strategy === "GENERIC_FIRST_PARTY"
    && capability.status === "UNAVAILABLE"
    && capability.reason === "PROBE_REQUIRED"
  );
  const canUseGenericProbe = readiness.ready || genericProbeEligible;
  const canTestSource = readiness.ready
    || (genericProbeEligible && source.reviewStatus === "APPROVED" && governanceEvaluation.allowed);
  const status = statusCopy(source, governanceEvaluation, readiness, genericProbeEligible);

  async function pollRunStatus() {
    let networkFailures = 0;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch("/api/admin/automation-sources/" + source.id + "/run", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as { run?: RunSummary; error?: string };
        if (!response.ok || !payload.run) throw new Error(payload.error || "Stav kontroly sa nepodarilo načítať.");
        networkFailures = 0;
        setRun(payload.run);
        if (payload.run.status && payload.run.status !== "RUNNING") {
          setMessage(
            payload.run.status === "SUCCESS"
              ? "Kontrola skončila úspešne. Nový obsah sa spracuje do konceptov v príslušných admin sekciách."
              : "Kontrola skončila so stavom " + payload.run.status + ". Pozri výsledok nižšie.",
          );
          setBusyAction(null);
          router.refresh();
          return;
        }
      } catch {
        networkFailures += 1;
        if (networkFailures >= 5) {
          setMessage("Kontrola beží na pozadí. Spojenie na chvíľu vypadlo, stav môžeš overiť obnovením stránky.");
          setBusyAction(null);
          return;
        }
      }
    }
    setMessage("Kontrola stále beží na pozadí. Môžeš túto stránku opustiť a vrátiť sa neskôr.");
    setBusyAction(null);
  }

  useEffect(() => {
    if (source.lastRunStatus !== "RUNNING") return;
    const timer = window.setTimeout(() => {
      void pollRunStatus();
    }, 0);
    return () => window.clearTimeout(timer);
    // Polling is intentionally tied to the source/run state received from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.lastRunStatus]);

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function action(body: Record<string, unknown>) {
    setBusyAction("action");
    setMessage("");
    try {
      await mutate("/api/admin/automation-sources/" + source.id, "PUT", body);
      setMessage("Zmena bola uložená.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia zlyhala.");
    } finally {
      setBusyAction(null);
    }
  }

  async function testSource() {
    setBusyAction("test");
    setMessage("");
    setPreview(null);
    try {
      const payload = await mutate("/api/admin/automation-sources/" + source.id + "/test", "POST", {});
      setPreview(payload.preview as Preview);
      setMessage("Test skončil. Nič sa nezapísalo ani nezverejnilo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test zdroja zlyhal.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runNow() {
    setBusyAction("run");
    setMessage("");
    setRun({ status: "RUNNING", checked: 0, newFindings: 0, updatedFindings: 0, errors: 0, nextCheckAt: source.nextCheckAt });
    try {
      const response = await fetch("/api/admin/automation-sources/" + source.id + "/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({})) as { accepted?: boolean; run?: RunSummary; error?: string };
      if (!response.ok || !payload.accepted) throw new Error(payload.error || "Kontrolu sa nepodarilo spustiť.");
      if (payload.run) setRun(payload.run);
      setMessage("Kontrola beží na pozadí. Túto stránku môžeš pokojne opustiť.");
      void pollRunStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrolu sa nepodarilo spustiť.");
      setBusyAction(null);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      {(busyAction === "test" || busyAction === "run") && (
        <div className={styles.progressPanel} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <strong>{busyAction === "test" ? "Testujem zdroj…" : "Kontrolujem zdroj…"}</strong>
            <p>{busyAction === "test"
              ? "Overujem dostupnosť a spracovanie dát. Tento test nič nezapisuje."
              : "Kontrola beží na pozadí. Načítavam zdroj a bezpečne pripravujem nájdený obsah do konceptov. Túto stránku môžeš pokojne opustiť."}</p>
          </div>
        </div>
      )}

      <section className={[styles.statusHero, status.warning ? styles.statusHeroWarning : styles.statusHeroGood].join(" ")}>
        <div>
          <strong>{status.title}</strong>
          <p>{status.text}</p>
        </div>
        <div className={styles.badges}>
          <span className={[styles.badge, source.reviewStatus === "APPROVED" ? styles.badgeGood : styles.badgeWarning].join(" ")}>{source.reviewStatus === "APPROVED" ? "Schválený" : source.reviewStatus === "REJECTED" ? "Zamietnutý" : "Čaká na schválenie"}</span>
          <span className={[styles.badge, source.enabled ? styles.badgeGood : styles.badgeWarning].join(" ")}>{source.enabled ? "Aktívny" : "Vypnutý"}</span>
          {source.lastRunStatus && <span className={[styles.badge, source.lastRunStatus === "FAILED" ? styles.badgeDanger : styles.badgeGood].join(" ")}>
            {source.lastRunStatus === "FAILED" ? "Posledná kontrola zlyhala" : source.lastRunStatus === "RUNNING" ? "Kontrola prebieha" : "Posledná kontrola bez chyby"}
          </span>}
        </div>
      </section>

      {readiness.applicable && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Technická pripravenosť</h2>
              <p>{readiness.ready
                ? "Psipedia tento typ zdroja pozná a vie ho bezpečne spracovať."
                : genericProbeEligible
                  ? "Zdroj nemá dedicated adapter, ale môže prejsť bezpečným generickým overením v schválenom rozsahu."
                  : "Zdroj potrebuje technické nastavenie. Bežné sledovanie zostáva zablokované."}</p>
            </div>
            <span className={[styles.badge, readiness.ready ? styles.badgeGood : styles.badgeWarning].join(" ")}>
              {readiness.ready ? "V poriadku" : genericProbeEligible ? "Možno bezpečne overiť" : "Vyžaduje technickú kontrolu"}
            </span>
          </div>
          <details className={styles.advanced}>
            <summary>Pokročilé — readiness detail</summary>
            <div className={styles.advancedBody}>
              <div className={styles.reviewSummary}>
                <div><span>Typ zdroja</span><strong>{readiness.sourceShape === "SINGLE_ITEM" ? "Detail jednej položky" : readiness.sourceShape === "MULTI_ITEM_LIST" ? "Zoznam položiek" : "Neurčené"}</strong></div>
                <div><span>Adapter</span><strong>{readiness.adapterLabel ?? "Nie je priradený"}</strong></div>
                {source.entityType === "ADOPTION" && (
                  <div><span>Organizácia zdroja</span><strong>{adoptionSourceOrganization || "Chýba — doplň staticFields.organizationName"}</strong></div>
                )}
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
            <h2>Bezpečnostná kontrola</h2>
            <p>{governanceEvaluation.allowed
              ? "Pravidlá sledovania sú v poriadku."
              : "Zdroj vyžaduje technickú kontrolu bezpečnostných pravidiel. Sledovanie zostáva zablokované."}</p>
          </div>
          <span className={[styles.badge, governanceEvaluation.allowed ? styles.badgeGood : styles.badgeWarning].join(" ")}>
            {governanceEvaluation.allowed ? "V poriadku" : "Vyžaduje technickú kontrolu"}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Čo chceš spraviť?</h2>
            <p>Psipedia pripraví technické kroky, ale rozhodnutie zostáva na tebe. Bezpečnostné kontroly sa nedajú obísť.</p>
          </div>
        </div>

        {(source.reviewStatus !== "APPROVED" || source.reviewNotes) && (
          <label className="admin-field">
            <span>Poznámka k schváleniu</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Voliteľná interná poznámka…" />
          </label>
        )}

        <div className="admin-form-actions">
          <button type="button" disabled={busy || (readiness.applicable && !canTestSource)} onClick={() => void testSource()}>{busyAction === "test" ? "Overujem zdroj…" : "Overiť zdroj"}</button>
          {source.reviewStatus !== "APPROVED" && <button className="is-primary" type="button" disabled={busy} onClick={() => void action({ action: "approve", notes })}>Schváliť zdroj</button>}
          {source.reviewStatus === "APPROVED" && !source.enabled && <button className="is-primary" type="button" disabled={busy || !governanceEvaluation.allowed || (readiness.applicable && !canUseGenericProbe)} onClick={() => void action({ action: "enable" })}>Zapnúť sledovanie</button>}
          {source.enabled && <button className="is-primary" type="button" disabled={busy || (readiness.applicable && !canUseGenericProbe)} onClick={() => void runNow()}>{busyAction === "run" ? "Kontrolujem zdroj…" : "Skontrolovať teraz"}</button>}
          {source.enabled && <button className="is-danger" type="button" disabled={busy} onClick={() => void action({ action: "disable" })}>Pozastaviť sledovanie</button>}
          {source.reviewStatus !== "REJECTED" && <button className="is-danger" type="button" disabled={busy} onClick={() => void action({ action: "reject", notes })}>Zamietnuť zdroj</button>}
        </div>
      </section>

      <details className={styles.advanced}>
        <summary>Pokročilé — bezpečnostné pravidlá</summary>
        <div className={styles.advancedBody}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Bezpečnostné pravidlá</h2>
            <p>Technické pravidlá prístupu, frekvencie a uchovávania dát. Tieto nastavenia zostávajú oddelené od bežného používateľského rozhodnutia.</p>
          </div>
          <span className={[styles.badge, governanceEvaluation.allowed ? styles.badgeGood : styles.badgeDanger].join(" ")}>
            {governanceEvaluation.allowed ? "Povolené" : "Blokované"}
          </span>
        </div>

        {!governance.schemaAvailable && <p className="admin-flash">Bezpečnostné pravidlá nie sú dostupné. Sledovanie zostáva bezpečne zablokované.</p>}
        {!governanceEvaluation.allowed && (
          <div className={styles.techGrid}>
            {governanceEvaluation.blockingReasons.map((reason) => (
              <div className={styles.techRow} key={reason}><strong>{reason}</strong><span>Tento dôvod blokuje pravidelné sledovanie.</span></div>
            ))}
          </div>
        )}

        <div className="admin-form-grid">
          <label className="admin-field"><span>Access</span><select value={governanceForm.accessStatus} onChange={(e) => setGovernanceForm((x) => ({ ...x, accessStatus: e.target.value }))}>
            {["UNKNOWN","ALLOWED","RESTRICTED","BLOCKED"].map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label className="admin-field"><span>Robots</span><select value={governanceForm.robotsStatus} onChange={(e) => setGovernanceForm((x) => ({ ...x, robotsStatus: e.target.value }))}>
            {["UNKNOWN","ALLOWED","RESTRICTED","DISALLOWED","NOT_APPLICABLE"].map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label className="admin-field"><span>Terms / legal</span><select value={governanceForm.termsStatus} onChange={(e) => setGovernanceForm((x) => ({ ...x, termsStatus: e.target.value }))}>
            {["UNKNOWN","ALLOWED","REQUIRES_REVIEW","RESTRICTED","BLOCKED"].map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label className="admin-field"><span>Recurring use</span><select value={governanceForm.recurringStatus} onChange={(e) => setGovernanceForm((x) => ({ ...x, recurringStatus: e.target.value }))}>
            {["UNKNOWN","APPROVED","RESTRICTED","DENIED"].map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label className="admin-field"><span>Evidence retention</span><select value={governanceForm.retentionStatus} onChange={(e) => setGovernanceForm((x) => ({ ...x, retentionStatus: e.target.value }))}>
            {["UNKNOWN","APPROVED","RESTRICTED","DENIED"].map((v) => <option key={v}>{v}</option>)}
          </select></label>
          <label className="admin-field"><span>Retention days</span><input type="number" min={1} max={3650} value={governanceForm.retentionDays} onChange={(e) => setGovernanceForm((x) => ({ ...x, retentionDays: e.target.value }))} /></label>
          <label className="admin-field"><span>Min cadence (min)</span><input type="number" min={60} max={43200} value={governanceForm.minCadenceMinutes} onChange={(e) => setGovernanceForm((x) => ({ ...x, minCadenceMinutes: e.target.value }))} /></label>
          <label className="admin-field"><span>Max requests/day</span><input type="number" min={1} max={100000} value={governanceForm.maxRequestsPerDay} onChange={(e) => setGovernanceForm((x) => ({ ...x, maxRequestsPerDay: e.target.value }))} /></label>
          <label className="admin-field"><span>Expires at</span><input type="datetime-local" value={governanceForm.expiresAt ? governanceForm.expiresAt.slice(0,16) : ""} onChange={(e) => setGovernanceForm((x) => ({ ...x, expiresAt: e.target.value }))} /></label>
          <label className="admin-field"><span>Review due</span><input type="datetime-local" value={governanceForm.reviewDueAt ? governanceForm.reviewDueAt.slice(0,16) : ""} onChange={(e) => setGovernanceForm((x) => ({ ...x, reviewDueAt: e.target.value }))} /></label>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field"><span><input type="checkbox" checked={governanceForm.retainUrl} onChange={(e) => setGovernanceForm((x) => ({ ...x, retainUrl: e.target.checked }))} /> Store URL</span></label>
          <label className="admin-field"><span><input type="checkbox" checked={governanceForm.retainTitle} onChange={(e) => setGovernanceForm((x) => ({ ...x, retainTitle: e.target.checked }))} /> Store title</span></label>
          <label className="admin-field"><span><input type="checkbox" checked={governanceForm.retainSnippet} onChange={(e) => setGovernanceForm((x) => ({ ...x, retainSnippet: e.target.checked }))} /> Store snippet</span></label>
          <label className="admin-field"><span><input type="checkbox" checked={governanceForm.retainMetadata} onChange={(e) => setGovernanceForm((x) => ({ ...x, retainMetadata: e.target.checked }))} /> Store metadata</span></label>
          <label className="admin-field"><span><input type="checkbox" checked={governanceForm.manualOnly} onChange={(e) => setGovernanceForm((x) => ({ ...x, manualOnly: e.target.checked }))} /> Manual only</span></label>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field admin-field-wide"><span>Terms URL</span><input type="url" value={governanceForm.termsUrl} onChange={(e) => setGovernanceForm((x) => ({ ...x, termsUrl: e.target.value }))} /></label>
          <label className="admin-field admin-field-wide"><span>Robots URL</span><input type="url" value={governanceForm.robotsUrl} onChange={(e) => setGovernanceForm((x) => ({ ...x, robotsUrl: e.target.value }))} /></label>
          <label className="admin-field admin-field-wide"><span>Evidence URL</span><input type="url" value={governanceForm.evidenceUrl} onChange={(e) => setGovernanceForm((x) => ({ ...x, evidenceUrl: e.target.value }))} /></label>
          <label className="admin-field admin-field-wide"><span>Privacy URL</span><input type="url" value={governanceForm.privacyUrl} onChange={(e) => setGovernanceForm((x) => ({ ...x, privacyUrl: e.target.value }))} /></label>
          <label className="admin-field admin-field-wide"><span>Path scope</span><input value={governanceForm.pathScope} onChange={(e) => setGovernanceForm((x) => ({ ...x, pathScope: e.target.value }))} /></label>
        </div>
        <label className="admin-field"><span>Restrictions / notes</span><textarea rows={3} value={governanceForm.restrictionsNote} onChange={(e) => setGovernanceForm((x) => ({ ...x, restrictionsNote: e.target.value }))} /></label>
        <label className="admin-field"><span>Rationale *</span><textarea rows={3} required value={governanceForm.rationale} onChange={(e) => setGovernanceForm((x) => ({ ...x, rationale: e.target.value }))} placeholder="Prečo je toto governance rozhodnutie správne?" /></label>
        <div className="admin-form-actions">
          <button className="is-primary" type="button" disabled={busy || !governance.schemaAvailable || !governanceForm.rationale.trim()} onClick={() => void action({
            action: "governance",
            governance: {
              ...governanceForm,
              retentionDays: governanceForm.retentionDays || null,
              minCadenceMinutes: governanceForm.minCadenceMinutes || null,
              maxRequestsPerDay: governanceForm.maxRequestsPerDay || null,
              expiresAt: governanceForm.expiresAt ? new Date(governanceForm.expiresAt).toISOString() : null,
              reviewDueAt: governanceForm.reviewDueAt ? new Date(governanceForm.reviewDueAt).toISOString() : null,
            },
          })}>Uložiť bezpečnostnú kontrolu</button>
        </div>
        <p><strong>Posledná kontrola:</strong> {formatDate(governanceState?.reviewedAt ?? null)} · <strong>Ďalšia kontrola:</strong> {formatDate(governanceState?.reviewDueAt ?? null)}</p>

        <details className={styles.advanced}>
          <summary>História bezpečnostných pravidiel ({governanceHistory.length})</summary>
          <div className={styles.advancedBody}>
            {governanceHistory.length ? <div className={styles.techGrid}>{governanceHistory.map((item) => (
              <div className={styles.techRow} key={String(item.id)}>
                <strong>{String(item.actor ?? "—")} · {formatDate(item.changed_at ? String(item.changed_at) : null)}</strong>
                <span>{String(item.rationale ?? "")}</span>
              </div>
            ))}</div> : <p>Zatiaľ nie je história bezpečnostných rozhodnutí.</p>}
          </div>
        </details>
      </section>
        </div>
      </details>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Základný stav</h2>
            <p>Údaje, ktoré potrebuješ pri bežnej kontrole zdroja.</p>
          </div>
        </div>
        <div className="admin-stats" aria-label="Source observability">
          <div><span>Posledný výsledok</span><strong>{source.lastRunStatus === "FAILED" ? "Problém" : source.lastRunStatus === "RUNNING" ? "Prebieha" : source.lastRunStatus ? "Bez chyby" : "—"}</strong></div>
          <div><span>Nové koncepty / zistenia</span><strong>{source.newFindingCount}</strong></div>
          <div><span>Chyby</span><strong>{source.errorCount}</strong></div>
          <div><span>Ďalšia kontrola</span><strong style={{ fontSize: "1rem", lineHeight: 1.3 }}>{formatDate(source.nextCheckAt)}</strong></div>
        </div>
        <p><strong>Posledná kontrola:</strong> {formatDate(source.lastCheckedAt)} · <strong>Posledná úspešná:</strong> {formatDate(source.lastSuccessAt)}</p>
        {source.lastErrorCode && <p><strong>Posledná chyba:</strong> {automationReadableError(source.lastErrorCode)}</p>}
      </section>

      {preview && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}>
            <div><h2>Výsledok testu</h2><p>Test je read-only a nič nemení v canonical dátach.</p></div>
          </div>
          <div className="admin-stats">
            <div><span>Výsledok</span><strong>{preview.ok ? "V poriadku" : "Problém"}</strong></div>
            <div><span>Nájdené záznamy</span><strong>{preview.recordsFound}</strong></div>
            <div><span>Nové návrhy</span><strong>{preview.newCandidates}</strong></div>
            <div><span>Možné zmeny</span><strong>{preview.possibleUpdates}</strong></div>
          </div>
          {preview.errorDetails.length > 0 && (
            <div className="admin-stack">
              {preview.errorDetails.map((error) => <p key={error.code}><strong>{error.code}</strong>: {error.detail}</p>)}
            </div>
          )}
          <details className={styles.advanced}>
            <summary>Technický výsledok testu</summary>
            <div className={styles.advancedBody}>
              <p><strong>Source status:</strong> {preview.sourceStatus} · redirects {preview.redirectCount} · timing {preview.timingMs} ms</p>
              <p><strong>Content:</strong> {preview.contentType ?? "—"} · {preview.contentLength ?? "—"} bytes</p>
              <p><strong>Final URL:</strong> {preview.finalUrl ?? "—"}</p>
              <p>Writes: observations {preview.writes.observations}, findings {preview.writes.findings}, canonical {preview.writes.canonical}, publications {preview.writes.publications}.</p>
            </div>
          </details>
        </section>
      )}

      {run && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}><div><h2>Výsledok manuálnej kontroly</h2></div></div>
          <p><strong>{run.status ?? "RUNNING"}</strong> · skontrolované {run.checked} · nové zistenia {run.newDataFindings ?? run.newFindings} · chyby {run.sourceErrors ?? run.errors} · ďalšia kontrola {formatDate(run.nextCheckAt)}</p>
        </section>
      )}

      <details className={styles.advanced}>
        <summary>Pokročilé nastavenia zdroja</summary>
        <div className={styles.advancedBody}>
          <p>Zmena URL, typu, connectora alebo mappingu zdroj automaticky vypne a vráti na nové schválenie.</p>
          <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void action({ action: "save", source: form }); }}>
            <div className="admin-form-grid">
              <label className="admin-field"><span>Source key</span><input required value={form.sourceKey} onChange={(e) => field("sourceKey", e.target.value)} /></label>
              <label className="admin-field"><span>Názov</span><input required value={form.label} onChange={(e) => field("label", e.target.value)} /></label>
              <label className="admin-field"><span>Entity type</span><select value={form.entityType} onChange={(e) => field("entityType", e.target.value)}>{automationEntityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="admin-field"><span>Connector</span><select value={form.connectorType} onChange={(e) => field("connectorType", e.target.value)}>{automationConnectorTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="admin-field admin-field-wide"><span>Source URL</span><input type="url" value={form.sourceUrl} onChange={(e) => field("sourceUrl", e.target.value)} /></label>
              <label className="admin-field"><span>Cadence (min)</span><input type="number" min={60} max={43200} value={form.cadenceMinutes} onChange={(e) => field("cadenceMinutes", e.target.value)} /></label>
              <label className="admin-field"><span>Timeout (ms)</span><input type="number" min={1000} max={30000} value={form.timeoutMs} onChange={(e) => field("timeoutMs", e.target.value)} /></label>
              <label className="admin-field"><span>Throttle (ms)</span><input type="number" min={0} max={60000} value={form.throttleMs} onChange={(e) => field("throttleMs", e.target.value)} /></label>
              <label className="admin-field"><span>Max records/run</span><input type="number" min={1} max={500} value={form.maxRecordsPerRun} onChange={(e) => field("maxRecordsPerRun", e.target.value)} /></label>
              <label className="admin-field"><span>Retry pokusy</span><input type="number" min={0} max={4} value={form.retryMaxAttempts} onChange={(e) => field("retryMaxAttempts", e.target.value)} /></label>
              <label className="admin-field"><span>Retry backoff (ms)</span><input type="number" min={100} max={30000} value={form.retryBackoffMs} onChange={(e) => field("retryBackoffMs", e.target.value)} /></label>
            </div>
            <label className="admin-field"><span>Mapping / config JSON</span><textarea rows={10} value={form.config} onChange={(e) => field("config", e.target.value)} spellCheck={false} /></label>
            <div className="admin-form-actions"><button className="is-primary" type="submit" disabled={busy}>Uložiť pokročilé nastavenia</button></div>
          </form>
        </div>
      </details>
    </>
  );
}
