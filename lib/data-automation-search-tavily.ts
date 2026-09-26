import {
  AUTOMATION_SEARCH_MAX_RESULTS,
  AutomationSearchProviderError,
  type AutomationSearchProvider,
  type AutomationSearchRequest,
  type AutomationSearchResult,
} from "./data-automation-discovery.ts";

const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 8000;
const TAVILY_SNIPPET_MAX_LENGTH = 1000;

type TavilyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type TavilySearchResponse = {
  results?: unknown;
};

function countryName(country: string | undefined) {
  if (!country) return undefined;
  const mapping: Record<string, string> = {
    SK: "Slovakia",
  };
  return mapping[country.trim().toUpperCase()];
}

function tavilyFreshness(freshness: string | undefined) {
  if (!freshness) return undefined;
  const normalized = freshness.trim().toLowerCase();
  return ["day", "week", "month", "year"].includes(normalized) ? normalized : undefined;
}

function validAbsoluteUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function boundedSnippet(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, TAVILY_SNIPPET_MAX_LENGTH) : null;
}

function mappedResult(row: unknown, index: number): AutomationSearchResult | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const item = row as Record<string, unknown>;
  const url = validAbsoluteUrl(item.url);
  const title = typeof item.title === "string" ? item.title.trim().replace(/\s+/g, " ") : "";
  if (!url || !title) return null;
  const score = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : undefined;
  return {
    url,
    title: title.slice(0, 500),
    snippet: boundedSnippet(item.content),
    rank: index + 1,
    externalId: null,
    metadata: score === undefined ? {} : { score },
  };
}

function safeMaxResults(value: number) {
  if (!Number.isFinite(value) || value < 1) throw new AutomationSearchProviderError("CONFIG_MISSING");
  return Math.min(AUTOMATION_SEARCH_MAX_RESULTS, Math.floor(value));
}

export class TavilyAutomationSearchProvider implements AutomationSearchProvider {
  readonly key = "tavily";
  readonly credentialConfigured: boolean;
  private readonly apiKey: string;
  private readonly fetchImpl: TavilyFetch;

  constructor(options: { apiKey?: string; fetchImpl?: TavilyFetch }) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.credentialConfigured = Boolean(this.apiKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(request: AutomationSearchRequest): Promise<AutomationSearchResult[]> {
    if (!this.credentialConfigured) throw new AutomationSearchProviderError("CONFIG_MISSING");

    const country = countryName(request.country);
    const timeRange = tavilyFreshness(request.freshness);
    const body = {
      query: request.query,
      max_results: safeMaxResults(request.maxResults),
      search_depth: "basic",
      ...(country ? { country } : {}),
      ...(timeRange ? { time_range: timeRange } : {}),
      ...(request.allowDomains?.length ? { include_domains: request.allowDomains } : {}),
      ...(request.blockDomains?.length ? { exclude_domains: request.blockDomains } : {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(TAVILY_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new AutomationSearchProviderError("TIMEOUT");
      }
      throw new AutomationSearchProviderError("PROVIDER_ERROR");
    }

    if (response.status === 401 || response.status === 403) {
      throw new AutomationSearchProviderError("AUTH_FAILED");
    }
    if (response.status === 429) {
      throw new AutomationSearchProviderError("RATE_LIMITED");
    }
    if (response.status >= 500) {
      throw new AutomationSearchProviderError("PROVIDER_ERROR");
    }
    if (!response.ok) {
      throw new AutomationSearchProviderError("PROVIDER_ERROR");
    }

    let payload: TavilySearchResponse;
    try {
      payload = await response.json() as TavilySearchResponse;
    } catch {
      throw new AutomationSearchProviderError("INVALID_RESPONSE");
    }
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) {
      throw new AutomationSearchProviderError("INVALID_RESPONSE");
    }

    return payload.results
      .map((row, index) => mappedResult(row, index))
      .filter((row): row is AutomationSearchResult => Boolean(row))
      .slice(0, safeMaxResults(request.maxResults));
  }
}

export const tavilySearchProviderContract = Object.freeze({
  endpoint: TAVILY_SEARCH_ENDPOINT,
  timeoutMs: TAVILY_TIMEOUT_MS,
  secretEnvName: "TAVILY_API_KEY",
});
