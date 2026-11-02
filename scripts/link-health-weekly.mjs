#!/usr/bin/env node
/**
 * Weekly read-only, bounded public links audit.
 * Six fixed pages plus at most six rotating sitemap entries.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const LINK_HEALTH_BASE_URL = "https://psipedia.sk";
export const LINK_HEALTH_MAX_PAGES = 12;
export const LINK_HEALTH_FIXED_PATHS = Object.freeze([
  "/", "/clanky", "/plemena", "/adresar", "/podujatia", "/pomoc-psom",
]);
export const LINK_HEALTH_SAMPLED_PREFIXES = Object.freeze([
  "/clanky/", "/plemena/", "/adresar/", "/podujatia/", "/pomoc-psom/", "/steniatka/",
]);
const REPORT_DIR = "reports/link-health";

export function allowedPage(raw, origin = LINK_HEALTH_BASE_URL) {
  if (typeof raw !== "string" || raw.length > 750) return null;
  let url;
  try { url = new URL(raw, origin); } catch { return null; }
  if (url.origin !== origin || url.username || url.password) return null;
  const path = url.pathname;
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 320 ||
      /\/(?:admin|api|_next|cdn-cgi|auth|login|logout|hladat|oblubene)(\/|$)/i.test(path) ||
      /\/\./.test(path) || /\.(?:pdf|jpg|png|svg|webp|txt|xml|json|mp4)$/i.test(path)) return null;
  url.hash = ""; url.search = "";
  return url.href;
}
export function sitemapUrls(xml) {
  if (typeof xml !== "string") return [];
  const urls = [];
  const rx = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = rx.exec(xml)) !== null) {
    const candidate = allowedPage(match[1].replace(/&amp;/g, "&").trim());
    if (candidate) urls.push(candidate);
  }
  return [...new Set(urls)];
}
export function sampleLinkHealthPages(sitemap, week = 0) {
  const pages = LINK_HEALTH_FIXED_PATHS.map(path => LINK_HEALTH_BASE_URL + path);
  const safeWeek = Math.max(0, Number.isSafeInteger(week) ? week : 0);
  for (const prefix of LINK_HEALTH_SAMPLED_PREFIXES) {
    const pool = sitemap.filter(value => new URL(value).pathname.startsWith(prefix));
    if (pool.length) pages.push(pool[safeWeek % pool.length]);
  }
  return [...new Set(pages)].slice(0, LINK_HEALTH_MAX_PAGES);
}
async function readSitemap(maxBytes = 2_500_000) {
  const response = await fetch(LINK_HEALTH_BASE_URL + "/sitemap.xml", {
    headers: { accept: "application/xml, text/xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Sitemap HTTP " + response.status);
  if (Number(response.headers.get("content-length") || "0") > maxBytes) throw new Error("Sitemap exceeds limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Sitemap body missing.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Sitemap exceeds limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export function summarizeLinkinatorResult(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.links)) {
    throw new Error("Linkinator output is not a JSON links array.");
  }
  const links = input.links.filter(item => item && typeof item.url === "string");
  const findings = links.flatMap(item => {
    const status = Number.isInteger(item.status) ? item.status : null;
    const issue = status === 404 || status === 410 ? "broken"
      : status !== null && status >= 500 && status <= 599 ? "server-error"
        : item.state === "BROKEN" ? "unverified" : null;
    if (!issue) return [];
    const target = allowedPage(item.url);
    const source = typeof item.parent === "string" ? allowedPage(item.parent) : null;
    if (!target) return [];
    return [{
      source: source ?? "(zdroj sa nepodarilo určiť)",
      target, status, issue, anchor: String(item.displayText ?? "").trim().slice(0, 90),
    }];
  });
  const counts = {
    checkedLinks: links.length,
    broken: findings.filter(f => f.issue === "broken").length,
    serverErrors: findings.filter(f => f.issue === "server-error").length,
    unverified: findings.filter(f => f.issue === "unverified").length,
  };
  return { checkedAt: new Date().toISOString(), counts, findings };
}
function safeMarkdown(value) {
  return String(value).replace(/[|\x60<>\r\n]/g, " ").slice(0, 260);
}
export function markdownLinkHealthReport(report, scannedPages) {
  const lines = [
    "# Psipedia – týždenná kontrola interných odkazov", "",
    "Read-only, Linkinator 8.1.0. Obmedzená vzorka, nie celý web.", "",
    "- Skenovaných zdrojových stránok: " + scannedPages.length,
    "- Overených výsledkov: " + report.counts.checkedLinks,
    "- Odkazy 404/410: " + report.counts.broken,
    "- Chyby servera 5xx: " + report.counts.serverErrors,
    "- Iné nepotvrdené chyby: " + report.counts.unverified,
    "", "## Čo preveriť", "",
  ];
  if (!report.findings.length) lines.push("V tejto vzorke nie sú potvrdené chybné interné odkazy.");
  else {
    lines.push("| Zdrojová stránka | Nefunkčný cieľ | HTTP / stav |", "|---|---|---|");
    for (const f of report.findings.slice(0, 80)) {
      lines.push("| " + safeMarkdown(f.source) + " | " + safeMarkdown(f.target) + " | " + safeMarkdown(f.status ?? f.issue) + " |");
    }
    if (report.findings.length > 80) lines.push("", "Ďalšie prípady sú v priloženom JSON reporte.");
  }
  lines.push("", "## Kontrolované stránky", "");
  for (const page of scannedPages) lines.push("- " + page);
  lines.push("", "Žiadne odkazy neboli automaticky opravené ani odstránené.", "");
  return lines.join("\n");
}
async function select() {
  let fromSitemap = [];
  let note = "Sitemap accessible";
  try { fromSitemap = sitemapUrls(await readSitemap()); }
  catch (e) { note = "Sitemap unavailable: " + (e instanceof Error ? e.message : String(e)); }
  const week = Math.floor(Date.now() / (7 * 86400_000));
  const pages = sampleLinkHealthPages(fromSitemap, week);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(resolve(REPORT_DIR, "urls.txt"), pages.join("\n") + "\n");
  await writeFile(resolve(REPORT_DIR, "selection.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), note, totalSitemapUrls: fromSitemap.length, pages }, null, 2));
  console.log("Link audit selected", pages.length, "source pages;", note);
}
async function report() {
  const selected = JSON.parse(await readFile(resolve(REPORT_DIR, "selection.json"), "utf8"));
  const raw = await readFile(resolve(REPORT_DIR, "linkinator.json"), "utf8");
  const result = summarizeLinkinatorResult(JSON.parse(raw));
  await writeFile(resolve(REPORT_DIR, "summary.json"), JSON.stringify(result, null, 2));
  const markdown = markdownLinkHealthReport(result, selected.pages);
  await writeFile(resolve(REPORT_DIR, "summary.md"), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "select") await select();
  else if (command === "report") await report();
  else { console.error("Use: select | report"); process.exitCode = 2; }
}
