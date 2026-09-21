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

export type AutomationSearchProvider = {
  key: string;
  discover(input: { query: string; entityType: AutomationEntityType; limit: number }): Promise<AutomationSourceCandidateInput[]>;
};

export function requireConfiguredSearchProvider(provider?: AutomationSearchProvider): AutomationSearchProvider {
  if (!provider) throw new Error("automation_search_provider_not_configured");
  return provider;
}
