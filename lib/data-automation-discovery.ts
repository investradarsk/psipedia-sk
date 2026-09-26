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


export const STRUCTURED_DIRECTORY_DEFAULT_MAX_ROWS = 100;
export const STRUCTURED_DIRECTORY_HARD_MAX_ROWS = 500;
export const STRUCTURED_DIRECTORY_DEFAULT_MAX_PAGES = 1;
export const STRUCTURED_DIRECTORY_HARD_MAX_PAGES = 10;
export const STRUCTURED_DIRECTORY_HARD_MAX_DETAIL_FETCHES = 50;

export type StructuredDirectoryFormat = "HTML" | "JSON";
type StructuredDirectoryFieldSpec =
  | string
  | { path?: string; selector?: string; attribute?: string };

export type StructuredDirectoryConfig = {
  format: StructuredDirectoryFormat;
  collectionPath?: string;
  rowSelector?: string;
  fields: Record<string, StructuredDirectoryFieldSpec>;
  detailLinkField?: string;
  externalIdField?: string;
  compositeKeyFields?: string[];
  allowedHosts?: string[];
  pathIncludes?: string[];
  pathExcludes?: string[];
  maxRows: number;
  detailFetch: boolean;
  maxDetailFetches: number;
  pagination?: {
    nextLinkSelector?: string;
    pageParamTemplate?: string;
    maxPages: number;
  };
};

export type StructuredDirectoryParseResult = {
  candidates: AutomationSourceCandidateInput[];
  warnings: string[];
  stats: {
    parserFormat: StructuredDirectoryFormat;
    rowsParsed: number;
    rowsSkipped: number;
    rowsTruncated: number;
  };
};

const DIRECTORY_FIELD_LIMITS: Record<string, number> = {
  name: 160,
  title: 160,
  description: 1000,
  address: 500,
  city: 160,
  phone: 120,
  email: 254,
  website: 2000,
  category: 240,
  service: 240,
  externalId: 300,
  detailUrl: 2000,
  url: 2000,
};

function directoryBoundedText(value: unknown, key: string) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = decodeText(String(value)).normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, DIRECTORY_FIELD_LIMITS[key] ?? 500);
}

function validDotPath(value: unknown) {
  return typeof value === "string"
    && value.length <= 240
    && /^(?:[A-Za-z0-9_-]+)(?:\.[A-Za-z0-9_-]+)*$/.test(value);
}

function directoryPathValue(value: unknown, path: string | undefined) {
  if (!path) return value;
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function validSimpleSelector(value: unknown) {
  return typeof value === "string"
    && value.length <= 160
    && /^(?:[A-Za-z][A-Za-z0-9-]*)?(?:[.#][A-Za-z_][A-Za-z0-9_-]*)?$/.test(value)
    && /[A-Za-z.#]/.test(value);
}

function parseHtmlAttributes(value: string) {
  const attributes: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeText(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

type DirectoryHtmlNode = {
  tag: string;
  attrs: Record<string, string>;
  inner: string;
  outer: string;
};

function selectorParts(selector: string) {
  const match = selector.match(/^([A-Za-z][A-Za-z0-9-]*)?([.#])?([A-Za-z_][A-Za-z0-9_-]*)?$/);
  if (!match) return null;
  return { tag: match[1]?.toLowerCase() ?? null, kind: match[2] ?? null, value: match[3] ?? null };
}

function nodeMatchesSelector(node: DirectoryHtmlNode, selector: string) {
  const parsed = selectorParts(selector);
  if (!parsed) return false;
  if (parsed.tag && node.tag !== parsed.tag) return false;
  if (parsed.kind === "#") return node.attrs.id === parsed.value;
  if (parsed.kind === ".") {
    return String(node.attrs.class ?? "").split(/\s+/).filter(Boolean).includes(parsed.value ?? "");
  }
  return true;
}

function htmlNodes(payload: string, selector: string) {
  const parsed = selectorParts(selector);
  if (!parsed) return [] as DirectoryHtmlNode[];
  const tagPattern = parsed.tag ? parsed.tag.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&") : "[A-Za-z][A-Za-z0-9-]*";
  const pattern = new RegExp(
    "<(" + tagPattern + ")\\b([^>]*)>([\\s\\S]*?)<\\/\\1\\s*>",
    "gi",
  );
  const nodes: DirectoryHtmlNode[] = [];
  for (const match of payload.matchAll(pattern)) {
    const node = {
      tag: match[1].toLowerCase(),
      attrs: parseHtmlAttributes(match[2] ?? ""),
      inner: match[3] ?? "",
      outer: match[0],
    };
    if (nodeMatchesSelector(node, selector)) nodes.push(node);
  }
  return nodes;
}

function htmlFieldValue(row: DirectoryHtmlNode, spec: StructuredDirectoryFieldSpec) {
  if (typeof spec === "string") {
    const nodes = htmlNodes(row.inner, spec);
    return nodes.length ? decodeText(nodes[0].inner) : undefined;
  }
  const target = spec.selector ? htmlNodes(row.inner, spec.selector)[0] : row;
  if (!target) return undefined;
  if (spec.attribute) return target.attrs[spec.attribute.toLowerCase()];
  return decodeText(target.inner);
}

function validatedDirectoryFields(value: unknown, format: StructuredDirectoryFormat) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_directory_config");
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > 24) throw new Error("invalid_directory_config");
  const fields: Record<string, StructuredDirectoryFieldSpec> = {};
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key)) throw new Error("invalid_directory_config");
    if (typeof raw === "string") {
      if (format === "JSON" ? !validDotPath(raw) : !validSimpleSelector(raw)) throw new Error("invalid_directory_config");
      fields[key] = raw;
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_directory_config");
    const spec = raw as Record<string, unknown>;
    const path = typeof spec.path === "string" ? spec.path : undefined;
    const selector = typeof spec.selector === "string" ? spec.selector : undefined;
    const attribute = typeof spec.attribute === "string" ? spec.attribute.trim().toLowerCase() : undefined;
    if (format === "JSON") {
      if (!path || !validDotPath(path) || selector || attribute) throw new Error("invalid_directory_config");
      fields[key] = { path };
    } else {
      if (path || (selector && !validSimpleSelector(selector)) || (attribute && !/^[a-z_:][a-z0-9_:.-]{0,79}$/i.test(attribute))) {
        throw new Error("invalid_directory_config");
      }
      fields[key] = { ...(selector ? { selector } : {}), ...(attribute ? { attribute } : {}) };
    }
  }
  return fields;
}

function boundedHostList(value: unknown) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.length > 20) throw new Error("invalid_directory_config");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("invalid_directory_config");
    const host = item.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host) || host.includes("..")) throw new Error("invalid_directory_config");
    return host;
  });
}

function boundedPathFilters(value: unknown) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.length > 50) throw new Error("invalid_directory_config");
  return value.map((item) => {
    if (typeof item !== "string" || !item.startsWith("/") || item.length > 500) throw new Error("invalid_directory_config");
    return item;
  });
}

export function parseStructuredDirectoryConfig(raw: Record<string, unknown>): StructuredDirectoryConfig {
  const format = raw.format;
  if (format !== "HTML" && format !== "JSON") throw new Error("invalid_directory_config");
  const fields = validatedDirectoryFields(raw.fields, format);
  const collectionPath = raw.collectionPath === undefined ? undefined : String(raw.collectionPath);
  const rowSelector = raw.rowSelector === undefined ? undefined : String(raw.rowSelector);
  if (format === "JSON" && collectionPath !== undefined && collectionPath !== "" && !validDotPath(collectionPath)) {
    throw new Error("invalid_directory_config");
  }
  if (format === "HTML" && (!rowSelector || !validSimpleSelector(rowSelector))) throw new Error("invalid_directory_config");
  if (format === "JSON" && rowSelector !== undefined) throw new Error("invalid_directory_config");
  const detailLinkField = typeof raw.detailLinkField === "string" ? raw.detailLinkField : "detailUrl";
  const externalIdField = typeof raw.externalIdField === "string" ? raw.externalIdField : "externalId";
  if (!(detailLinkField in fields) && !("url" in fields)) throw new Error("invalid_directory_config");
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(detailLinkField)) throw new Error("invalid_directory_config");
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(externalIdField)) throw new Error("invalid_directory_config");

  const maxRowsRaw = Number(raw.maxRows ?? STRUCTURED_DIRECTORY_DEFAULT_MAX_ROWS);
  if (!Number.isInteger(maxRowsRaw) || maxRowsRaw < 1) throw new Error("invalid_directory_config");
  const maxRows = Math.min(STRUCTURED_DIRECTORY_HARD_MAX_ROWS, maxRowsRaw);

  const detailFetch = raw.detailFetch === true;
  const maxDetailFetchesRaw = Number(raw.maxDetailFetches ?? STRUCTURED_DIRECTORY_HARD_MAX_DETAIL_FETCHES);
  if (!Number.isInteger(maxDetailFetchesRaw) || maxDetailFetchesRaw < 0) throw new Error("invalid_directory_config");
  const maxDetailFetches = Math.min(STRUCTURED_DIRECTORY_HARD_MAX_DETAIL_FETCHES, maxDetailFetchesRaw);

  let compositeKeyFields: string[] | undefined;
  if (raw.compositeKeyFields !== undefined) {
    if (!Array.isArray(raw.compositeKeyFields) || raw.compositeKeyFields.length < 1 || raw.compositeKeyFields.length > 6) {
      throw new Error("invalid_directory_config");
    }
    compositeKeyFields = raw.compositeKeyFields.map((item) => {
      if (typeof item !== "string" || !(item in fields)) throw new Error("invalid_directory_config");
      return item;
    });
  }

  let pagination: StructuredDirectoryConfig["pagination"];
  if (raw.pagination !== undefined) {
    if (!raw.pagination || typeof raw.pagination !== "object" || Array.isArray(raw.pagination)) throw new Error("invalid_directory_config");
    const source = raw.pagination as Record<string, unknown>;
    const nextLinkSelector = source.nextLinkSelector === undefined ? undefined : String(source.nextLinkSelector);
    const pageParamTemplate = source.pageParamTemplate === undefined ? undefined : String(source.pageParamTemplate);
    if (nextLinkSelector && (format !== "HTML" || !validSimpleSelector(nextLinkSelector))) throw new Error("invalid_directory_config");
    if (pageParamTemplate && (!pageParamTemplate.includes("{page}") || pageParamTemplate.length > 1000)) throw new Error("invalid_directory_config");
    if (nextLinkSelector && pageParamTemplate) throw new Error("invalid_directory_config");
    const maxPagesRaw = Number(source.maxPages ?? STRUCTURED_DIRECTORY_DEFAULT_MAX_PAGES);
    if (!Number.isInteger(maxPagesRaw) || maxPagesRaw < 1) throw new Error("invalid_directory_config");
    pagination = {
      ...(nextLinkSelector ? { nextLinkSelector } : {}),
      ...(pageParamTemplate ? { pageParamTemplate } : {}),
      maxPages: Math.min(STRUCTURED_DIRECTORY_HARD_MAX_PAGES, maxPagesRaw),
    };
  }

  return {
    format,
    ...(collectionPath ? { collectionPath } : {}),
    ...(rowSelector ? { rowSelector } : {}),
    fields,
    detailLinkField,
    externalIdField,
    ...(compositeKeyFields ? { compositeKeyFields } : {}),
    allowedHosts: boundedHostList(raw.allowedHosts),
    pathIncludes: boundedPathFilters(raw.pathIncludes),
    pathExcludes: boundedPathFilters(raw.pathExcludes),
    maxRows,
    detailFetch,
    maxDetailFetches,
    ...(pagination ? { pagination } : {}),
  };
}

function normalizedRowIdentityPart(value: unknown) {
  return String(value ?? "").normalize("NFC").toLocaleLowerCase("sk-SK").replace(/\s+/g, " ").trim().slice(0, 300);
}

function directoryRowIdentity(
  fields: Record<string, string>,
  config: StructuredDirectoryConfig,
  candidateUrl: string,
) {
  const externalId = fields[config.externalIdField ?? "externalId"];
  if (externalId) return { kind: "EXTERNAL_ID", value: externalId };
  if (candidateUrl) return { kind: "DETAIL_URL", value: candidateUrl };
  if (config.compositeKeyFields?.length) {
    const parts = config.compositeKeyFields.map((key) => normalizedRowIdentityPart(fields[key]));
    if (parts.every(Boolean)) return { kind: "COMPOSITE", value: parts.join("|").slice(0, 1000) };
  }
  return { kind: "WEAK", value: "" };
}

function structuredDirectoryMetadata(
  fields: Record<string, string>,
  input: {
    baseUrl: string;
    pageIndex: number;
    rowIndex: number;
    parserFormat: StructuredDirectoryFormat;
    rowIdentity: { kind: string; value: string };
    config: StructuredDirectoryConfig;
  },
) {
  const metadata: Record<string, unknown> = {
    discoveredFrom: input.baseUrl,
    directoryUrl: input.baseUrl,
    directoryPageUrl: input.baseUrl,
    pageIndex: input.pageIndex,
    rowIndex: input.rowIndex,
    parserFormat: input.parserFormat,
    schemaVersion: 2,
    rowIdentityKind: input.rowIdentity.kind,
    ...(input.rowIdentity.value ? { rowIdentity: input.rowIdentity.value } : {}),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (!value) continue;
    metadata[key] = value;
  }
  const externalId = fields[input.config.externalIdField ?? "externalId"];
  if (externalId) metadata.externalId = externalId;
  const detailUrl = fields[input.config.detailLinkField ?? "detailUrl"];
  if (detailUrl) metadata.detailUrl = detailUrl;
  return metadata;
}

function candidatePathAllowed(url: string, config: StructuredDirectoryConfig) {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  if (config.pathIncludes?.length && !config.pathIncludes.some((prefix) => pathname.startsWith(prefix))) return false;
  if (config.pathExcludes?.some((prefix) => pathname.startsWith(prefix))) return false;
  return true;
}

function mappedJsonFields(row: unknown, config: StructuredDirectoryConfig) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const output: Record<string, string> = {};
  for (const [key, spec] of Object.entries(config.fields)) {
    const path = typeof spec === "string" ? spec : spec.path;
    const bounded = directoryBoundedText(directoryPathValue(row, path), key);
    if (bounded) output[key] = bounded;
  }
  return output;
}

function mappedHtmlFields(row: DirectoryHtmlNode, config: StructuredDirectoryConfig) {
  const output: Record<string, string> = {};
  for (const [key, spec] of Object.entries(config.fields)) {
    const bounded = directoryBoundedText(htmlFieldValue(row, spec), key);
    if (bounded) output[key] = bounded;
  }
  return output;
}

export function structuredDirectoryDiscovery(input: {
  payload: unknown;
  baseUrl: string;
  entityType: AutomationEntityType;
  config: StructuredDirectoryConfig;
  pageIndex?: number;
  maxCandidates?: number;
  urlAllowed?: (url: string) => boolean;
  suggestedConnectorType?: AutomationConnectorType;
}): StructuredDirectoryParseResult {
  const pageIndex = Math.max(0, Math.floor(input.pageIndex ?? 0));
  const genericMax = Math.max(1, Math.min(500, Math.floor(input.maxCandidates ?? 150)));
  const rowLimit = Math.min(input.config.maxRows, genericMax, STRUCTURED_DIRECTORY_HARD_MAX_ROWS);
  let rawRows: unknown[] | DirectoryHtmlNode[];
  if (input.config.format === "JSON") {
    const collection = directoryPathValue(input.payload, input.config.collectionPath);
    if (!Array.isArray(collection)) throw new Error("invalid_directory_response");
    rawRows = collection;
  } else {
    if (typeof input.payload !== "string") throw new Error("invalid_directory_response");
    rawRows = htmlNodes(input.payload, input.config.rowSelector!);
  }

  const candidates: AutomationSourceCandidateInput[] = [];
  const warnings: string[] = [];
  let rowsSkipped = 0;
  const seen = new Set<string>();
  const considered = rawRows.slice(0, rowLimit);
  if (rawRows.length > rowLimit) warnings.push("directory_row_limit");

  considered.forEach((rawRow, rowIndex) => {
    const fields = input.config.format === "JSON"
      ? mappedJsonFields(rawRow, input.config)
      : mappedHtmlFields(rawRow as DirectoryHtmlNode, input.config);
    if (!fields) {
      rowsSkipped += 1;
      return;
    }
    if (fields.website) {
      const website = canonicalizeSourceUrl(fields.website);
      if (website && isSafeAutomationSourceUrl(website)) fields.website = website;
      else delete fields.website;
    }
    const rawCandidateUrl = fields[input.config.detailLinkField ?? "detailUrl"] ?? fields.url;
    if (!rawCandidateUrl) {
      rowsSkipped += 1;
      return;
    }
    const sourceUrl = safeCandidate(rawCandidateUrl, input.baseUrl);
    if (!sourceUrl || !candidatePathAllowed(sourceUrl, input.config) || (input.urlAllowed && !input.urlAllowed(sourceUrl))) {
      rowsSkipped += 1;
      warnings.push("directory_host_blocked");
      return;
    }
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    const rowIdentity = directoryRowIdentity(fields, input.config, sourceUrl);
    const label = fields.name ?? fields.title ?? new URL(sourceUrl).hostname;
    const detailUrl = fields[input.config.detailLinkField ?? "detailUrl"];
    candidates.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "STRUCTURED_DIRECTORY",
      sourceUrl,
      label: directoryBoundedText(label, "name") ?? new URL(sourceUrl).hostname,
      entityType: input.entityType,
      suggestedConnectorType: input.suggestedConnectorType ?? "CONTROLLED_HTML",
      reason: "URL bol deterministicky extrahovaný z explicitne nakonfigurovaného structured directory rootu.",
      metadata: {
        ...structuredDirectoryMetadata(fields, {
          baseUrl: input.baseUrl,
          pageIndex,
          rowIndex,
          parserFormat: input.config.format,
          rowIdentity,
          config: input.config,
        }),
        ...(detailUrl ? { detailUrl: sourceUrl } : {}),
      },
    });
  });

  if (rowsSkipped > 0) warnings.push("directory_rows_skipped");
  if (rawRows.length > 0 && candidates.length === 0) warnings.push("directory_no_usable_rows");
  return {
    candidates,
    warnings: [...new Set(warnings)],
    stats: {
      parserFormat: input.config.format,
      rowsParsed: considered.length,
      rowsSkipped,
      rowsTruncated: Math.max(0, rawRows.length - considered.length),
    },
  };
}

export function structuredDirectoryNextPageUrl(input: {
  payload: string;
  currentUrl: string;
  config: StructuredDirectoryConfig;
  nextPageNumber: number;
}) {
  const pagination = input.config.pagination;
  if (!pagination || input.nextPageNumber >= pagination.maxPages) return null;
  if (pagination.pageParamTemplate) {
    try {
      return safeCandidate(pagination.pageParamTemplate.replaceAll("{page}", String(input.nextPageNumber + 1)), input.currentUrl);
    } catch {
      return null;
    }
  }
  if (pagination.nextLinkSelector && input.config.format === "HTML") {
    const node = htmlNodes(input.payload, pagination.nextLinkSelector)[0];
    const href = node?.attrs.href;
    return href ? safeCandidate(href, input.currentUrl) : null;
  }
  return null;
}

export function htmlLinkDirectoryDiscovery(input: {
  payload: string;
  baseUrl: string;
  entityType: AutomationEntityType;
  suggestedConnectorType?: AutomationConnectorType;
  externalOnly?: boolean;
  excludeHosts?: string[];
  maxCandidates?: number;
}) {
  // Legacy helper remains export-compatible for callers/tests, but DISCOVERY-4A
  // runner no longer uses generic anchor scraping. New roots must provide the
  // explicit Structured Directory v2 extraction contract.
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
      reason: "Legacy explicit link-directory helper.",
      metadata: { discoveredFrom: input.baseUrl, directoryHost: baseHost },
    });
    if (items.length >= limit) break;
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
