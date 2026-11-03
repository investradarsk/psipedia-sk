"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_VISUAL_AUDIT_HTML_BYTES, classifyHtmlInspection,
  safePublicHtmlAuditPath, validHtmlProbe,
  type HtmlEvidenceResult, type HtmlProbe, type ComponentHtmlId,
} from "@/lib/visual-library-html-evidence";
import type { DynamicUrlKind } from "@/lib/visual-library-dynamic-urls-contract";
import styles from "./admin-visual-library.module.css";

const TIMEOUT_MS = 9_000;

type Props = {
  url: string;
  anchorId?: string;
  profileKind?: DynamicUrlKind;
  componentId?: ComponentHtmlId;
};

/**
 * Explicit one-click inspection; NEVER crawl automatically on mount.
 * No POST, no cookies, no external host and no D1 query. A successful check
 * only proves the marker occurs in server HTML at inspection time, not in a
 * hydrated/visible browser viewport.
 */
export function AdminVisualLibraryHtmlCheck({url,anchorId,profileKind,componentId}: Props) {
  const [loading,setLoading] = useState(false);
  const [result,setResult] = useState<HtmlEvidenceResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const path = safePublicHtmlAuditPath(url);
  const probe: HtmlProbe | null = anchorId
    ? {kind:"anchor",anchorId}
    : componentId ? {kind:"component",componentId}
    : profileKind ? {kind:"profile",profileKind} : null;
  const eligible = path !== null && probe !== null && validHtmlProbe(probe);

  useEffect(() => () => controller.current?.abort(), []);

  const inspect = async () => {
    if (!eligible || !path || !probe || loading) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setResult(null);
    const checkedAt = new Date().toISOString();
    const unavailable = (explanation:string): HtmlEvidenceResult => ({
      state:"unavailable", explanation,checkedAt,checkedPath:path,
    });
    const timeout = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      // Relative path intentionally pins the request to the browser's own
      // origin. Redirects are rejected so a login/404 redirect can't pass.
      const response = await fetch(path, {
        method:"GET",credentials:"omit",mode:"same-origin",
        cache:"no-store",redirect:"error",signal:abort.signal,
      });
      if (response.status !== 200 || !response.ok || response.redirected) {
        setResult(unavailable("HTTP "+response.status+": verejnú stránku nie je možné potvrdiť."));
        return;
      }
      const type = response.headers.get("content-type") ?? "";
      if (!/^text\/html(?:;|$)/i.test(type.trim())) {
        setResult(unavailable("Odpoveď nie je HTML stránka."));
        return;
      }
      const rawLength = Number(response.headers.get("content-length") ?? 0);
      if (rawLength > MAX_VISUAL_AUDIT_HTML_BYTES) {
        setResult(unavailable("HTML prekračuje bezpečný limit kontroly."));
        return;
      }
      if (!response.body) {
        setResult(unavailable("Prehliadač nepodporuje obmedzené čítanie HTML."));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let html = "";
      let size = 0;
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_VISUAL_AUDIT_HTML_BYTES) {
          await reader.cancel();
          setResult(unavailable("HTML prekračuje bezpečný limit 1,5 MB."));
          return;
        }
        html += decoder.decode(value,{stream:true});
      }
      html += decoder.decode();
      // DOMParser produces an inert document; IDs inside script payloads do
      // not count as real rendered elements in the parsed server markup.
      const doc = new DOMParser().parseFromString(html,"text/html");
      const verdict = classifyHtmlInspection(doc,probe);
      setResult({...verdict,checkedAt,checkedPath:path});
    } catch (error) {
      setResult(unavailable(abort.signal.aborted
        ? "Kontrola bola prerušená alebo uplynul časový limit 9 sekúnd."
        : "Verejné HTML nebolo dostupné. Samotná chyba siete neznamená chýbajúci komponent."));
      if (error instanceof Error && error.name !== "AbortError") {
        console.warn("visual_library_html_inspection_failed",path,error.message);
      }
    } finally {
      clearTimeout(timeout);
      if (controller.current === abort) controller.current = null;
      setLoading(false);
    }
  };

  const labels = {
    verified:"Potvrdené v HTML",
    "page-only":"Stránka načítaná, prvok nepotvrdený",
    missing:"V HTML nenájdené",
    unavailable:"Kontrola nedostupná",
  } as const;

  return <div className={styles.htmlAudit} data-html-audit>
    <button type="button" className={styles.moreButton}
      disabled={!eligible || loading} onClick={() => void inspect()}>
      {loading ? "Overujem HTML…" : componentId && !anchorId
        ? "Overiť prítomnosť komponentu v HTML"
        : "Overiť HTML stránky"}
    </button>
    {!eligible && <small>Bez bezpečnej presnej URL a značky nemožno potvrdiť výskyt.</small>}
    {result && <div className={styles.htmlAuditResult} role="status" aria-live="polite"
      data-html-evidence={result.state}>
      <strong>{labels[result.state]}</strong>
      <span>{result.explanation}</span>
      <small>Kontrola {new Date(result.checkedAt).toLocaleString("sk-SK",
        {timeZone:"Europe/Bratislava"})} · {result.checkedPath} · aktuálna doména prehliadača</small>
    </div>}
  </div>;
}
