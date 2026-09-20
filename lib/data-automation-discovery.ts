import { canonicalizeSourceUrl, isSafeAutomationSourceUrl, type AutomationConnectorType, type AutomationEntityType } from "./data-automation.ts";

export const automationDiscoveryTypes = ["SITEMAP", "RSS", "STRUCTURED_DIRECTORY", "SEARCH_PROVIDER"] as const;
export type AutomationDiscoveryType = (typeof automationDiscoveryTypes)[number];

export type AutomationSourceCandidateInput = {
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
    const sourceUrl = safeCandidate(match[1].replace(/<[^>]+>/g, "").trim(), baseUrl);
    if (!sourceUrl) continue;
    items.push({
      discoveryType: "SITEMAP",
      sourceUrl,
      label: new URL(sourceUrl).hostname,
      entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol explicitne uvedený v sitemape kontrolovaného verejného zdroja.",
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
      discoveryType: "RSS",
      sourceUrl,
      label: new URL(sourceUrl).hostname,
      entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol uvedený v RSS/Atom feede kontrolovaného verejného zdroja.",
    });
  }
  return uniqueCandidates(items);
};

export function structuredDirectoryDiscovery(input: {
  payload: unknown;
  baseUrl: string;
  entityType: AutomationEntityType;
  recordsPath?: string;
  urlField?: string;
  labelField?: string;
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
      discoveryType: "STRUCTURED_DIRECTORY",
      sourceUrl,
      label: String(rawLabel ?? new URL(sourceUrl).hostname).trim().slice(0, 160),
      entityType: input.entityType,
      suggestedConnectorType: "CONTROLLED_HTML",
      reason: "URL bol uvedený v explicitnom structured directory/API zdroji.",
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
