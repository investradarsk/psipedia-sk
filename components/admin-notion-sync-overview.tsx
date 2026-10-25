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

type OverviewResponse = {
  readOnly: true;
  basis: "EXISTING_D1_MAPPING_HISTORY";
  liveNotionStatus: "UNKNOWN";
  checkedAt: string;
  rows: OverviewRow[];
};

const stateLabels: Record<OverviewRow["status"], string> = {
  RECORDED: "Evidované",
  EMPTY: "Bez záznamov",
  SCHEMA_UNAVAILABLE: "Chýba schéma",
  UNKNOWN: "Neoverené",
};

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
    || result.liveNotionStatus !== "UNKNOWN" || !Array.isArray(result.rows)) {
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
                </tr>
              </thead>
              <tbody>
                {snapshot.rows.map((row) => (
                  <tr key={row.area}>
                    <td>{row.label}</td>
                    <td>{stateLabels[row.status]}</td>
                    <td>{row.count === null ? "Neznámy" : String(row.count) + " " + countLabels[row.evidence]}</td>
                    <td>{row.evidence === "LINKED_POSTS" ? "Neeviduje sa" : formatDate(row.lastMappingAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.progress}>
            D1 evidencia načítaná: {formatDate(snapshot.checkedAt)}.
            Toto nie je živý stav synchronizátora. Čas posledného mapovania nedokazuje
            aktuálnu dostupnosť Notionu ani zhodu obsahu. Konflikty skontroluj v audite nižšie.
          </p>
        </>
      ) : null}
    </section>
  );
}
