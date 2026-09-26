import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
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

export const sitemapDiscoveryAdapter: AutomationDiscoveryAdapter = ({ payload, baseUrl, entityType }) => {
  const items: AutomationSourceCandidateInput[] = [];
  for (const match of payload.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const sourceUrl = safeCandidate(decodeText(match[1]), baseUrl);
    if (!sourceUrl) continue;
    items.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "SITEMAP",
      sourceUrl,
      label: new URL(sourceUrl).hostname,
      entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol explicitne uvedený v sitemape kontrolovaného verejného zdroja.",
      metadata: { discoveredFrom: baseUrl },
    });
  }
  return uniqueCandidates(items);
};

export const rssDiscoveryAdapter: AutomationDiscoveryAdapter = ({ payload, baseUrl, entityType }) => {
  const items: AutomationSourceCandidateInput[] = [];
  const hrefs = [
    ...[...payload.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]),
    ...[...payload.matchAll(/<link\b[^>]*>([^<]+)<\/link>/gi)].map((match) => match[1]),
  ];
  for (const href of hrefs) {
    const sourceUrl = safeCandidate(href.trim(), baseUrl);
    if (!sourceUrl) continue;
    items.push({
      candidateType: "SOURCE_CANDIDATE",
      discoveryType: "RSS",
      sourceUrl,
      label: new URL(sourceUrl).hostname,
      entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol uvedený v RSS/Atom feede kontrolovaného verejného zdroja.",
      metadata: { discoveredFrom: baseUrl },
    });
  }
  return uniqueCandidates(items);
};

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
  constructor(public readonly code: AutomationSearchProviderErrorCode) {
    super(`automation_search_provider_${code.toLowerCase()}`);
    this.name = "AutomationSearchProviderError";
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

function fingerprintHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function automationSearchQueryFingerprint(providerKey: string, request: AutomationSearchRequest) {
  const normalizedProvider = providerKey.trim().toLowerCase();
  if (!normalizedProvider) throw new AutomationSearchProviderError("CONFIG_MISSING");
  const stable = JSON.stringify({
    provider: normalizedProvider,
    query: request.query,
    locale: request.locale ?? null,
    country: request.country ?? null,
    freshness: request.freshness ?? null,
    allowDomains: [...(request.allowDomains ?? [])].sort(),
    blockDomains: [...(request.blockDomains ?? [])].sort(),
  });
  return `sp1-${fingerprintHash(stable)}`;
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
