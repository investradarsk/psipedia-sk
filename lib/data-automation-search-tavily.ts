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
  images?: unknown;
};

function countryName(country: string | undefined) {
  if (!country) return undefined;
  const mapping: Record<string, string> = {
    SK: "Slovakia",
  };
  return mapping[country.trim().toUpperCase()];
}

function tavilyLanguage(locale: string | undefined) {
  if (!locale) return undefined;
  const normalized = locale.trim().toLowerCase().replace(/_/g, "-");
  const match = /^([a-z]{2})(?:-[a-z0-9]{2,8})*$/.exec(normalized);
  if (!match) throw new AutomationSearchProviderError("CONFIG_MISSING");
  return match[1];
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
    return (await this.searchWithImages(request, false)).results;
  }

  // Reuses the standard search transport. Image links are returned only when
  // explicitly requested by the missing-data workflow for manual review.
  async searchWithImages(request: AutomationSearchRequest, includeImages = true): Promise<{
    results: AutomationSearchResult[];
    images: string[];
  }> {
    if (!this.credentialConfigured) throw new AutomationSearchProviderError("CONFIG_MISSING");

    const country = countryName(request.country);
    const language = tavilyLanguage(request.locale);
    const timeRange = tavilyFreshness(request.freshness);
    const body = {
      query: request.query,
      max_results: safeMaxResults(request.maxResults),
      search_depth: "basic",
      ...(includeImages ? { include_images: true, include_image_descriptions: false } : {}),
      ...(country ? { country } : {}),
      ...(language ? { language } : {}),
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
      throw new AutomationSearchProviderError("PROVIDER_ERROR", { transportFailure: true });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AutomationSearchProviderError("AUTH_FAILED");
    }
    if (response.status === 429) {
      throw new AutomationSearchProviderError("RATE_LIMITED");
    }
    if (response.status === 432 || response.status === 433) {
      throw new AutomationSearchProviderError("CREDITS_EXHAUSTED");
    }
    if (response.status === 400) {
      throw new AutomationSearchProviderError("INVALID_REQUEST");
    }
    if (response.status >= 500) {
      throw new AutomationSearchProviderError("PROVIDER_ERROR", { httpStatus: response.status });
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

    const results = payload.results
      .map((row, index) => mappedResult(row, index))
      .filter((row): row is AutomationSearchResult => Boolean(row))
      .slice(0, safeMaxResults(request.maxResults));
    const images = includeImages && Array.isArray(payload.images)
      ? payload.images.map((row) => {
          const source = typeof row === "string" ? row
            : row && typeof row === "object" && !Array.isArray(row)
              ? (row as { url?: unknown }).url : null;
          return validAbsoluteUrl(source);
        }).filter((url): url is string => Boolean(url)).slice(0, 8)
      : [];
    return { results, images };
  }
}

export const tavilySearchProviderContract = Object.freeze({
  endpoint: TAVILY_SEARCH_ENDPOINT,
  timeoutMs: TAVILY_TIMEOUT_MS,
  secretEnvName: "TAVILY_API_KEY",
});
