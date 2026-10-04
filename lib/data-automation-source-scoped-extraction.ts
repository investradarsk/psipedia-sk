import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  stableJson,
  type AutomationEntityType,
  type AutomationExtractionCoverage,
  type AutomationExtractionStrategy,
  type AutomationSource,
} from "./data-automation.ts";
import {
  AUTOMATION_SOURCE_MAX_BYTES,
  AUTOMATION_SOURCE_MAX_REDIRECT_HOPS,
  automationSourceRequestTimeoutMs,
} from "./data-automation-http-policy.ts";
import type { AutomationGovernanceState } from "./data-automation-governance.ts";

export const automationSourceScopedStrategyOrder: readonly AutomationExtractionStrategy[] = Object.freeze([
  "STRUCTURED_FEED",
  "DEDICATED_ADAPTER",
  "GENERIC_FIRST_PARTY",
  "TAVILY_CRAWL",
  "TAVILY_EXTRACT",
]);

export type AutomationSourcePathScope = {
  includes: string[];
  excludes: string[];
  sameOrigin: true;
  redirectPolicy: "SAME_ORIGIN_SCOPED";
  derivedFrom: "GOVERNANCE" | "SOURCE_ROOT";
};

export type AutomationSourceScopedIdentity = {
  entityType: AutomationEntityType;
  canonicalSourceRootUrl: string;
  approvedPathScope: AutomationSourcePathScope;
  identityKey: string;
};

export type AutomationSourceScopedLimits = {
  maxPages: number;
  maxItems: number;
  maxBytes: number;
  maxRedirects: number;
  timeoutMs: number;
  throttleMs: number;
  maxProviderRequests: number;
  maxDepth: number;
  maxBreadth: number;
};

export type SourceScopedExtractionContract = {
  sourceId: number;
  identity: AutomationSourceScopedIdentity;
  limits: AutomationSourceScopedLimits;
};

export type AutomationSourceScopedContractResult =
  | { ready: true; contract: SourceScopedExtractionContract; reason: "READY" }
  | { ready: false; contract: null; reason: "UNSAFE_SOURCE_ROOT" | "INVALID_PATH_SCOPE" };

function normalizePath(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const withSlash = raw.startsWith("/") ? raw : "/" + raw;
  const normalized = withSlash.replace(/\/+/g, "/").replace(/\/\.\//g, "/");
  if (normalized.includes("..")) return null;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.replace(/\/+$/, "") : normalized;
}

function normalizeScopePattern(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const wildcard = trimmed.endsWith("/**") ? "/**" : trimmed.endsWith("/*") ? "/*" : "";
  const base = normalizePath(wildcard ? trimmed.slice(0, -wildcard.length) : trimmed);
  if (!base) return null;
  return base === "/" && wildcard ? "/**" : base + wildcard;
}

function sourceRootDefaultScope(sourceRootUrl: string) {
  const url = new URL(sourceRootUrl);
  const path = normalizePath(url.pathname) ?? "/";
  if (path === "/") return ["/**"];
  return [path + "/**"];
}

function parseGovernancePathScope(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const includes: string[] = [];
  const excludes: string[] = [];
  const tokens = value.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const excluded = token.startsWith("!") || lower.startsWith("exclude:");
    const included = lower.startsWith("include:");
    const raw = token.startsWith("!")
      ? token.slice(1)
      : excluded
        ? token.slice(token.indexOf(":") + 1)
        : included
          ? token.slice(token.indexOf(":") + 1)
          : token;
    const pattern = normalizeScopePattern(raw);
    if (!pattern) return { valid: false as const, includes: [], excludes: [] };
    (excluded ? excludes : includes).push(pattern);
  }
  if (!includes.length) return { valid: false as const, includes: [], excludes: [] };
  return {
    valid: true as const,
    includes: [...new Set(includes)],
    excludes: [...new Set(excludes)],
  };
}

export function automationApprovedPathScope(
  sourceRootUrl: string,
  governancePathScope?: string | null,
): AutomationSourcePathScope | null {
  const parsed = parseGovernancePathScope(governancePathScope);
  if (parsed && !parsed.valid) return null;
  return {
    includes: parsed?.includes ?? sourceRootDefaultScope(sourceRootUrl),
    excludes: parsed?.excludes ?? [],
    sameOrigin: true,
    redirectPolicy: "SAME_ORIGIN_SCOPED",
    derivedFrom: parsed ? "GOVERNANCE" : "SOURCE_ROOT",
  };
}

function pathMatchesPattern(pathname: string, pattern: string) {
  if (pattern === "/**") return true;
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3) || "/";
    return pathname === base || pathname.startsWith(base.endsWith("/") ? base : base + "/");
  }
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2) || "/";
    if (!(pathname === base || pathname.startsWith(base.endsWith("/") ? base : base + "/"))) return false;
    const remainder = pathname.slice(base.length).replace(/^\//, "");
    return Boolean(remainder) && !remainder.includes("/");
  }
  return pathname === pattern;
}

export function automationUrlWithinApprovedSourceScope(
  identity: Pick<AutomationSourceScopedIdentity, "canonicalSourceRootUrl" | "approvedPathScope">,
  value: string,
) {
  const candidate = canonicalizeSourceUrl(value);
  if (!candidate || !isSafeAutomationSourceUrl(candidate)) return false;
  const root = new URL(identity.canonicalSourceRootUrl);
  const url = new URL(candidate);
  if (identity.approvedPathScope.sameOrigin && url.origin !== root.origin) return false;
  const pathname = normalizePath(url.pathname) ?? "/";
  if (!identity.approvedPathScope.includes.some((pattern) => pathMatchesPattern(pathname, pattern))) return false;
  if (identity.approvedPathScope.excludes.some((pattern) => pathMatchesPattern(pathname, pattern))) return false;
  return true;
}

export function assertAutomationUrlWithinApprovedSourceScope(
  identity: Pick<AutomationSourceScopedIdentity, "canonicalSourceRootUrl" | "approvedPathScope">,
  value: string,
) {
  if (!automationUrlWithinApprovedSourceScope(identity, value)) {
    throw new Error("automation_source_scope_violation");
  }
}

export function buildSourceScopedExtractionContract(
  source: Pick<
    AutomationSource,
    "id" | "entityType" | "sourceUrl" | "maxRecordsPerRun" | "timeoutMs" | "throttleMs"
  >,
  governance?: Pick<AutomationGovernanceState, "pathScope" | "maxRequestsPerDay"> | null,
): AutomationSourceScopedContractResult {
  const sourceRootUrl = canonicalizeSourceUrl(source.sourceUrl);
  if (!sourceRootUrl || !isSafeAutomationSourceUrl(sourceRootUrl)) {
    return { ready: false, contract: null, reason: "UNSAFE_SOURCE_ROOT" };
  }
  const approvedPathScope = automationApprovedPathScope(sourceRootUrl, governance?.pathScope);
  if (!approvedPathScope) return { ready: false, contract: null, reason: "INVALID_PATH_SCOPE" };

  const identity: AutomationSourceScopedIdentity = {
    entityType: source.entityType,
    canonicalSourceRootUrl: sourceRootUrl,
    approvedPathScope,
    identityKey: stableJson({
      entityType: source.entityType,
      canonicalSourceRootUrl: sourceRootUrl,
      includes: approvedPathScope.includes,
      excludes: approvedPathScope.excludes,
    }),
  };
  const providerBudget = governance?.maxRequestsPerDay;
  const maxProviderRequests = Number.isSafeInteger(providerBudget) && Number(providerBudget) > 0
    ? Math.min(50, Number(providerBudget))
    : 10;
  return {
    ready: true,
    reason: "READY",
    contract: {
      sourceId: source.id,
      identity,
      limits: {
        maxPages: 10,
        maxItems: Math.max(1, Math.min(500, Math.floor(source.maxRecordsPerRun || 1))),
        maxBytes: AUTOMATION_SOURCE_MAX_BYTES,
        maxRedirects: AUTOMATION_SOURCE_MAX_REDIRECT_HOPS,
        timeoutMs: automationSourceRequestTimeoutMs(source.timeoutMs),
        throttleMs: Math.max(0, Math.min(30_000, Math.floor(source.throttleMs || 0))),
        maxProviderRequests,
        maxDepth: 3,
        maxBreadth: 20,
      },
    },
  };
}

export function automationCoverageCanInferAbsence(
  coverage: Pick<AutomationExtractionCoverage, "classification"> | null | undefined,
) {
  return coverage?.classification === "COMPLETE_ENUMERATION";
}
