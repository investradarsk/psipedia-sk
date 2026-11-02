"use client";

import { useRef, useState } from "react";
import {
  classifyPublicLink, internalPublicUrl, isAllowedPublicPath,
  LINK_CHECK_CONCURRENCY, LINK_HEALTH_SEED_PATHS, MAX_LINK_SOURCE_PAGES, MAX_LINK_TARGETS,
  type LinkCheckState,
} from "@/lib/link-health";
import styles from "./admin-link-health-checker.module.css";

type Finding = {
  source: string;
  target: string;
  label: string;
  status: number | null;
  state: LinkCheckState;
};
type ScanReport = {
  checkedAt: string;
  sourceCount: number;
  checkedTargets: number;
  truncated: boolean;
  findings: Finding[];
};

async function requestStatus(url: string, method: "HEAD" | "GET", signal: AbortSignal): Promise<number | null> {
  let next = url;
  for (let redirects = 0; redirects <= 2; redirects++) {
    try {
      const response = await fetch(next, {
        method, signal, redirect: "manual", credentials: "omit", cache: "default",
      });
      if (response.body) void response.body.cancel().catch(() => undefined);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const destination = location ? internalPublicUrl(location, next) : null;
        if (!destination || new URL(destination).origin !== window.location.origin) return null;
        next = destination;
        continue;
      }
      return response.status;
    } catch {
      // A timeout or blocked request is unverified, not evidence of 404.
      return null;
    }
  }
  return null;
}
async function checkTarget(url: string, signal: AbortSignal) {
  const head = await requestStatus(url, "HEAD", signal);
  // Some hosts reject HEAD, or return a false 404 for HEAD only.
  if (head === 404 || head === 405 || head === 501) {
    return requestStatus(url, "GET", signal);
  }
  return head;
}
function collectLinks(doc: Document, source: string, origin: string) {
  const found = new Map<string, string>();
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const url = internalPublicUrl(anchor.getAttribute("href"), source);
    if (!url || new URL(url).origin !== origin) continue;
    if (!found.has(url)) found.set(url, (anchor.textContent || anchor.getAttribute("aria-label") || "").trim().slice(0, 90));
  }
  return found;
}
function readable(state: LinkCheckState) {
  return state === "broken" ? "Nefunkčný" :
    state === "server-error" ? "Chyba servera" :
      state === "unverified" ? "Nepotvrdený" : "V poriadku";
}

export function AdminLinkHealthChecker() {
  const [customPath, setCustomPath] = useState("");
  const [includeSeed, setIncludeSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"issues" | "all">("issues");
  const controller = useRef<AbortController | null>(null);

  async function runScan() {
    if (busy) return;
    setError("");
    setReport(null);
    const origin = window.location.origin;
    const custom = customPath.trim();
    const url = custom ? internalPublicUrl(custom, origin) : null;
    if (custom && (!custom.startsWith("/") || !url || !isAllowedPublicPath(new URL(url).pathname))) {
      setError("Zadaj iba verejnú internú cestu, napríklad /clanky/nazov-clanku.");
      return;
    }
    if (!includeSeed && !url) {
      setError("Vyber základné stránky alebo zadaj konkrétnu verejnú cestu.");
      return;
    }
    const sources = [...new Set([
      ...(includeSeed ? LINK_HEALTH_SEED_PATHS.map(path => origin + path) : []),
      ...(url ? [url] : []),
    ])].slice(0, MAX_LINK_SOURCE_PAGES);
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      const findings: Finding[] = [];
      const candidates = new Map<string, { source: string; label: string }[]>();
      const sourcePagesChecked = new Set<string>();
      for (const source of sources) {
        if (abort.signal.aborted) throw new Error("Kontrola bola prerušená.");
        setProgress("Načítavam verejnú stránku " + (sourcePagesChecked.size + 1) + " z " + sources.length);
        let response: Response | null = null;
        try {
          const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(9000)]);
          let target = source;
          for (let redirects = 0; redirects <= 2; redirects++) {
            response = await fetch(target, { signal, credentials: "omit", redirect: "manual", cache: "default" });
            if (response.status < 300 || response.status >= 400) break;
            const location = response.headers.get("location");
            const destination = location ? internalPublicUrl(location, target) : null;
            if (!destination || new URL(destination).origin !== origin) { response = null; break; }
            target = destination;
          }
        } catch { response = null; /* shown as unverified below */ }
        sourcePagesChecked.add(source);
        const state = classifyPublicLink(response?.status ?? null);
        const returnedPublic = response && internalPublicUrl(response.url, origin);
        if (state !== "ok" || !returnedPublic || !response?.headers.get("content-type")?.includes("text/html")) {
          findings.push({ source, target: source, label: "Načítanie stránky", status: response?.status ?? null, state: state === "ok" ? "unverified" : state });
          continue;
        }
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        for (const [target, label] of collectLinks(doc, source, origin)) {
          const uses = candidates.get(target) ?? [];
          uses.push({ source, label });
          candidates.set(target, uses);
        }
      }
      const urls = [...candidates.keys()].slice(0, MAX_LINK_TARGETS);
      const truncated = candidates.size > urls.length;
      let cursor = 0;
      let finished = 0;
      async function worker() {
        while (cursor < urls.length && !abort.signal.aborted) {
          const index = cursor++;
          const target = urls[index];
          if (!target) return;
          const status = await checkTarget(target, AbortSignal.any([abort.signal, AbortSignal.timeout(9000)]));
          const state = classifyPublicLink(status);
          for (const use of candidates.get(target) ?? []) {
            findings.push({ source: use.source, target, label: use.label, status, state });
          }
          finished++;
          setProgress("Overujem odkazy " + finished + " z " + urls.length);
        }
      }
      await Promise.all(Array.from({ length: Math.min(LINK_CHECK_CONCURRENCY, urls.length) }, () => worker()));
      if (abort.signal.aborted) throw new Error("Kontrola bola prerušená.");
      setReport({
        checkedAt: new Date().toISOString(),
        sourceCount: sourcePagesChecked.size,
        checkedTargets: urls.length,
        truncated,
        findings: findings.sort((a, b) =>
          (a.state === "broken" ? -3 : a.state === "server-error" ? -2 : a.state === "unverified" ? -1 : 0) -
          (b.state === "broken" ? -3 : b.state === "server-error" ? -2 : b.state === "unverified" ? -1 : 0)),
      });
      setProgress("");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Kontrola sa nepodarila.");
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  function saveReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const temp = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = temp;
    link.download = "psipedia-kontrola-odkazov-" + report.checkedAt.slice(0, 10) + ".json";
    link.click();
    URL.revokeObjectURL(temp);
  }
  const issues = report?.findings.filter(entry => entry.state !== "ok") ?? [];
  const displayed = (filter === "issues" ? issues : report?.findings ?? []).slice(0, 180);
  const broken = issues.filter(entry => entry.state === "broken").length;
  const serverErrors = issues.filter(entry => entry.state === "server-error").length;
  const unknown = issues.filter(entry => entry.state === "unverified").length;
  return (
    <section className={styles.root} aria-label="Kontrola nefunkčných odkazov">
      <div className={styles.info}>
        <strong>Bezpečná kontrola verejných stránok</strong>
        <p>Kontrola sa spustí iba po kliknutí. Preverí najviac {MAX_LINK_SOURCE_PAGES} stránok a {MAX_LINK_TARGETS} rôznych interných odkazov. Neotvára administračné ani externé adresy a nič neupravuje.</p>
      </div>
      <div className={styles.controls}>
        <label className={styles.check}><input type="checkbox" checked={includeSeed} disabled={busy} onChange={e => setIncludeSeed(e.target.checked)} /> Skontrolovať aj základné stránky ({LINK_HEALTH_SEED_PATHS.length})</label>
        <label className={styles.path}><span>Konkrétna stránka (voliteľné)</span>
          <input type="text" inputMode="url" disabled={busy} value={customPath}
            onChange={e => setCustomPath(e.target.value)} placeholder="/clanky/konkretny-clanok" maxLength={340}/></label>
        <div className={styles.actions}>
          <button type="button" onClick={() => void runScan()} disabled={busy}>{busy ? "Kontrolujem…" : "Spustiť kontrolu"}</button>
          {busy && <button type="button" onClick={() => controller.current?.abort()}>Zastaviť</button>}
          {report && <button type="button" onClick={saveReport}>Uložiť výsledky (JSON)</button>}
        </div>
      </div>
      {progress && <p role="status" className={styles.progress}>{progress}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {report && (
        <div className={styles.results}>
          <div className={styles.metrics}>
            <span><strong>{report.sourceCount}</strong> stránok</span>
            <span><strong>{report.checkedTargets}</strong> odkazov</span>
            <span><strong>{broken}</strong> nefunkčných výskytov</span>
            <span><strong>{serverErrors}</strong> chyby servera</span>
            <span><strong>{unknown}</strong> nepotvrdených</span>
          </div>
          {report.truncated && <p className={styles.warning}>Bol dosiahnutý limit odkazov. Výsledok je iba čiastočný; ďalšiu stránku skontroluj samostatne.</p>}
          <div className={styles.resultHeader}>
            <strong>Výsledky na opravu</strong>
            <label>Filter <select value={filter} onChange={e => setFilter(e.target.value as "issues" | "all")}>
              <option value="issues">Len chyby a nepotvrdené</option>
              <option value="all">Všetky odkazy</option>
            </select></label>
          </div>
          {!displayed.length && <p>V skontrolovanej vzorke sa nenašla potvrdená chyba. Nejde o kontrolu celého webu.</p>}
          {displayed.length > 0 && <div className={styles.scroll}>
            <table><thead><tr><th>Stav</th><th>Na stránke</th><th>Odkaz</th><th>HTTP</th></tr></thead>
              <tbody>{displayed.map((item, i) => (
                <tr key={item.source + "|" + item.target + "|" + i}>
                  <td><span className={item.state === "broken" ? styles.bad : item.state === "ok" ? styles.good : styles.unknown}>{readable(item.state)}</span></td>
                  <td><a href={item.source} target="_blank" rel="noopener noreferrer">{new URL(item.source).pathname}</a></td>
                  <td><a href={item.target} target="_blank" rel="noopener noreferrer">{new URL(item.target).pathname}</a>{item.label && <small>{item.label}</small>}</td>
                  <td>{item.status ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          <small>Kontrola: {new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.checkedAt))}. HTTP 403/429, blokovanie, timeout a odchádzajúce presmerovania sú označené ako nepotvrdené, nie ako pokazený odkaz.</small>
        </div>
      )}
      <div className={styles.automated}>
        <strong>Pravidelná kontrola na GitHube</strong>
        <p>Samostatná týždenná kontrola používa open-source Linkinator, preverí obmedzenú vzorku verejných stránok a uloží prehľad zdroj → nefunkčný odkaz do GitHub Actions. Nevykonáva zmeny v obsahu.</p>
        <a href="https://github.com/investradarsk/psipedia-sk/actions/workflows/link-health-audit.yml" target="_blank" rel="noopener noreferrer">Pozrieť týždenné výsledky na GitHube ↗</a>
      </div>
    </section>
  );
}
