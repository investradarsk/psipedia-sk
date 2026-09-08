#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://psipedia.sk";
const DEFAULT_MAX_PAGES = 2_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 1;
const MAX_REDIRECT_HOPS = 10;
const MAX_SITEMAPS = 50;

const SKIPPED_PROTOCOLS = /^(?:mailto|tel|javascript|data|blob):/i;
const NON_HTML_EXTENSIONS = /\.(?:avif|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|ogg|pdf|png|svg|ttf|txt|webm|webp|woff2?|xml|zip)$/i;

export function parseArguments(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    sitemapUrl: null,
    maxPages: DEFAULT_MAX_PAGES,
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--base" && value) {
      options.baseUrl = value;
      index += 1;
    } else if (argument === "--sitemap" && value) {
      options.sitemapUrl = value;
      index += 1;
    } else if (argument === "--max-pages" && value) {
      options.maxPages = parsePositiveInteger(value, "--max-pages");
      index += 1;
    } else if (argument === "--concurrency" && value) {
      options.concurrency = parsePositiveInteger(value, "--concurrency");
      index += 1;
    } else if (argument === "--timeout-ms" && value) {
      options.timeoutMs = parsePositiveInteger(value, "--timeout-ms");
      index += 1;
    } else if (argument === "--retries" && value) {
      options.retries = parsePositiveInteger(value, "--retries");
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  options.sitemapUrl = options.sitemapUrl
    ? normalizeUrl(options.sitemapUrl, options.baseUrl)
    : `${options.baseUrl}/sitemap.xml`;
  return options;
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Base URL must use HTTP or HTTPS");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href.replace(/\/$/, "");
}

export function normalizeUrl(value, baseUrl) {
  if (!value || SKIPPED_PROTOCOLS.test(value.trim())) return null;
  try {
    const url = new URL(value.trim(), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.href;
  } catch {
    return null;
  }
}

function isInternal(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function shouldCrawl(url) {
  const parsed = new URL(url);
  return !NON_HTML_EXTENSIONS.test(parsed.pathname) && !(parsed.pathname === "/hladat" && parsed.search);
}

function shouldCheckInternal(url) {
  const parsed = new URL(url);
  return !(parsed.pathname === "/hladat" && parsed.search);
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function extractSitemapLocations(xml, baseUrl) {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)]
    .map((match) => normalizeUrl(decodeXml(match[1].trim()), baseUrl))
    .filter(Boolean);
}

function extractAttributeValues(html, tagName, attributeName) {
  const values = [];
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const attributePattern = new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  for (const tag of html.match(tagPattern) ?? []) {
    const match = tag.match(attributePattern);
    if (match) values.push(decodeXml(match[1] ?? match[2] ?? match[3] ?? ""));
  }
  return values;
}

export function extractHtmlReferences(html, pageUrl) {
  const links = extractAttributeValues(html, "a", "href")
    .map((value) => normalizeUrl(value, pageUrl))
    .filter(Boolean);
  const images = [
    ...extractAttributeValues(html, "img", "src"),
    ...extractAttributeValues(html, "source", "src"),
  ].map((value) => normalizeUrl(value, pageUrl)).filter(Boolean);
  const canonicalTags = (html.match(/<link\b[^>]*>/gi) ?? []).filter((tag) => {
    const rel = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").split(/\s+/).some((value) => value.toLowerCase() === "canonical");
  });
  const canonicals = canonicalTags.map((tag) => {
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3] ?? "";
    return { raw, normalized: normalizeUrl(raw, pageUrl), absolute: /^https?:\/\//i.test(raw) };
  });
  const noindex = (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) => {
    const name = tag.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const agent = (name?.[1] ?? name?.[2] ?? name?.[3] ?? "").toLowerCase();
    const directives = (content?.[1] ?? content?.[2] ?? content?.[3] ?? "").toLowerCase().split(/[\s,]+/);
    return (agent === "robots" || agent === "googlebot") && directives.includes("noindex");
  });
  return { links, images, canonicals, noindex };
}

function isHtml(response) {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

export async function fetchWithRedirectTrace(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, readBody = false } = {}) {
  const history = [];
  const visited = new Set([url]);
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: readBody ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" : "*/*",
          "user-agent": "Psipedia-Production-Audit/1.0 (+https://psipedia.sk)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const location = response.headers.get("location");
    history.push({ url: currentUrl, status: response.status, location });
    if (response.status < 300 || response.status >= 400 || !location) {
      const body = readBody ? await response.text() : "";
      return { url, finalUrl: currentUrl, response, body, history, loop: false, tooManyHops: false };
    }

    const nextUrl = normalizeUrl(location, currentUrl);
    if (!nextUrl || visited.has(nextUrl)) {
      return { url, finalUrl: nextUrl ?? currentUrl, response, body: "", history, loop: true, tooManyHops: false };
    }
    visited.add(nextUrl);
    currentUrl = nextUrl;
  }

  return { url, finalUrl: currentUrl, response: null, body: "", history, loop: false, tooManyHops: true };
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function addIssue(collection, issue) {
  const key = JSON.stringify(issue);
  if (!collection.keys.has(key)) {
    collection.keys.add(key);
    collection.items.push(issue);
  }
}

function createIssueCollection() {
  return { keys: new Set(), items: [] };
}

function statusCategory(status) {
  if (status === 404) return "notFound";
  if (status >= 500) return "serverErrors";
  return null;
}

function recordRequestResult(report, result, context) {
  if (result.error) {
    addIssue(report.requestErrors, { url: context.url, source: context.source, error: result.error });
    return;
  }
  const terminal = result.history.at(-1);
  if (!terminal) return;
  const category = statusCategory(terminal.status);
  if (category) addIssue(report[category], { url: context.url, status: terminal.status, source: context.source });
  if (result.history.length > 1) {
    addIssue(report.redirects, { url: context.url, hops: result.history.length - 1, finalUrl: result.finalUrl, source: context.source });
  }
  if (result.history.length > 2) {
    addIssue(report.redirectChains, { url: context.url, hops: result.history.length - 1, history: result.history, source: context.source });
  }
  if (result.loop || result.tooManyHops) {
    addIssue(report.redirectLoops, { url: context.url, history: result.history, source: context.source });
  }
}

async function safeFetch(url, options) {
  let lastResult;
  const retries = options.retries ?? DEFAULT_RETRIES;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      lastResult = await fetchWithRedirectTrace(url, options);
    } catch (error) {
      lastResult = { url, error: error instanceof Error ? error.message : String(error), history: [] };
    }
    const status = lastResult.history?.at(-1)?.status;
    if (!lastResult.error && !(status >= 500)) return { ...lastResult, attempts: attempt + 1 };
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return { ...lastResult, attempts: retries + 1 };
}

async function loadSitemapUrls(options, report) {
  const pending = [options.sitemapUrl];
  const seenSitemaps = new Set();
  const urls = [];

  while (pending.length > 0 && seenSitemaps.size < MAX_SITEMAPS) {
    const sitemapUrl = pending.shift();
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    const result = await safeFetch(sitemapUrl, { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs, retries: options.retries, readBody: true });
    report.checkedRequests += 1;
    recordRequestResult(report, result, { url: sitemapUrl, source: "sitemap" });
    if (result.error) continue;
    const terminal = result.history.at(-1);
    if (result.history.length > 1 || terminal?.status !== 200) {
      addIssue(report.sitemapIssues, { url: sitemapUrl, status: terminal?.status ?? null, reason: result.history.length > 1 ? "redirect" : "non-200" });
      continue;
    }
    const locations = extractSitemapLocations(result.body, sitemapUrl);
    const isIndex = /<sitemapindex\b/i.test(result.body);
    if (isIndex) pending.push(...locations);
    else urls.push(...locations);
  }

  if (pending.length > 0) addIssue(report.sitemapIssues, { url: options.sitemapUrl, reason: `more than ${MAX_SITEMAPS} sitemap files` });
  const counts = new Map();
  for (const url of urls) counts.set(url, (counts.get(url) ?? 0) + 1);
  for (const [url, count] of counts) {
    if (count > 1) addIssue(report.duplicateSitemapUrls, { url, count });
  }
  return [...counts.keys()];
}

export async function auditProductionSite(options, { fetchImpl = fetch } = {}) {
  const origin = new URL(options.baseUrl).origin;
  const report = {
    checkedRequests: 0,
    checkedPages: 0,
    checkedImages: 0,
    sitemapUrlCount: 0,
    crawledPageUrls: [],
    notFound: createIssueCollection(),
    serverErrors: createIssueCollection(),
    redirects: createIssueCollection(),
    redirectChains: createIssueCollection(),
    redirectLoops: createIssueCollection(),
    brokenImages: createIssueCollection(),
    canonicalIssues: createIssueCollection(),
    sitemapIssues: createIssueCollection(),
    duplicateSitemapUrls: createIssueCollection(),
    brokenInternalUrls: createIssueCollection(),
    requestErrors: createIssueCollection(),
  };

  const effectiveOptions = { ...options, fetchImpl };
  const sitemapUrls = await loadSitemapUrls(effectiveOptions, report);
  options.onProgress?.(`Loaded ${sitemapUrls.length} unique sitemap URLs`);
  report.sitemapUrlCount = sitemapUrls.length;
  const sitemapSet = new Set(sitemapUrls);
  const pendingPages = [];
  const queuedPages = new Set();
  const checkedResources = new Map();
  const imageSources = new Map();
  const internalLinkSources = new Map();
  const canonicalSources = new Map();

  for (const url of sitemapUrls) {
    if (!isInternal(url, origin)) addIssue(report.sitemapIssues, { url, reason: "external URL in sitemap" });
  }

  const enqueuePage = (url) => {
    if (!isInternal(url, origin) || !shouldCrawl(url) || queuedPages.has(url) || queuedPages.size >= options.maxPages) return;
    queuedPages.add(url);
    pendingPages.push(url);
  };
  sitemapUrls.forEach(enqueuePage);
  enqueuePage(`${options.baseUrl}/`);

  while (pendingPages.length > 0) {
    const batch = pendingPages.splice(0, options.concurrency);
    const pageResults = await mapConcurrent(batch, options.concurrency, async (url) => {
      const result = await safeFetch(url, { fetchImpl, timeoutMs: options.timeoutMs, readBody: true });
      checkedResources.set(url, result);
      return { url, result };
    });

    for (const { url, result } of pageResults) {
      report.checkedRequests += 1;
      report.checkedPages += 1;
      report.crawledPageUrls.push(url);
      if (report.checkedPages % 100 === 0) options.onProgress?.(`Crawled ${report.checkedPages}/${options.maxPages} HTML pages`);
      recordRequestResult(report, result, { url, source: sitemapSet.has(url) ? "sitemap-url" : "crawl" });
      if (sitemapSet.has(url)) {
        const terminal = result.history.at(-1);
        if (result.error || terminal?.status !== 200 || result.history.length > 1) {
          addIssue(report.sitemapIssues, { url, status: terminal?.status ?? null, reason: result.error ? "request-error" : result.history.length > 1 ? "redirect" : "non-200" });
        }
      }
      if (result.error || result.history.at(-1)?.status !== 200 || !result.response || !isHtml(result.response)) continue;

      const references = extractHtmlReferences(result.body, url);
      if (!references.noindex && references.canonicals.length !== 1) {
        addIssue(report.canonicalIssues, { url, reason: references.canonicals.length === 0 ? "missing canonical" : "multiple canonicals" });
      }
      for (const canonical of references.canonicals) {
        if (references.noindex) continue;
        if (!canonical.absolute || !canonical.normalized) {
          addIssue(report.canonicalIssues, { url, canonical: canonical.raw, reason: "canonical is not a valid absolute HTTP(S) URL" });
          continue;
        }
        if (!new URL(url).search && canonical.normalized !== url) {
          addIssue(report.canonicalIssues, { url, canonical: canonical.normalized, reason: "unexpected cross-canonical" });
        }
        if (!canonicalSources.has(canonical.normalized)) canonicalSources.set(canonical.normalized, new Set());
        canonicalSources.get(canonical.normalized).add(url);
      }
      for (const link of references.links) {
        if (!isInternal(link, origin)) continue;
        if (!shouldCheckInternal(link)) continue;
        if (!internalLinkSources.has(link)) internalLinkSources.set(link, new Set());
        internalLinkSources.get(link).add(url);
        enqueuePage(link);
      }
      for (const imageUrl of references.images) {
        if (!imageSources.has(imageUrl)) imageSources.set(imageUrl, new Set());
        imageSources.get(imageUrl).add(url);
      }
    }
  }

  const targetUrls = new Set([...internalLinkSources.keys(), ...canonicalSources.keys()]);
  const resourcesToCheck = [...targetUrls].filter((url) => !checkedResources.has(url));
  options.onProgress?.(`Checking ${resourcesToCheck.length} additional internal targets`);
  await mapConcurrent(resourcesToCheck, options.concurrency, async (url) => {
    const result = await safeFetch(url, { fetchImpl, timeoutMs: options.timeoutMs, readBody: false });
    checkedResources.set(url, result);
    report.checkedRequests += 1;
    const sources = internalLinkSources.get(url) ?? canonicalSources.get(url) ?? new Set();
    recordRequestResult(report, result, { url, source: [...sources].slice(0, 3).join(", ") });
  });

  for (const [url, sources] of internalLinkSources) {
    const result = checkedResources.get(url);
    const status = result?.history?.at(-1)?.status;
    if (!result || result.error || status >= 400 || result.loop || result.tooManyHops) {
      addIssue(report.brokenInternalUrls, { url, status: status ?? null, sources: [...sources].slice(0, 5), error: result?.error });
    }
  }

  for (const [url, sources] of canonicalSources) {
    const result = checkedResources.get(url);
    const status = result?.history?.at(-1)?.status;
    if (!result || result.error || status >= 400) {
      for (const source of sources) addIssue(report.canonicalIssues, { url: source, canonical: url, status: status ?? null, reason: "canonical target is unavailable" });
    }
  }

  options.onProgress?.(`Checking ${imageSources.size} unique image URLs`);
  await mapConcurrent([...imageSources.keys()], options.concurrency, async (url) => {
    const result = await safeFetch(url, { fetchImpl, timeoutMs: options.timeoutMs, readBody: false });
    report.checkedRequests += 1;
    report.checkedImages += 1;
    recordRequestResult(report, result, { url, source: `image:${[...imageSources.get(url)].slice(0, 3).join(", ")}` });
    const status = result.history.at(-1)?.status;
    if (result.error || status !== 200 || result.loop || result.tooManyHops) {
      addIssue(report.brokenImages, { url, status: status ?? null, sources: [...imageSources.get(url)].slice(0, 5), error: result.error });
    }
  });

  report.critical = report.serverErrors.items.length > 0
    || report.sitemapIssues.items.length > 0
    || report.duplicateSitemapUrls.items.length > 0
    || report.brokenInternalUrls.items.length > 0
    || report.brokenImages.items.length > 0
    || report.canonicalIssues.items.some((issue) => issue.reason === "canonical target is unavailable")
    || report.redirectLoops.items.length > 0;
  return report;
}

function printIssues(label, collection) {
  if (collection.items.length === 0) return;
  console.log(`\n${label} (${collection.items.length})`);
  for (const issue of collection.items.slice(0, 50)) console.log(`- ${JSON.stringify(issue)}`);
  if (collection.items.length > 50) console.log(`- ... and ${collection.items.length - 50} more`);
}

export function printReport(report) {
  console.log("\nPsipedia production audit");
  console.log(`Checked requests: ${report.checkedRequests}`);
  console.log(`Checked HTML URLs: ${report.checkedPages}`);
  console.log(`Sitemap URLs: ${report.sitemapUrlCount}`);
  console.log(`Checked images: ${report.checkedImages}`);
  console.log(`404: ${report.notFound.items.length}`);
  console.log(`5xx: ${report.serverErrors.items.length}`);
  console.log(`Redirects: ${report.redirects.items.length}`);
  console.log(`Redirect chains (>1 hop): ${report.redirectChains.items.length}`);
  console.log(`Redirect loops: ${report.redirectLoops.items.length}`);
  console.log(`Broken internal URLs: ${report.brokenInternalUrls.items.length}`);
  console.log(`Broken images: ${report.brokenImages.items.length}`);
  console.log(`Canonical issues: ${report.canonicalIssues.items.length}`);
  console.log(`Duplicate sitemap URLs: ${report.duplicateSitemapUrls.items.length}`);
  console.log(`Result: ${report.critical ? "FAILED" : "OK"}`);

  printIssues("Sitemap issues", report.sitemapIssues);
  printIssues("Duplicate sitemap URLs", report.duplicateSitemapUrls);
  printIssues("404 responses", report.notFound);
  printIssues("5xx responses", report.serverErrors);
  printIssues("Redirect chains", report.redirectChains);
  printIssues("Redirect loops", report.redirectLoops);
  printIssues("Broken internal URLs", report.brokenInternalUrls);
  printIssues("Broken images", report.brokenImages);
  printIssues("Canonical issues", report.canonicalIssues);
  printIssues("Request errors", report.requestErrors);
}

function printHelp() {
  console.log(`Usage: npm run audit:production -- [options]\n\nOptions:\n  --base <url>          Base URL (default: ${DEFAULT_BASE_URL})\n  --sitemap <url>       Sitemap URL (default: <base>/sitemap.xml)\n  --max-pages <number>  Maximum HTML pages to crawl (default: ${DEFAULT_MAX_PAGES})\n  --concurrency <n>     Concurrent requests (default: ${DEFAULT_CONCURRENCY})\n  --timeout-ms <ms>     Per-request timeout (default: ${DEFAULT_TIMEOUT_MS})\n  --retries <n>         Retries for timeouts and 5xx (default: ${DEFAULT_RETRIES})\n  --help                 Show this help`);
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    console.log(`Auditing ${options.baseUrl} via ${options.sitemapUrl}`);
    console.log(`Limits: ${options.maxPages} pages, concurrency ${options.concurrency}, timeout ${options.timeoutMs} ms, retries ${options.retries}`);
    const report = await auditProductionSite({ ...options, onProgress: (message) => console.log(message) });
    printReport(report);
    process.exitCode = report.critical ? 1 : 0;
  } catch (error) {
    console.error(`Production audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
