"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-notion-data-quality-audit.module.css";

type OverviewRow = {
  area: string;
  label: string;
  status: "RECORDED" | "EMPTY" | "SCHEMA_UNAVAILABLE" | "UNKNOWN";
  evidence: "MAPPINGS" | "VERIFIED_ATTEMPTS" | "LINKED_POSTS";
  count: number | null;
  lastMappingAt: string | null;
};

type RunReceipt = {
  area: "directory" | "events-help";
  status: "UNKNOWN" | "STARTED" | "STALE" | "SUCCESS" | "NO_CHANGE" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";
  recordedAt: string | null;
  runId: string | null;
  conflicts: number | null;
  errors: number | null;
};

type OverviewResponse = {
  readOnly: true;
  basis: "EXISTING_D1_MAPPING_HISTORY";
  liveNotionStatus: "UNKNOWN";
  runBasis: "EXISTING_ADMIN_AUTOMATION_EVENTS";
  runs: Record<RunReceipt["area"], RunReceipt>;
  checkedAt: string;
  rows: OverviewRow[];
};

const stateLabels: Record<OverviewRow["status"], string> = {
  RECORDED: "Evidované",
  EMPTY: "Bez záznamov",
  SCHEMA_UNAVAILABLE: "Chýba schéma",
  UNKNOWN: "Neoverené",
};

const runLabels: Record<RunReceipt["status"], string> = {
  UNKNOWN: "Neoverené",
  STARTED: "Prebieha",
  STALE: "Bez potvrdeného dokončenia",
  SUCCESS: "Dokončené",
  NO_CHANGE: "Bez zmien",
  PARTIAL_SUCCESS: "Čiastočný úspech",
  FAILED: "Zlyhalo",
  SKIPPED: "Preskočené",
  CANCELLED: "Zrušené",
};

function runForArea(area: string, runs: OverviewResponse["runs"]): RunReceipt | null {
  if (area === "directory") return runs.directory;
  if (["events", "organizations", "adoptions", "help-cases", "lost-found"].includes(area)) {
    return runs["events-help"];
  }
  return null;
}

const countLabels: Record<OverviewRow["evidence"], string> = {
  MAPPINGS: "mapovaní",
  VERIFIED_ATTEMPTS: "overených pokusov",
  LINKED_POSTS: "prepojených obrázkov",
};

function formatDate(timestamp: string | null): string {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return "Nie je evidované";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(new Date(timestamp));
}

async function fetchOverview(): Promise<OverviewResponse> {
  const response = await fetch("/api/admin/notion-sync-overview", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("HTTP_ERROR");
  const result = await response.json() as Partial<OverviewResponse>;
  if (result.readOnly !== true || result.basis !== "EXISTING_D1_MAPPING_HISTORY"
    || result.liveNotionStatus !== "UNKNOWN"
    || result.runBasis !== "EXISTING_ADMIN_AUTOMATION_EVENTS"
    || !result.runs || !result.runs.directory || !result.runs["events-help"]
    || !Array.isArray(result.rows)) {
    throw new Error("INVALID_RESPONSE");
  }
  return result as OverviewResponse;
}

export function AdminNotionSyncOverview() {
  const [snapshot, setSnapshot] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await fetchOverview());
    } catch {
      setSnapshot(null);
      setError("Prehľad sa nepodarilo načítať. Over pripojenie D1 a oprávnenie administrátora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Initial loading starts with the fetch, not a synchronous state update in
    // an effect. Reuses the exact same API validation as a manual refresh.
    void fetchOverview().then(
      (result) => {
        if (!active) return;
        setSnapshot(result);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("Prehľad sa nepodarilo načítať. Over pripojenie D1 a oprávnenie administrátora.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, []);

  return (
    <section className={styles.panel} aria-labelledby="notion-sync-overview-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="notion-sync-overview-heading">Prepojenia Psipedia ↔ Notion</h2>
          <p>Jedno miesto pre evidenciu existujúcich prepojení všetkých oblastí.</p>
        </div>
        <strong className={styles.readOnly}>Len na čítanie</strong>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.secondary}
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Obnovujem…" : "Obnoviť prehľad"}
        </button>
      </div>
      {error ? <p role="alert" className="admin-message admin-message--error">{error}</p> : null}
      {loading && !snapshot ? <p role="status">Načítavam evidenciu prepojení…</p> : null}
      {snapshot ? (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Oblasť</th>
                  <th scope="col">Evidencia</th>
                  <th scope="col">Počet</th>
                  <th scope="col">Posledný zapísaný sync</th>
                  <th scope="col">Posledný beh automatizácie</th>
                  <th scope="col">Konflikty / chyby v behu</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((row) => (
                  <tr key={row.area}>
                    <td>{row.label}</td>
                    <td>{stateLabels[row.status]}</td>
                    <td>{row.count === null ? "Neznámy" : String(row.count) + " " + countLabels[row.evidence]}</td>
                    <td>{row.evidence === "LINKED_POSTS" ? "Neeviduje sa" : formatDate(row.lastMappingAt)}</td>
                    <td>{(() => {
                      const run = runForArea(row.area, snapshot.runs);
                      return run
                        ? runLabels[run.status] + (run.recordedAt ? " · " + formatDate(run.recordedAt) : "")
                        : "Záznam behu nie je dostupný";
                    })()}</td>
                    <td>{(() => {
                      const run = runForArea(row.area, snapshot.runs);
                      return !run || (run.conflicts === null && run.errors === null)
                        ? "Neoverené"
                        : `${run.conflicts ?? "?"} / ${run.errors ?? "?"}`;
                    })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.progress}>
            D1 evidencia načítaná: {formatDate(snapshot.checkedAt)}.
            Posledný beh je doložený uloženou udalosťou automatizácie; Podujatia a päť oblastí Pomoci psom
            zdieľajú jednu hodinovú úlohu, takže zobrazujú spoločný výsledok, nie samostatné overenie každej oblasti.
            Ak chýba záznam, údaj zostáva neoverený. Toto nie je živý stav synchronizátora.
            Čas posledného mapovania ani úspešný beh nedokazuje aktuálnu dostupnosť Notionu či zhodu obsahu.
            Konflikty skontroluj v audite nižšie.
          </p>
        </>
      ) : null}
    </section>
  );
}
