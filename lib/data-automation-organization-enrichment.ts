import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  normalizeAutomationIdentity,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import type { AutomationFetch } from "./data-automation-connectors.ts";

const DEFAULT_DIRECTORY_URL = "https://www.psiadusa.sk/zoznam-utulkov/";
const MAX_DIRECTORY_BYTES = 900_000;
const MAX_SITE_BYTES = 700_000;
const MAX_REDIRECTS = 3;
const MAX_CONTACT_PAGES = 2;

type DirectoryEntry = {
  name: string;
  city: string;
  region: string;
  form: string;
  websiteUrl: string | null;
  facebookUrl: string | null;
  sourceUrl: string;
};

export type OrganizationRecordEnricher = (
  record: AutomationSourceRecord,
  context: { detectedAt: string },
) => Promise<AutomationSourceRecord>;

type CreateOrganizationEnricherOptions = {
  fetchImpl?: AutomationFetch;
  directoryUrl?: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textFromHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function attribute(tag: string, name: string) {
  const pattern = new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i");
  return decodeHtml(tag.match(pattern)?.[1] ?? "").trim() || null;
}

function absoluteUrl(value: string | null, base: string) {
  if (!value) return null;
  try {
    return canonicalizeSourceUrl(new URL(value, base).toString());
  } catch {
    return null;
  }
}

function websiteFetchUrl(value: string | null) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  const url = new URL(canonical);
  if (url.protocol === "http:") url.protocol = "https:";
  const candidate = canonicalizeSourceUrl(url.toString());
  return candidate && isSafeAutomationSourceUrl(candidate) ? candidate : null;
}

function socialUrl(url: string, service: "facebook" | "instagram") {
  const canonical = canonicalizeSourceUrl(url);
  if (!canonical) return null;
  try {
    const parsed = new URL(canonical);
    const host = parsed.hostname.toLowerCase();
    const ok = service === "facebook"
      ? host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com")
      : host === "instagram.com" || host.endsWith(".instagram.com");
    return ok ? canonical : null;
  } catch {
    return null;
  }
}

function normalizedOrganizationName(value: unknown) {
  const normalized = normalizeAutomationIdentity(value);
  if (!normalized) return "";
  const stop = new Set(["oz", "obcianske", "zdruzenie", "utulok", "karantenna", "stanica", "mestska", "mestsky"]);
  const compact = normalized.split(" ").filter((part) => part && !stop.has(part)).join(" ");
  return compact.length >= 4 ? compact : normalized;
}

function sameCity(left: unknown, right: unknown) {
  const a = normalizeAutomationIdentity(left);
  const b = normalizeAutomationIdentity(right);
  return !a || !b || a === b;
}

function tableRows(html: string, baseUrl: string) {
  const rows: Array<Array<{ text: string; hrefs: string[] }>> = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: Array<{ text: string; hrefs: string[] }> = [];
    for (const cell of row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      const raw = cell[1];
      const hrefs = [...raw.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)]
        .map((match) => absoluteUrl(decodeHtml(match[1]).trim(), baseUrl))
        .filter((value): value is string => Boolean(value));
      cells.push({ text: textFromHtml(raw), hrefs });
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function parseOrganizationDirectory(html: string, sourceUrl = DEFAULT_DIRECTORY_URL): DirectoryEntry[] {
  const rows = tableRows(html, sourceUrl);
  const entries: DirectoryEntry[] = [];

  for (const cells of rows) {
    if (cells.length < 2) continue;
    const city = cells[0]?.text.trim() ?? "";
    const name = cells[1]?.text.trim() ?? "";
    if (!name || /^n[aá]zov$/i.test(name) || /^mesto$/i.test(city)) continue;

    const allLinks = cells.flatMap((cell) => cell.hrefs);
    const facebookUrl = allLinks.map((url) => socialUrl(url, "facebook")).find(Boolean) ?? null;
    const websiteUrl = allLinks.find((url) => {
      if (socialUrl(url, "facebook") || socialUrl(url, "instagram")) return false;
      try {
        const host = new URL(url).hostname.toLowerCase();
        return !host.endsWith("psiadusa.sk");
      } catch {
        return false;
      }
    }) ?? null;

    entries.push({
      name,
      city,
      region: cells[2]?.text.trim() ?? "",
      form: cells[3]?.text.trim() ?? "",
      websiteUrl,
      facebookUrl,
      sourceUrl,
    });
  }
  return entries;
}

function chooseDirectoryEntry(
  proposed: Record<string, unknown>,
  entries: DirectoryEntry[],
) {
  const name = normalizedOrganizationName(proposed.name);
  const city = proposed.city;
  if (!name) return null;

  const exact = entries.filter((entry) =>
    normalizedOrganizationName(entry.name) === name && sameCity(city, entry.city),
  );
  if (exact.length === 1) return exact[0];

  const sameName = entries.filter((entry) => normalizedOrganizationName(entry.name) === name);
  return sameName.length === 1 ? sameName[0] : null;
}

async function boundedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("organization_enrichment_response_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("organization_enrichment_response_too_large");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

async function safeFetchHtml(
  url: string,
  fetchImpl: AutomationFetch,
  maxBytes: number,
) {
  if (!isSafeAutomationSourceUrl(url)) throw new Error("organization_enrichment_unsafe_url");
  let current = url;
  const seen = new Set<string>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const key = canonicalizeSourceUrl(current) ?? current;
    if (seen.has(key)) throw new Error("organization_enrichment_redirect_loop");
    seen.add(key);

    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PsipediaOrganizationEnrichment/1.0 (+https://psipedia.sk)",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new Error("organization_enrichment_redirect_invalid");
      const target = absoluteUrl(location, current);
      if (!target || !isSafeAutomationSourceUrl(target)) throw new Error("organization_enrichment_redirect_blocked");
      await response.body?.cancel().catch(() => undefined);
      current = target;
      continue;
    }

    if (!response.ok) throw new Error("organization_enrichment_http_" + response.status);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("organization_enrichment_invalid_content_type");
    }
    return { html: await boundedText(response, maxBytes), finalUrl: current };
  }
  throw new Error("organization_enrichment_redirect_too_many");
}

function metaContent(html: string, names: string[]) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const raw = tag[0];
    const key = (attribute(raw, "property") ?? attribute(raw, "name") ?? "").toLowerCase();
    if (!names.includes(key)) continue;
    const value = attribute(raw, "content");
    if (value) return textFromHtml(value);
  }
  return null;
}

function firstEmail(html: string) {
  const mailto = html.match(/href\s*=\s*["']mailto:([^"'?#]+)[^"']*["']/i)?.[1];
  const decoded = decodeURIComponent(decodeHtml(mailto ?? "")).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)) return decoded.toLowerCase();

  const text = textFromHtml(html);
  const plain = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? "";
  return plain ? plain.toLowerCase() : null;
}

function firstPhone(html: string) {
  const tel = html.match(/href\s*=\s*["']tel:([^"']+)["']/i)?.[1];
  const value = decodeURIComponent(decodeHtml(tel ?? "")).replace(/\s+/g, " ").trim();
  if (value && /\d{6,}/.test(value.replace(/\D/g, ""))) return value.slice(0, 100);
  return null;
}

function registrationNumber(html: string) {
  const text = textFromHtml(html);
  return text.match(/\bIČO\s*[:#-]?\s*(\d{8})\b/i)?.[1] ?? null;
}

function links(html: string, baseUrl: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((match) => absoluteUrl(decodeHtml(match[1]).trim(), baseUrl))
    .filter((value): value is string => Boolean(value));
}

function contactPages(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const candidates: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = normalizeAutomationIdentity(textFromHtml(match[2]));
    const href = absoluteUrl(decodeHtml(match[1]).trim(), baseUrl);
    if (!href || !isSafeAutomationSourceUrl(href)) continue;
    const parsed = new URL(href);
    if (parsed.hostname !== base.hostname) continue;
    if (!/(kontakt|contact|o nas|o-nas|about)/.test(label + " " + normalizeAutomationIdentity(parsed.pathname))) continue;
    if (!candidates.includes(href)) candidates.push(href);
    if (candidates.length >= MAX_CONTACT_PAGES) break;
  }
  return candidates;
}

function officialSiteFields(htmlParts: string[], finalUrl: string) {
  const html = htmlParts.join("\n");
  const allLinks = links(html, finalUrl);
  const facebookUrl = allLinks.map((url) => socialUrl(url, "facebook")).find(Boolean) ?? null;
  const instagramUrl = allLinks.map((url) => socialUrl(url, "instagram")).find(Boolean) ?? null;
  const description = metaContent(htmlParts[0] ?? "", ["description", "og:description"]);
  const imageRaw = metaContent(htmlParts[0] ?? "", ["og:image", "twitter:image"]);
  const imageUrl = imageRaw ? absoluteUrl(imageRaw, finalUrl) : null;

  return {
    publicEmail: firstEmail(html),
    publicPhone: firstPhone(html),
    facebookUrl,
    instagramUrl,
    registrationNumber: registrationNumber(html),
    shortDescription: description && description.length <= 700 ? description : description?.slice(0, 700) ?? null,
    imageUrl: imageUrl && isSafeAutomationSourceUrl(imageUrl) ? imageUrl : null,
  };
}

function inferredType(proposed: Record<string, unknown>, entry: DirectoryEntry | null) {
  const activity = normalizeAutomationIdentity(proposed.sourceActivity);
  const haystack = normalizeAutomationIdentity([
    proposed.name,
    proposed.operatorName,
    entry?.form,
  ].filter(Boolean).join(" "));
  if (activity.includes("shelp") || haystack.includes("utulok")) return "SHELTER";
  if (haystack.includes("obcianske zdruzenie") || /(^| )oz( |$)/.test(haystack)) return "CIVIC_ASSOCIATION";
  if (haystack.includes("neziskova") || haystack.includes(" n o ")) return "NONPROFIT";
  if (haystack.includes("mesto") || haystack.includes("obec") || haystack.includes("mestska")) return "MUNICIPAL_ORGANIZATION";
  return null;
}

function inferredLegalName(proposed: Record<string, unknown>) {
  const operator = String(proposed.operatorName ?? "").replace(/\s+/g, " ").trim();
  if (!operator) return null;
  const first = operator.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  const normalized = normalizeAutomationIdentity(first);
  if (
    normalized.startsWith("obcianske zdruzenie ")
    || normalized.startsWith("oz ")
    || normalized.startsWith("mesto ")
    || normalized.startsWith("obec ")
    || normalized.includes(" neziskova organizacia")
    || /\bn\.?\s*o\.?$/i.test(first)
  ) return first.slice(0, 240);
  return null;
}

function generatedDescription(proposed: Record<string, unknown>) {
  const name = String(proposed.name ?? "").trim();
  const city = String(proposed.city ?? "").trim();
  const district = String(proposed.district ?? "").trim();
  const region = String(proposed.region ?? "").trim();
  const approval = String(proposed.sourceApprovalNumber ?? "").trim();
  const activity = String(proposed.sourceActivity ?? "").trim();

  if (!name) return null;
  const location = [city, district && district !== city ? "okres " + district : "", region]
    .filter(Boolean)
    .join(", ");
  const parts = [
    location ? name + " pôsobí v lokalite " + location + "." : null,
    approval ? "V registri ŠVPS je vedená pod schvaľovacím číslom " + approval + "." : null,
    activity ? "Evidovaná činnosť: " + activity + "." : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function createProductionOrganizationEnricher(
  options: CreateOrganizationEnricherOptions = {},
): OrganizationRecordEnricher {
  const fetchImpl = options.fetchImpl ?? fetch;
  const directoryUrl = options.directoryUrl ?? DEFAULT_DIRECTORY_URL;
  let directoryPromise: Promise<DirectoryEntry[]> | null = null;
  const siteCache = new Map<string, Promise<Record<string, string | null>>>();

  async function directoryEntries() {
    if (!directoryPromise) {
      directoryPromise = (async () => {
        const safe = websiteFetchUrl(directoryUrl);
        if (!safe) return [];
        try {
          const fetched = await safeFetchHtml(safe, fetchImpl, MAX_DIRECTORY_BYTES);
          return parseOrganizationDirectory(fetched.html, directoryUrl);
        } catch {
          return [];
        }
      })();
    }
    return directoryPromise;
  }

  async function enrichFromOfficialSite(websiteUrl: string) {
    const safe = websiteFetchUrl(websiteUrl);
    if (!safe) return {};
    if (!siteCache.has(safe)) {
      siteCache.set(safe, (async () => {
        try {
          const home = await safeFetchHtml(safe, fetchImpl, MAX_SITE_BYTES);
          const parts = [home.html];
          for (const pageUrl of contactPages(home.html, home.finalUrl)) {
            try {
              const page = await safeFetchHtml(pageUrl, fetchImpl, MAX_SITE_BYTES);
              parts.push(page.html);
            } catch {}
          }
          const fields = officialSiteFields(parts, home.finalUrl);
          return { ...fields, websiteUrl: canonicalizeSourceUrl(home.finalUrl) };
        } catch {
          return { websiteUrl: canonicalizeSourceUrl(websiteUrl) };
        }
      })());
    }
    return siteCache.get(safe) ?? Promise.resolve({});
  }

  return async (record, context) => {
    const proposed = { ...record.proposed };
    const entries = await directoryEntries();
    const entry = chooseDirectoryEntry(proposed, entries);

    if (!proposed.websiteUrl && entry?.websiteUrl) proposed.websiteUrl = entry.websiteUrl;
    if (!proposed.facebookUrl && entry?.facebookUrl) proposed.facebookUrl = entry.facebookUrl;
    if (!proposed.type) proposed.type = inferredType(proposed, entry) ?? undefined;
    if (!proposed.legalName) proposed.legalName = inferredLegalName(proposed) ?? undefined;
    if (!proposed.countryCode) proposed.countryCode = "SK";
    if (!proposed.description) proposed.description = generatedDescription(proposed) ?? undefined;
    if (!proposed.shortDescription) {
      const fallback = generatedDescription(proposed);
      if (fallback) proposed.shortDescription = fallback.slice(0, 700);
    }

    const website = String(proposed.websiteUrl ?? "").trim();
    if (website) {
      const official = await enrichFromOfficialSite(website);
      const finalWebsite = String(official.websiteUrl ?? website).trim();
      if (finalWebsite) {
        proposed.websiteUrl = finalWebsite;
      }
      for (const key of ["publicEmail","publicPhone","facebookUrl","instagramUrl","registrationNumber","shortDescription","imageUrl"] as const) {
        if (!proposed[key] && official[key]) proposed[key] = official[key];
      }
    }

    if (!proposed.sourceUrl && record.sourceUrl) proposed.sourceUrl = record.sourceUrl;
    proposed.lastVerifiedAt = context.detectedAt;
    return { ...record, proposed };
  };
}
