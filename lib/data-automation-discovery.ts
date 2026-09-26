import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  sha256Hex,
  type AutomationConnectorType,
  type AutomationEntityType,
} from "./data-automation.ts";

export const automationDiscoveryTypes = ["SITEMAP", "RSS", "STRUCTURED_DIRECTORY", "SEARCH_PROVIDER"] as const;
export type AutomationDiscoveryType = (typeof automationDiscoveryTypes)[number];

export type AutomationSourceCandidateInput = {
  candidateType: "SOURCE_CANDIDATE";
  discoveryType: AutomationDiscoveryType;
  sourceUrl: string;
  label: string;
  entityType: AutomationEntityType;
  suggestedConnectorType: AutomationConnectorType;
  reason: string;
  metadata?: Record<string, unknown>;
};

export type AutomationDiscoveryAdapter = (input: {
  payload: string;
  baseUrl: string;
  entityType: AutomationEntityType;
}) => AutomationSourceCandidateInput[];

function safeCandidate(url: string, baseUrl: string) {
  try {
    const absolute = canonicalizeSourceUrl(new URL(url, baseUrl).toString());
    return absolute && isSafeAutomationSourceUrl(absolute) ? absolute : null;
  } catch {
    return null;
  }
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function decodeText(value: string) {
  return value
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueCandidates(items: AutomationSourceCandidateInput[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = canonicalizeSourceUrl(item.sourceUrl);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export type ParsedSitemapEntry = {
  loc: string;
  lastmod?: string;
};

export type ParsedSitemapDocument =
  | { type: "urlset"; entries: ParsedSitemapEntry[] }
  | { type: "sitemapindex"; entries: ParsedSitemapEntry[] };

function sitemapRootType(payload: string): ParsedSitemapDocument["type"] | null {
  const normalized = payload.replace(/^\uFEFF/, "").trim();
  if (!normalized.startsWith("<")) return null;
  if (/<(?:[A-Za-z_][\w.-]*:)?urlset\b/i.test(normalized)) return "urlset";
  if (/<(?:[A-Za-z_][\w.-]*:)?sitemapindex\b/i.test(normalized)) return "sitemapindex";
  return null;
}

function sitemapBlocks(payload: string, tag: "url" | "sitemap") {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`,
    "gi",
  );
  return [...payload.matchAll(pattern)].map((match) => match[1]);
}

function sitemapElementText(block: string, tag: "loc" | "lastmod") {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`,
    "i",
  );
  const match = block.match(pattern);
  return match ? decodeText(match[1]) : "";
}

function validSitemapLastmod(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(?:[Tt][^\s]+)?$/.test(normalized)) return undefined;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? normalized : undefined;
}

export function parseSitemapDocument(payload: string, baseUrl: string): ParsedSitemapDocument {
  const type = sitemapRootType(payload);
  if (!type) throw new Error("automation_discovery_invalid_sitemap_xml");
  const tag = type === "urlset" ? "url" : "sitemap";
  const entries: ParsedSitemapEntry[] = [];
  const seen = new Set<string>();
  for (const block of sitemapBlocks(payload, tag)) {
    const loc = safeCandidate(sitemapElementText(block, "loc"), baseUrl);
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);
    const lastmod = validSitemapLastmod(sitemapElementText(block, "lastmod"));
    entries.push({ loc, ...(lastmod ? { lastmod } : {}) });
  }
  return { type, entries };
}

export const sitemapDiscoveryAdapter: AutomationDiscoveryAdapter = ({ payload, baseUrl, entityType }) => {
  const parsed = parseSitemapDocument(payload, baseUrl);
  if (parsed.type !== "urlset") return [];
  return parsed.entries.map((entry) => ({
    candidateType: "SOURCE_CANDIDATE",
    discoveryType: "SITEMAP",
    sourceUrl: entry.loc,
    label: new URL(entry.loc).hostname,
    entityType,
    suggestedConnectorType: "CONTROLLED_HTML",
    reason: "URL bol explicitne uvedený v sitemape kontrolovaného verejného zdroja.",
    metadata: {
      discoveredFrom: baseUrl,
      sitemapUrl: baseUrl,
      ...(entry.lastmod ? { lastmod: entry.lastmod } : {}),
    },
  }));
};

export type ParsedFeedEntry = {
  sourceUrl: string;
  externalId?: string;
  title?: string;
  description?: string;
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  categories: string[];
  index: number;
  suspiciousFutureTimestamp?: boolean;
};

export type ParsedFeedDocument = {
  feedType: "RSS" | "ATOM";
  entries: ParsedFeedEntry[];
  totalEntries: number;
  invalidEntries: number;
};

function feedRootType(payload: string): ParsedFeedDocument["feedType"] | null {
  const normalized = payload.replace(/^\uFEFF/, "").trim();
  if (!normalized.startsWith("<")) return null;
  if (/<(?:[A-Za-z_][\w.-]*:)?rss\b/i.test(normalized)) return "RSS";
  if (/<(?:[A-Za-z_][\w.-]*:)?feed\b/i.test(normalized)) return "ATOM";
  return null;
}

function feedBlocks(payload: string, tag: "item" | "entry") {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`,
    "gi",
  );
  return [...payload.matchAll(pattern)].map((match) => match[1]);
}

function feedElement(block: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${\}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${escaped}\\s*>`,
    "i",
  );
  return block.match(pattern)?.[1] ?? "";
}

function feedElements(block: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${\}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${escaped}\\s*>`,
    "gi",
  );
  return [...block.matchAll(pattern)].map((match) => decodeText(match[1]));
}

function normalizedFeedTimestamp(value: string) {
  const normalized = decodeText(value).trim();
  if (!normalized || normalized.length > 128) return undefined;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function absoluteHttpIdentifier(value: string) {
  const normalized = decodeText(value).trim();
  if (!/^https?:\/\//i.test(normalized)) return null;
  return safeCandidate(normalized, normalized);
}

function boundedFeedText(value: string, maxLength: number) {
  const normalized = decodeText(value);
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function rssGuid(block: string) {
  const match = block.match(/<(?:[A-Za-z_][\w.-]*:)?guid\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?guid\s*>/i);
  if (!match) return { value: undefined, permalink: false };
  const value = boundedFeedText(match[2], 300);
  const explicitFalse = /\bisPermaLink\s*=\s*["']false["']/i.test(match[1]);
  return { value, permalink: !explicitFalse && Boolean(value && absoluteHttpIdentifier(value)) };
}

function atomLinks(block: string) {
  return [...block.matchAll(/<(?:[A-Za-z_][\w.-]*:)?link\b([^>]*)\/?\s*>/gi)].map((match) => {
    const attrs = match[1];
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase() ?? "";
    return { href, rel };
  });
}

export function parseFeedDocument(payload: string, baseUrl: string): ParsedFeedDocument {
  const feedType = feedRootType(payload);
  if (!feedType) throw new Error("invalid_feed_xml");
  const blocks = feedBlocks(payload, feedType === "RSS" ? "item" : "entry");
  const entries: ParsedFeedEntry[] = [];
  let invalidEntries = 0;

  blocks.forEach((block, index) => {
    let sourceUrl: string | null = null;
    let externalId: string | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let publishedAt: string | undefined;
    let updatedAt: string | undefined;
    let author: string | undefined;
    let categories: string[] = [];

    if (feedType === "RSS") {
      const link = boundedFeedText(feedElement(block, "link"), 2000);
      sourceUrl = link ? safeCandidate(link, baseUrl) : null;
      const guid = rssGuid(block);
      externalId = guid.value;
      if (!sourceUrl && guid.permalink && guid.value) sourceUrl = absoluteHttpIdentifier(guid.value);
      title = boundedFeedText(feedElement(block, "title"), 160);
      description = boundedFeedText(feedElement(block, "description"), 1000);
      publishedAt = normalizedFeedTimestamp(feedElement(block, "pubDate"));
      author = boundedFeedText(feedElement(block, "author") || feedElement(block, "creator"), 160);
      categories = feedElements(block, "category").filter(Boolean).slice(0, 10).map((value) => value.slice(0, 80));
    } else {
      const links = atomLinks(block);
      const alternate = links.find((link) => link.rel === "alternate" && safeCandidate(link.href, baseUrl));
      const usable = alternate ?? links.find((link) => safeCandidate(link.href, baseUrl));
      sourceUrl = usable ? safeCandidate(usable.href, baseUrl) : null;
      const id = boundedFeedText(feedElement(block, "id"), 300);
      externalId = id;
      if (!sourceUrl && id) sourceUrl = absoluteHttpIdentifier(id);
      title = boundedFeedText(feedElement(block, "title"), 160);
      const summary = feedElement(block, "summary");
      const content = feedElement(block, "content");
      description = boundedFeedText(summary || content, 1000);
      publishedAt = normalizedFeedTimestamp(feedElement(block, "published"));
      updatedAt = normalizedFeedTimestamp(feedElement(block, "updated"));
      author = boundedFeedText(feedElement(feedElement(block, "author"), "name") || feedElement(block, "author"), 160);
      categories = [...block.matchAll(/<(?:[A-Za-z_][\w.-]*:)?category\b([^>]*)\/?\s*>/gi)]
        .map((match) => match[1].match(/\bterm\s*=\s*["']([^"']+)["']/i)?.[1] ?? "")
        .map((value) => boundedFeedText(value, 80))
        .filter((value): value is string => Boolean(value))
        .slice(0, 10);
    }

    if (!sourceUrl) {
      invalidEntries += 1;
      return;
    }
    entries.push({
      sourceUrl,
      ...(externalId ? { externalId } : {}),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(author ? { author } : {}),
      categories,
      index,
    });
  });

  return { feedType, entries, totalEntries: blocks.length, invalidEntries };
}

function pathAllowed(url: string, includes: string[], excludes: string[]) {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const validIncludes = includes.filter((value) => value.startsWith("/"));
  const validExcludes = excludes.filter((value) => value.startsWith("/"));
  if (validIncludes.length && !validIncludes.some((prefix) => path.startsWith(prefix))) return false;
  if (validExcludes.some((prefix) => path.startsWith(prefix))) return false;
  return true;
}

export function rssDiscoveryCandidates(input: {
  payload: string;
  baseUrl: string;
  entityType: AutomationEntityType;
  maxEntries?: number;
  maxCandidates?: number;
  maxEntryAgeDays?: number;
  now?: Date;
  urlAllowed?: (url: string) => boolean;
  pathIncludes?: string[];
  pathExcludes?: string[];
}) {
  const parsed = parseFeedDocument(input.payload, input.baseUrl);
  const maxEntries = Math.max(1, Math.min(200, Math.floor(input.maxEntries ?? 100)));
  const maxCandidates = Math.max(1, Math.min(500, Math.floor(input.maxCandidates ?? 150)));
  const now = input.now ?? new Date();
  const maxAgeMs = Number.isFinite(input.maxEntryAgeDays)
    ? Math.max(1, Math.floor(input.maxEntryAgeDays!)) * 86_400_000
    : null;
  const futureToleranceMs = 48 * 60 * 60 * 1000;
  const warnings: string[] = [];
  if (parsed.totalEntries > maxEntries) warnings.push("feed_entry_limit");
  const candidates: AutomationSourceCandidateInput[] = [];
  const seen = new Set<string>();

  for (const entry of parsed.entries.filter((entry) => entry.index < maxEntries)) {
    if (candidates.length >= maxCandidates) break;
    const canonical = canonicalizeSourceUrl(entry.sourceUrl);
    if (!canonical || seen.has(canonical)) continue;
    if (!isSafeAutomationSourceUrl(canonical) || (input.urlAllowed && !input.urlAllowed(canonical))) {
      warnings.push("feed_url_blocked");
      continue;
    }
    if (!pathAllowed(canonical, input.pathIncludes ?? [], input.pathExcludes ?? [])) continue;

    const freshnessTimestamp = entry.updatedAt ?? entry.publishedAt;
    let suspiciousFutureTimestamp = false;
    if (freshnessTimestamp) {
      const timestamp = Date.parse(freshnessTimestamp);
      suspiciousFutureTimestamp = timestamp > now.getTime() + futureToleranceMs;
      if (maxAgeMs !== null && !suspiciousFutureTimestamp && now.getTime() - timestamp > maxAgeMs) continue;
    }

    seen.add(canonical);
    const host = new URL(canonical).hostname;
    candidates.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "RSS",
      sourceUrl: canonical,
      label: entry.title ?? host,
      entityType: input.entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol explicitne uvedený v bounded RSS/Atom feede schváleného discovery rootu.",
      metadata: {
        discoveredFrom: input.baseUrl,
        feedUrl: input.baseUrl,
        entryUrl: canonical,
        feedType: parsed.feedType,
        entryIndex: entry.index,
        resultRank: entry.index,
        ...(entry.externalId ? { externalId: entry.externalId } : {}),
        ...(entry.title ? { title: entry.title } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
        ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
        ...(entry.author ? { author: entry.author } : {}),
        ...(entry.categories.length ? { categories: entry.categories } : {}),
        ...(suspiciousFutureTimestamp ? { suspiciousFutureTimestamp: true } : {}),
      },
    });
  }

  if (parsed.invalidEntries > 0) warnings.push("feed_invalid_entries");
  if (parsed.totalEntries > 0 && candidates.length === 0 && parsed.invalidEntries === parsed.totalEntries) {
    warnings.push("feed_no_usable_links");
  }
  return {
    candidates,
    warnings: [...new Set(warnings)],
    stats: {
      feedType: parsed.feedType,
      entriesParsed: Math.min(parsed.totalEntries, maxEntries),
      usableUrls: candidates.length,
      invalidEntries: parsed.invalidEntries,
    },
  };
}

export const rssDiscoveryAdapter: AutomationDiscoveryAdapter = ({ payload, baseUrl, entityType }) =>
  rssDiscoveryCandidates({ payload, baseUrl, entityType, maxEntries: 100, maxCandidates: 100 }).candidates;

export function htmlLinkDirectoryDiscovery(input: {
  payload: string;
  baseUrl: string;
  entityType: AutomationEntityType;
  suggestedConnectorType?: AutomationConnectorType;
  externalOnly?: boolean;
  excludeHosts?: string[];
  maxCandidates?: number;
}) {
  const baseHost = hostname(input.baseUrl);
  const excluded = new Set((input.excludeHosts ?? []).map((value) => value.toLowerCase().replace(/^www\./, "")));
  const limit = Math.max(1, Math.min(500, Math.floor(input.maxCandidates ?? 150)));
  const items: AutomationSourceCandidateInput[] = [];

  for (const match of input.payload.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const sourceUrl = safeCandidate(match[1].trim(), input.baseUrl);
    if (!sourceUrl) continue;
    const candidateHost = hostname(sourceUrl);
    if (!candidateHost || excluded.has(candidateHost)) continue;
    if (input.externalOnly && candidateHost === baseHost) continue;

    const label = decodeText(match[2]) || candidateHost;
    if (!label || label.length < 2) continue;
    items.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "STRUCTURED_DIRECTORY",
      sourceUrl,
      label: label.slice(0, 160),
      entityType: input.entityType,
      suggestedConnectorType: input.suggestedConnectorType ?? "CONTROLLED_HTML",
      reason: "URL bol uvedený v explicitnom verejnom adresári kontrolovaného dôveryhodného zdroja.",
      metadata: {
        discoveredFrom: input.baseUrl,
        directoryHost: baseHost,
      },
    });
    if (items.length >= limit) break;
  }
  return uniqueCandidates(items);
}

export function structuredDirectoryDiscovery(input: {
  payload: unknown;
  baseUrl: string;
  entityType: AutomationEntityType;
  recordsPath?: string;
  urlField?: string;
  labelField?: string;
  suggestedConnectorType?: AutomationConnectorType;
}) {
  const pathValue = (value: unknown, path: string | undefined) =>
    (path ?? "").split(".").filter(Boolean).reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
  const rows = pathValue(input.payload, input.recordsPath) ?? input.payload;
  if (!Array.isArray(rows)) return [];

  const items: AutomationSourceCandidateInput[] = [];
  for (const row of rows) {
    const rawUrl = pathValue(row, input.urlField ?? "url");
    if (typeof rawUrl !== "string") continue;
    const sourceUrl = safeCandidate(rawUrl, input.baseUrl);
    if (!sourceUrl) continue;
    const rawLabel = pathValue(row, input.labelField ?? "name");
    items.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "STRUCTURED_DIRECTORY",
      sourceUrl,
      label: String(rawLabel ?? new URL(sourceUrl).hostname).trim().slice(0, 160),
      entityType: input.entityType,
      suggestedConnectorType: input.suggestedConnectorType ?? "CONTROLLED_HTML",
      reason: "URL bol uvedený v explicitnom structured directory/API zdroji.",
      metadata: { discoveredFrom: input.baseUrl },
    });
  }
  return uniqueCandidates(items);
}

export const AUTOMATION_SEARCH_DEFAULT_MAX_RESULTS = 10;
export const AUTOMATION_SEARCH_MAX_RESULTS = 20;

export type AutomationSearchRequest = {
  query: string;
  maxResults: number;
  locale?: string;
  country?: string;
  freshness?: string;
  allowDomains?: string[];
  blockDomains?: string[];
};

export type AutomationSearchResult = {
  url: string;
  title: string;
  snippet?: string | null;
  rank: number;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
};

export const automationSearchProviderErrorCodes = [
  "CONFIG_MISSING",
  "AUTH_FAILED",
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_ERROR",
  "INVALID_RESPONSE",
] as const;
export type AutomationSearchProviderErrorCode = (typeof automationSearchProviderErrorCodes)[number];

export class AutomationSearchProviderError extends Error {
  readonly code: AutomationSearchProviderErrorCode;

  constructor(code: AutomationSearchProviderErrorCode) {
    super(`automation_search_provider_${code.toLowerCase()}`);
    this.name = "AutomationSearchProviderError";
    this.code = code;
  }
}

export type AutomationSearchProvider = {
  key: string;
  credentialConfigured: boolean;
  search(request: AutomationSearchRequest): Promise<AutomationSearchResult[]>;
};

function normalizedOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizedDomainList(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new AutomationSearchProviderError("CONFIG_MISSING");
  const domains = value.map((item) => {
    if (typeof item !== "string") throw new AutomationSearchProviderError("CONFIG_MISSING");
    const domain = item.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) {
      throw new AutomationSearchProviderError("CONFIG_MISSING");
    }
    return domain;
  });
  return [...new Set(domains)].sort();
}

export function normalizeAutomationSearchRequest(input: {
  query: unknown;
  maxResults?: unknown;
  locale?: unknown;
  country?: unknown;
  freshness?: unknown;
  allowDomains?: unknown;
  blockDomains?: unknown;
}): AutomationSearchRequest {
  const query = normalizedOptionalString(input.query, 500)?.toLowerCase();
  if (!query) throw new AutomationSearchProviderError("CONFIG_MISSING");

  let maxResults = AUTOMATION_SEARCH_DEFAULT_MAX_RESULTS;
  if (input.maxResults !== undefined && input.maxResults !== null && input.maxResults !== "") {
    const value = Number(input.maxResults);
    if (!Number.isInteger(value) || value < 1 || value > AUTOMATION_SEARCH_MAX_RESULTS) {
      throw new AutomationSearchProviderError("CONFIG_MISSING");
    }
    maxResults = value;
  }

  const locale = normalizedOptionalString(input.locale, 32)?.toLowerCase();
  const country = normalizedOptionalString(input.country, 8)?.toUpperCase();
  const freshness = normalizedOptionalString(input.freshness, 32)?.toLowerCase();
  const allowDomains = normalizedDomainList(input.allowDomains);
  const blockDomains = normalizedDomainList(input.blockDomains);

  return {
    query,
    maxResults,
    ...(locale ? { locale } : {}),
    ...(country ? { country } : {}),
    ...(freshness ? { freshness } : {}),
    ...(allowDomains?.length ? { allowDomains } : {}),
    ...(blockDomains?.length ? { blockDomains } : {}),
  };
}

export async function automationSearchQueryFingerprint(providerKey: string, request: AutomationSearchRequest) {
  const normalizedProvider = providerKey.trim().toLowerCase();
  if (!normalizedProvider) throw new AutomationSearchProviderError("CONFIG_MISSING");
  const stable = {
    provider: normalizedProvider,
    query: request.query,
    locale: request.locale ?? null,
    country: request.country ?? null,
    freshness: request.freshness ?? null,
    allowDomains: [...(request.allowDomains ?? [])].sort(),
    blockDomains: [...(request.blockDomains ?? [])].sort(),
  };
  return `sp1-${(await sha256Hex(stable)).slice(0, 24)}`;
}

export function requireConfiguredSearchProvider(
  provider: AutomationSearchProvider | undefined,
  expectedKey?: string,
): AutomationSearchProvider {
  if (!provider || !provider.credentialConfigured) throw new AutomationSearchProviderError("CONFIG_MISSING");
  if (expectedKey && provider.key.trim().toLowerCase() !== expectedKey.trim().toLowerCase()) {
    throw new AutomationSearchProviderError("CONFIG_MISSING");
  }
  return provider;
}

function domainMatches(hostnameValue: string, configuredDomain: string) {
  return hostnameValue === configuredDomain || hostnameValue.endsWith(`.${configuredDomain}`);
}

function boundedProviderMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const safeKey = key.slice(0, 80);
    if (typeof item === "string") output[safeKey] = item.slice(0, 500);
    else if (typeof item === "number" && Number.isFinite(item)) output[safeKey] = item;
    else if (typeof item === "boolean" || item === null) output[safeKey] = item;
  }
  return output;
}

export function automationSearchResultsToCandidates(input: {
  providerKey: string;
  request: AutomationSearchRequest;
  fingerprint: string;
  results: AutomationSearchResult[];
  entityType: AutomationEntityType;
  suggestedConnectorType?: AutomationConnectorType;
}) {
  if (!Array.isArray(input.results)) throw new AutomationSearchProviderError("INVALID_RESPONSE");
  const candidates: AutomationSourceCandidateInput[] = [];
  const seen = new Set<string>();

  for (const result of input.results.slice(0, input.request.maxResults)) {
    if (!result || typeof result !== "object"
      || typeof result.url !== "string"
      || typeof result.title !== "string"
      || !Number.isInteger(result.rank)
      || result.rank < 0) {
      throw new AutomationSearchProviderError("INVALID_RESPONSE");
    }

    const sourceUrl = canonicalizeSourceUrl(result.url);
    if (!sourceUrl || !isSafeAutomationSourceUrl(sourceUrl) || seen.has(sourceUrl)) continue;
    const host = hostname(sourceUrl);
    if (!host) continue;
    if (input.request.allowDomains?.length
      && !input.request.allowDomains.some((domain) => domainMatches(host, domain))) continue;
    if (input.request.blockDomains?.some((domain) => domainMatches(host, domain))) continue;

    seen.add(sourceUrl);
    const title = result.title.trim().replace(/\s+/g, " ").slice(0, 160) || host;
    const snippet = typeof result.snippet === "string"
      ? result.snippet.trim().replace(/\s+/g, " ").slice(0, 1000)
      : null;
    const externalId = typeof result.externalId === "string" && result.externalId.trim()
      ? result.externalId.trim().slice(0, 300)
      : null;
    candidates.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "SEARCH_PROVIDER",
      sourceUrl,
      label: title,
      entityType: input.entityType,
      suggestedConnectorType: input.suggestedConnectorType ?? "CONTROLLED_HTML",
      reason: "URL bol nájdený cez nakonfigurovaný search-provider discovery root a čaká na manuálne posúdenie.",
      metadata: {
        searchProvider: input.providerKey,
        normalizedQuery: input.request.query,
        queryFingerprint: input.fingerprint,
        resultRank: result.rank,
        title,
        ...(snippet ? { snippet } : {}),
        ...(externalId ? { externalId } : {}),
        providerMetadata: boundedProviderMetadata(result.metadata),
      },
    });
  }

  return candidates;
}
