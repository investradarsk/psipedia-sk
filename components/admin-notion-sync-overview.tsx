"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-notion-data-quality-audit.module.css";
import Link from "next/link";
import { AdminNotionDataQualityAudit } from "./admin-notion-data-quality-audit";
import { AdminNotionFieldSettings } from "./admin-notion-field-settings";
import { AdminNotionManualTransfer } from "./admin-notion-manual-transfer";

type DeliveryCase = {
  agenda: "organizations" | "adoptions" | "help-cases" | "lost-found";
  entityId: number;
  status: "PENDING" | "PROCESSING" | "REVIEW";
  attempts: number;
  errorCode: string | null;
  updatedAt: number | null;
};
type DeliverySummary = {
  pending: number; processing: number; review: number; permanentFailure: number;
  cases: DeliveryCase[]; truncated: boolean;
};
const helpEditors: Record<DeliveryCase["agenda"], string> = {
  organizations: "/admin/organizacie/", adoptions: "/admin/adopcie/",
  "help-cases": "/admin/pomoc/", "lost-found": "/admin/stratene-najdene/",
};
function caseStatus(item: DeliveryCase): string {
  if (item.status === "PENDING") return "Čaká na Notion";
  if (item.status === "PROCESSING") return "Spracováva sa";
  if (item.attempts >= 12 && item.errorCode === "NOTION_RETRY_FAILED") return "Trvalé zlyhanie – vyžaduje zásah";
  if (/CHANGED|CONFLICT|MISMATCH/.test(item.errorCode ?? "")) return "Konflikt – vyžaduje kontrolu";
  return "Ručná kontrola";
}
function caseAction(item: DeliveryCase): string {
  if (item.status === "PENDING" || item.status === "PROCESSING")
    return "Automatický prenos pokračuje; neprepisovať údaje ručne.";
  if (item.errorCode === "NOTION_RETRY_FAILED") return "Overiť prístup a dostupnosť Notionu; po oprave preveriť záznam.";
  if (/MAPPING|IDENTITY|CANONICAL_MISSING/.test(item.errorCode ?? ""))
    return "Overiť Psipedia ID, Notion väzbu a kanonický záznam.";
  if (/FIELD_CHANGED/.test(item.errorCode ?? ""))
    return "Porovnať zmenené polia v D1 a Notione; vybrať platnú hodnotu.";
  return "Skontrolovať dôvod zlyhania a údaje v editore; bez hromadného prepisu.";
}


type OverviewRow = {
  area: string;
  label: string;
  status: "RECORDED" | "EMPTY" | "SCHEMA_UNAVAILABLE" | "UNKNOWN";
  evidence: "MAPPINGS" | "VERIFIED_ATTEMPTS" | "LINKED_POSTS";
  count: number | null;
  lastMappingAt: string | null;
  pendingCount: number | null;
  pendingBasis: "REVISION_GAP" | "EDITORIAL_OUTBOX" | "NOT_RECORDED";
  delivery?: DeliverySummary | null;
};

type RunReceipt = {
  area: "directory" | "events-help";
  status: "UNKNOWN" | "STARTED" | "STALE" | "SUCCESS" | "NO_CHANGE" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";
  recordedAt: string | null;
  runId: string | null;
  conflicts: number | null;
  errors: number | null;
};

type NotionPreflightRow = {
  area: "directory" | "breeds" | "articles" | "eshops" | "events-help" | "service-catalog" | "facebook-images";
  label: string;
  status: "DISABLED" | "BLOCKED" | "CONFIGURED" | "UNKNOWN";
  details: "FLAG_DISABLED" | "TOKEN_MISSING" | "DATA_SOURCE_MISSING"
    | "SCHEMA_MISSING" | "SCHEMA_UNKNOWN" | "FEATURE_GATES_MISSING"
    | "BASIC_REQUIREMENTS_MET";
};

type OverviewResponse = {
  readOnly: true;
  basis: "EXISTING_D1_MAPPING_HISTORY";
  liveNotionStatus: "UNKNOWN";
  runBasis: "EXISTING_ADMIN_AUTOMATION_EVENTS";
  runs: Record<RunReceipt["area"], RunReceipt>;
  preflight: NotionPreflightRow[];
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
  STALE: "Bez aktuálneho potvrdeného behu",
  SUCCESS: "Dokončené",
  NO_CHANGE: "Bez zmien",
  PARTIAL_SUCCESS: "Čiastočný úspech",
  FAILED: "Zlyhalo",
  SKIPPED: "Preskočené",
  CANCELLED: "Zrušené",
};

function runForArea(area: string, runs: OverviewResponse["runs"]): RunReceipt | null {
  if (area === "directory") return runs.directory;
  // No per-domain durable Automation Run receipt exists for these agendas.
  // A shared runner outcome must never be presented as independent success.
  if (["breeds", "articles", "eshops"].includes(area)) return null;
  if (["events", "organizations", "adoptions", "help-cases", "lost-found"].includes(area)) {
    return runs["events-help"];
  }
  return null;
}

const configurationLabels: Record<NotionPreflightRow["status"], string> = {
  DISABLED: "Vypnuté",
  BLOCKED: "Chýba požiadavka",
  CONFIGURED: "Základná konfigurácia prítomná",
  UNKNOWN: "Neoverené",
};

const configurationDetailLabels: Record<NotionPreflightRow["details"], string> = {
  FLAG_DISABLED: "Funkcia je vypnutá",
  TOKEN_MISSING: "Nie je nakonfigurovaný Notion token",
  DATA_SOURCE_MISSING: "Chýba platné ID Notion zdroja",
  SCHEMA_MISSING: "Chýbajú existujúce D1 tabuľky",
  SCHEMA_UNKNOWN: "D1 tabuľky nie je možné overiť",
  FEATURE_GATES_MISSING: "Nie sú zapnuté všetky bezpečnostné podmienky",
  BASIC_REQUIREMENTS_MET: "Nevyhodnocuje dostupnosť Notion API ani práva k stránkam",
};

function pendingLabel(row: OverviewRow): string {
  if (row.pendingCount === null || row.pendingBasis === "NOT_RECORDED") return "Neoverené";
  if (row.pendingBasis === "EDITORIAL_OUTBOX") return String(row.pendingCount) + " v redakčnom outboxe";
  return String(row.pendingCount) + " bez zhody revízie";
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
    || !Array.isArray(result.rows) || !Array.isArray(result.preflight)
    || result.rows.some(row => !("pendingBasis" in row) || !("pendingCount" in row))) {
    throw new Error("INVALID_RESPONSE");
  }
  return result as OverviewResponse;
}

export function AdminNotionSyncOverview({ view = "status" }: { view?: "status" | "issues" }) {
  const [snapshot, setSnapshot] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cases = snapshot?.rows.flatMap(row => row.delivery?.cases ?? []) ?? [];
  const helpRows = snapshot?.rows.filter(row => ["organizations","adoptions","help-cases","lost-found"].includes(row.area)) ?? [];

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
          <h2 id="notion-sync-overview-heading">{view === "status" ? "Stav synchronizácie Psipedia ↔ Notion" : "D1 outbox – čakajúce záznamy a chyby"}</h2>
          <p>{view === "status" ? "Evidované mapovania, čakajúce zmeny a výsledky behov podľa agendy."
            : "Konkrétne nedokončené prenosy štyroch agend Pomoci psom; bez automatických opráv."}</p>
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
      {snapshot && view === "status" ? (
        <>
          <p className={styles.progress}>Uložené v D1 ≠ doručené do Notionu. Čaká na Notion = otvorený outbox; Synchronizované = len potvrdený konkrétny prenos. Konflikt a trvalé zlyhanie vyžadujú osobitnú kontrolu. Samotné mapovanie ani úspešný beh automatizácie nezaručujú aktuálnu zhodu.</p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Oblasť</th>
                  <th scope="col">Evidencia</th>
                  <th scope="col">Počet</th>
                  <th scope="col">Posledný zapísaný sync</th>
                  <th scope="col">Zmeny bez potvrdenia</th>
                  <th scope="col">Admin → Notion (outbox)</th>
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
                    <td>{pendingLabel(row)}</td>
                    <td>{row.delivery
                      ? `${row.delivery.pending} čaká · ${row.delivery.processing} spracováva sa · ${row.delivery.review} na kontrolu (z toho ${row.delivery.permanentFailure} po vyčerpaní pokusov)`
                      : "Neoverené – bez dostupnej evidencie doručenia"}</td>
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
          <details className={styles.details}>
            <summary>Konfigurácia synchronizácie – read-only prednasadzovacia kontrola</summary>
            <p>Toto je kontrola aktuálnych nastavení Workera a existujúcich D1 tabuliek.
              Neprezrádza tokeny ani nemeria dostupnosť Notion API.</p>
            <ul>
              {snapshot.preflight.map((check) => (
                <li key={check.area}>
                  <strong>{check.label}:</strong> {configurationLabels[check.status]}
                  {" · "}{configurationDetailLabels[check.details]}
                </li>
              ))}
            </ul>
          </details>
          <p className={styles.progress}>
            D1 evidencia načítaná: {formatDate(snapshot.checkedAt)}.
            Posledný beh je doložený uloženou udalosťou automatizácie; Podujatia a päť oblastí Pomoci psom
            zdieľajú jednu hodinovú úlohu, takže zobrazujú spoločný výsledok, nie samostatné overenie každej oblasti.
            Ak chýba záznam, údaj zostáva neoverený. Toto nie je živý stav synchronizátora.
            Počty „bez zhody revízie“ sú iba indikátory zmeny v D1; redakčný outbox eviduje iba časť článkových úprav.
            Nula neznamená úplnú zhodu ani prázdny Notion front.
            Čas posledného mapovania ani úspešný beh nedokazuje aktuálnu dostupnosť Notionu či zhodu obsahu.
            Konflikty skontroluj v audite nižšie.
          </p>
        </>
      ) : null}
      {snapshot && view === "issues" ? (
        <>
          <p className={styles.progress}>Zápis do D1 a doručenie do Notionu sú dva samostatné kroky. Stav REVIEW môže byť konflikt, ochranné zablokovanie alebo chyba prenosu; trvalé zlyhanie označujeme iba pri vyčerpaných opakovaniach NOTION_RETRY_FAILED.</p>
          {helpRows.some(row => row.delivery == null)
            ? <p role="status">Pre niektoré agendy nie je dostupná tabuľka outboxu alebo jej čítanie zlyhalo. Neznámy stav neznamená nula chýb.</p> : null}
          {cases.length ? <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Agenda</th><th>Záznam</th><th>Stav</th><th>Dôvod a ďalší krok</th><th>Otvoriť</th></tr></thead>
              <tbody>{cases.map(item => <tr key={item.agenda + ":" + item.entityId}>
                <td>{snapshot.rows.find(row => row.area === item.agenda)?.label ?? item.agenda}</td>
                <td>#{item.entityId}</td>
                <td>{caseStatus(item)} · pokusov {item.attempts}</td>
                <td>{item.errorCode ? `Kód: ${item.errorCode}. ` : ""}{caseAction(item)}</td>
                <td><Link href={helpEditors[item.agenda] + item.entityId}>Otvoriť editor</Link></td>
              </tr>)}</tbody>
            </table>
          </div> : <p>V dostupnej evidencii nie sú otvorené prípady na zobrazenie; v ostatných agendách použi audit nižšie.</p>}
          {helpRows.some(row => row.delivery?.truncated)
            ? <p role="status">Zobrazuje sa najviac 50 najnovších alebo prioritných prípadov. Ďalšie prípady môžu zostať vo fronte.</p> : null}
          <p className={styles.progress}>Táto obrazovka nerobí žiadne zmeny. Pred ručným prenosom skontroluj review lock, najnovšie hodnoty jednotlivých polí a potvrdené Google Place. Oprava chyby nevyžaduje meniť globálne priority.</p>
        </>
      ) : null}
    </section>
  );
}

export type NotionWorkspaceTab = "status" | "issues" | "fields" | "transfer";
const workspaceTabs: {value:NotionWorkspaceTab;label:string}[] = [
  {value:"status",label:"Stav synchronizácie"},
  {value:"issues",label:"Chyby a konflikty"},
  {value:"fields",label:"Nastavenia polí"},
  {value:"transfer",label:"Manuálny prenos"},
];

export function AdminNotionWorkspace({initialTab="status"}:{initialTab?:NotionWorkspaceTab}) {
  const [tab,setTab] = useState<NotionWorkspaceTab>(initialTab);
  return <div data-admin-content-module="notion-workspace">
    <nav role="tablist" aria-label="Pracovisko Notion" className={styles.controls}>
      {workspaceTabs.map(item => <button key={item.value} type="button" role="tab"
        id={"notion-tab-"+item.value} aria-controls={"notion-panel-"+item.value}
        aria-selected={tab===item.value} tabIndex={tab===item.value?0:-1}
        className={tab===item.value?"admin-primary-action":styles.secondary}
        onClick={()=>setTab(item.value)}>{item.label}</button>)}
    </nav>
    <div id={"notion-panel-"+tab} role="tabpanel" aria-labelledby={"notion-tab-"+tab}>
      {tab==="status" ? <AdminNotionSyncOverview /> : null}
      {tab==="issues" ? <><AdminNotionSyncOverview view="issues" /><AdminNotionDataQualityAudit /></> : null}
      {tab==="fields" ? <AdminNotionFieldSettings /> : null}
      {tab==="transfer" ? <AdminNotionManualTransfer /> : null}
    </div>
  </div>;
}
