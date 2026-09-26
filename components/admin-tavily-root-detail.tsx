"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationDiscoveryRoot, AutomationDiscoveryRunSummaryRow } from "@/lib/data-automation-discovery-store";
import styles from "./admin-operations-ux.module.css";

type CanaryRun = {
  runId: number;
  rootId: number;
  rootKey: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  candidates: number;
  reviewableCandidates: number;
  duplicateCandidates: number;
  requestCount: number;
  resultCount: number;
  errors: number;
  errorSummary: string | null;
  nextCheckAt: string | null;
};

async function mutate(id: number, action: string) {
  const response = await fetch("/api/admin/automation-discovery-roots/" + id, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; run?: CanaryRun };
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

export function AdminTavilyRootDetail({
  root,
  secretConfigured,
  governanceAllowed,
  governanceBlockingReasons,
  canaryAllowed,
  canaryBlockers,
  runs,
}: {
  root: AutomationDiscoveryRoot;
  secretConfigured: boolean;
  governanceAllowed: boolean;
  governanceBlockingReasons: string[];
  canaryAllowed: boolean;
  canaryBlockers: string[];
  runs: AutomationDiscoveryRunSummaryRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [canaryRun, setCanaryRun] = useState<CanaryRun | null>(null);
  const queries = Array.isArray(root.config.queries)
    ? root.config.queries.filter((value): value is string => typeof value === "string")
    : [];
  const budget = root.config.searchBudget && typeof root.config.searchBudget === "object" && !Array.isArray(root.config.searchBudget)
    ? root.config.searchBudget as Record<string, unknown>
    : {};

  async function action(name: string) {
    setBusy(name);
    setMessage("");
    try {
      const payload = await mutate(root.id, name);
      if (payload.run) {
        setCanaryRun(payload.run);
        setMessage("Jednorazový canary run bol dokončený.");
      } else {
        setMessage("Akcia bola uložená.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia zlyhala.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Tavily EVENT discovery root</h2>
            <p>Prvý live beh je oddelený od governance, technického schválenia a zapnutia rootu.</p>
          </div>
        </div>
        <div className="admin-stats">
          <div><span>Provider</span><strong>Tavily</strong></div>
          <div><span>Entity</span><strong>{root.entityType}</strong></div>
          <div><span>Cadence</span><strong>{Math.round(root.cadenceMinutes / 60)} h</strong></div>
          <div><span>Secret</span><strong>{secretConfigured ? "configured" : "not configured"}</strong></div>
        </div>
        <div className={styles.techGrid}>
          <div className={styles.techRow}><strong>Governance</strong><span>{governanceAllowed ? "ALLOWED" : "BLOCKED"}</span><span>{governanceBlockingReasons.join(", ") || "bez blokovania"}</span></div>
          <div className={styles.techRow}><strong>Technical review</strong><span>{root.reviewStatus}</span><span>root key {root.rootKey}</span></div>
          <div className={styles.techRow}><strong>Activation</strong><span>{root.enabled ? "enabled" : "disabled"}</span><span>next check {formatDate(root.nextCheckAt)}</span></div>
          <div className={styles.techRow}><strong>Budget</strong><span>{String(budget.queriesPerRun ?? "—")} queries/run · {String(budget.providerRequestsPerRun ?? "—")} requests/run</span><span>{String(budget.rootDailyRequests ?? "—")} requests/day · maxResults {String(root.config.maxResults ?? "—")}</span></div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Queries</h2><p>Presný bounded query set pre tento root.</p></div><span className={styles.sectionCount}>{queries.length}</span></div>
        <div className={styles.techGrid}>
          {queries.map((query, index) => <div className={styles.techRow} key={query}><strong>Query {index + 1}</strong><span>{query}</span></div>)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Operator actions</h2><p>Každý krok je samostatný. Žiadny krok automaticky nespúšťa nasledujúci.</p></div></div>
        <div className={styles.actionStack}>
          <button className="is-primary" type="button" disabled={Boolean(busy) || governanceAllowed} onClick={() => void action("governance-approve")}>
            {busy === "governance-approve" ? "Ukladám…" : "1. Schváliť governance"}
          </button>
          <button type="button" disabled={Boolean(busy) || !governanceAllowed || root.reviewStatus === "APPROVED"} onClick={() => void action("approve-root")}>
            {busy === "approve-root" ? "Schvaľujem…" : "2. Schváliť root"}
          </button>
          <button type="button" disabled={Boolean(busy) || !governanceAllowed || root.reviewStatus !== "APPROVED" || root.enabled} onClick={() => void action("enable")}>
            {busy === "enable" ? "Zapínam…" : "3. Zapnúť"}
          </button>
          <button className="is-primary" type="button" disabled={Boolean(busy) || !canaryAllowed} onClick={() => void action("canary")}>
            {busy === "canary" ? "Spúšťam…" : "4. Spustiť jednorazový canary"}
          </button>
          {root.enabled && <button type="button" disabled={Boolean(busy)} onClick={() => void action("disable")}>Vypnúť root</button>}
        </div>
        {!canaryAllowed && <p><strong>Canary blokuje:</strong> {canaryBlockers.join(", ")}</p>}
      </section>

      {canaryRun && (
        <section className={styles.section} aria-live="polite">
          <div className={styles.sectionHeader}><div><h2>Výsledok canary runu</h2><p>Run zapisuje iba source candidates/evidence a search usage.</p></div></div>
          <div className="admin-stats">
            <div><span>Status</span><strong>{canaryRun.status}</strong></div>
            <div><span>Requests</span><strong>{canaryRun.requestCount}</strong></div>
            <div><span>Results</span><strong>{canaryRun.resultCount}</strong></div>
            <div><span>Nové candidates</span><strong>{canaryRun.reviewableCandidates}</strong></div>
            <div><span>Duplicates</span><strong>{canaryRun.duplicateCandidates}</strong></div>
            <div><span>Errors</span><strong>{canaryRun.errors}</strong></div>
          </div>
          {canaryRun.errorSummary && <p><strong>Error:</strong> {canaryRun.errorSummary}</p>}
          <p><Link href="/admin/automatizacie/zdroje#kandidati">Otvoriť novo nájdené source candidates →</Link></p>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Posledné discovery runy</h2></div><span className={styles.sectionCount}>{runs.length}</span></div>
        {runs.length ? <div className={styles.techGrid}>{runs.map((run) => (
          <div className={styles.techRow} key={run.id}>
            <strong>Run #{run.id} · {run.status}</strong>
            <span>{formatDate(run.startedAt)} · candidates {run.candidateCount} · nové {run.reviewableCandidateCount} · duplicates {run.duplicateCandidateCount}</span>
            <span>errors {run.errorCount}{run.errorSummary ? " · " + run.errorSummary : ""}</span>
          </div>
        ))}</div> : <p>Zatiaľ neprebehol žiadny live discovery run.</p>}
      </section>
    </>
  );
}
