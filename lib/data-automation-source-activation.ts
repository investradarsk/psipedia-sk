import {
  canonicalizeSourceUrl,
  isSafeAutomationSourceUrl,
  type AutomationSource,
} from "./data-automation.ts";
import {
  AUTOMATION_SOURCE_HTTP_USER_AGENT,
  AUTOMATION_SOURCE_MAX_REDIRECT_HOPS,
  automationSourceRequestTimeoutMs,
} from "./data-automation-http-policy.ts";
import { automationSourceReadiness } from "./data-automation-capability-registry.ts";
import {
  evaluateGovernanceForActivation,
  getGovernanceState,
  upsertGovernanceReview,
  type AutomationGovernanceDatabase,
  type AutomationGovernanceRead,
} from "./data-automation-governance.ts";

export type AutomationSourceActivationReason =
  | "READY"
  | "REVIEW_REQUIRED"
  | "TECHNICAL_NOT_READY"
  | "UNSAFE_SOURCE_URL"
  | "GOVERNANCE_BLOCKED"
  | "CADENCE_INVALID";

export type AutomationSourceActivationReadiness = {
  ready: boolean;
  reason: AutomationSourceActivationReason;
  governance: AutomationGovernanceRead;
  governanceBlockingReasons: string[];
  technicalReason: string | null;
};

type ActivationSource = Pick<
  AutomationSource,
  "id" | "entityType" | "connectorType" | "sourceUrl" | "config" | "cadenceMinutes" | "reviewStatus"
>;

function validCadence(value: number) {
  return Number.isSafeInteger(value) && value >= 60 && value <= 43_200;
}

export async function automationSourceActivationReadiness(
  source: ActivationSource,
  database: AutomationGovernanceDatabase,
  options: { cadenceMinutes?: number; now?: Date } = {},
): Promise<AutomationSourceActivationReadiness> {
  const emptyGovernance: AutomationGovernanceRead = { schemaAvailable: true, state: null };
  if (source.reviewStatus !== "APPROVED") {
    return { ready: false, reason: "REVIEW_REQUIRED", governance: emptyGovernance, governanceBlockingReasons: [], technicalReason: null };
  }

  const cadenceMinutes = options.cadenceMinutes ?? source.cadenceMinutes;
  if (!validCadence(cadenceMinutes)) {
    return { ready: false, reason: "CADENCE_INVALID", governance: emptyGovernance, governanceBlockingReasons: [], technicalReason: null };
  }

  const technical = automationSourceReadiness(source);
  if (technical.applicable && !technical.ready) {
    return {
      ready: false,
      reason: "TECHNICAL_NOT_READY",
      governance: emptyGovernance,
      governanceBlockingReasons: [],
      technicalReason: technical.reason,
    };
  }

  if (source.connectorType !== "MANUAL_IMPORT" && (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl))) {
    return { ready: false, reason: "UNSAFE_SOURCE_URL", governance: emptyGovernance, governanceBlockingReasons: [], technicalReason: null };
  }

  const governance = await getGovernanceState({ type: "AUTOMATION_SOURCE", id: source.id }, database);
  const decision = evaluateGovernanceForActivation(governance, {
    recurring: true,
    cadenceMinutes,
    storageFields: ["url", "metadata"],
  }, options.now);

  if (!decision.allowed) {
    return {
      ready: false,
      reason: "GOVERNANCE_BLOCKED",
      governance,
      governanceBlockingReasons: decision.blockingReasons,
      technicalReason: null,
    };
  }

  return { ready: true, reason: "READY", governance, governanceBlockingReasons: [], technicalReason: null };
}

const RECHECKABLE_TECHNICAL_GOVERNANCE_BLOCKERS = new Set([
  "ACCESS_NOT_ALLOWED",
  "ROBOTS_NOT_ALLOWED",
]);

export function automationSourceTechnicalGovernanceRefreshNeeded(
  readiness: AutomationSourceActivationReadiness,
) {
  return readiness.reason === "GOVERNANCE_BLOCKED"
    && Boolean(readiness.governance.state)
    && readiness.governanceBlockingReasons.some((reason) => RECHECKABLE_TECHNICAL_GOVERNANCE_BLOCKERS.has(reason));
}

export function automationSourceTechnicalGovernanceRetryable(
  readiness: AutomationSourceActivationReadiness,
) {
  return automationSourceTechnicalGovernanceRefreshNeeded(readiness)
    && readiness.governanceBlockingReasons.every((reason) => RECHECKABLE_TECHNICAL_GOVERNANCE_BLOCKERS.has(reason));
}

type GovernanceFetch = typeof fetch;

type ProbeResult<T extends string> = {
  status: T;
  evidenceUrl: string | null;
  detail: string;
};

const ROBOTS_AGENT = "psipediadataresearch";

async function fetchProbe(
  url: string,
  fetchImpl: GovernanceFetch,
  timeoutMs: number,
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = url;
  const seen = new Set<string>();

  for (let redirects = 0; redirects <= AUTOMATION_SOURCE_MAX_REDIRECT_HOPS; redirects += 1) {
    const canonical = canonicalizeSourceUrl(currentUrl);
    if (!canonical || !isSafeAutomationSourceUrl(canonical) || seen.has(canonical)) {
      throw new Error("source_governance_probe_url_not_safe");
    }
    seen.add(canonical);

    const response = await fetchImpl(canonical, {
      method: "GET",
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": AUTOMATION_SOURCE_HTTP_USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(automationSourceRequestTimeoutMs(timeoutMs)),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirects >= AUTOMATION_SOURCE_MAX_REDIRECT_HOPS) throw new Error("source_governance_probe_redirect_blocked");
      currentUrl = new URL(location, canonical).toString();
      continue;
    }

    return { response, finalUrl: canonical };
  }

  throw new Error("source_governance_probe_redirect_blocked");
}

async function probeAccess(
  source: ActivationSource & { timeoutMs?: number },
  fetchImpl: GovernanceFetch,
): Promise<ProbeResult<"ALLOWED" | "RESTRICTED" | "BLOCKED" | "UNKNOWN">> {
  if (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl)) {
    return { status: "BLOCKED", evidenceUrl: source.sourceUrl, detail: "unsafe_or_missing_source_url" };
  }

  try {
    const { response, finalUrl } = await fetchProbe(source.sourceUrl, fetchImpl, source.timeoutMs ?? 8000);
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (status >= 200 && status < 300) return { status: "ALLOWED", evidenceUrl: finalUrl, detail: "http_" + status };
    if ([401, 403, 451].includes(status)) return { status: "BLOCKED", evidenceUrl: finalUrl, detail: "http_" + status };
    return { status: "RESTRICTED", evidenceUrl: finalUrl, detail: "http_" + status };
  } catch (error) {
    return {
      status: "UNKNOWN",
      evidenceUrl: source.sourceUrl,
      detail: error instanceof Error ? error.message.slice(0, 160) : "request_failed",
    };
  }
}

type RobotsRule = { directive: "allow" | "disallow"; value: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

function parseRobotsGroups(text: string) {
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let seenRule = false;

  const flush = () => {
    if (agents.length) groups.push({ agents: [...agents], rules: [...rules] });
    agents = [];
    rules = [];
    seenRule = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (key === "user-agent") {
      if (seenRule) flush();
      agents.push(value.toLowerCase());
      continue;
    }
    if (!agents.length) continue;
    if (key === "allow" || key === "disallow") {
      rules.push({ directive: key, value });
      seenRule = true;
    }
  }
  flush();
  return groups;
}

function robotsPatternMatches(path: string, pattern: string) {
  if (!pattern) return false;
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp("^" + escaped + (endAnchored ? "$" : ""));
  return regex.test(path);
}

export function robotsAllowsPath(text: string, sourceUrl: string) {
  const groups = parseRobotsGroups(text);
  const exact = groups.filter((group) => group.agents.includes(ROBOTS_AGENT));
  const applicable = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  if (!applicable.length) return true;

  const url = new URL(sourceUrl);
  const path = url.pathname + url.search;
  const matched = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => robotsPatternMatches(path, rule.value))
    .map((rule) => ({
      ...rule,
      specificity: rule.value.replace(/[*$]/g, "").length,
    }))
    .sort((a, b) => b.specificity - a.specificity || (a.directive === "allow" ? -1 : 1));

  if (!matched.length) return true;
  return matched[0].directive === "allow";
}

async function probeRobots(
  source: ActivationSource & { timeoutMs?: number },
  fetchImpl: GovernanceFetch,
): Promise<ProbeResult<"ALLOWED" | "RESTRICTED" | "DISALLOWED" | "NOT_APPLICABLE" | "UNKNOWN">> {
  if (!source.sourceUrl || !isSafeAutomationSourceUrl(source.sourceUrl)) {
    return { status: "UNKNOWN", evidenceUrl: null, detail: "source_url_unavailable" };
  }

  const sourceUrl = new URL(source.sourceUrl);
  const robotsUrl = new URL("/robots.txt", sourceUrl.origin).toString();
  try {
    const { response, finalUrl } = await fetchProbe(robotsUrl, fetchImpl, source.timeoutMs ?? 8000);
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel().catch(() => undefined);
      return { status: "NOT_APPLICABLE", evidenceUrl: finalUrl, detail: "http_" + response.status };
    }
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel().catch(() => undefined);
      return { status: "RESTRICTED", evidenceUrl: finalUrl, detail: "http_" + status };
    }
    const text = (await response.text()).slice(0, 250_000);
    return robotsAllowsPath(text, source.sourceUrl)
      ? { status: "ALLOWED", evidenceUrl: finalUrl, detail: "robots_allows_source_path" }
      : { status: "DISALLOWED", evidenceUrl: finalUrl, detail: "robots_disallows_source_path" };
  } catch (error) {
    return {
      status: "UNKNOWN",
      evidenceUrl: robotsUrl,
      detail: error instanceof Error ? error.message.slice(0, 160) : "request_failed",
    };
  }
}

function stripGeneratedTechnicalRestrictionsNote(value: string | null) {
  return (value ?? "")
    .replace(/(?:^|\s)Access check: [^.]*\.(?=\s|$)/g, " ")
    .replace(/(?:^|\s)Robots check: [^.]*\.(?=\s|$)/g, " ")
    .replace(/(?:^|\s)Technical access check: [^.]*\.(?=\s|$)/g, " ")
    .replace(/(?:^|\s)Technical robots check: [^.]*\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function technicalRestrictionsNote(
  existing: string | null,
  access: ProbeResult<string>,
  robots: ProbeResult<string>,
) {
  const preserved = stripGeneratedTechnicalRestrictionsNote(existing);
  const technical = [
    "Technical access check: " + access.detail + ".",
    "Technical robots check: " + robots.detail + ".",
  ].join(" ");
  return [preserved, technical].filter(Boolean).join(" ").slice(0, 2000);
}

export async function refreshAutomationSourceTechnicalGovernance(input: {
  source: ActivationSource & { timeoutMs?: number };
  actor: string;
  database: AutomationGovernanceDatabase;
  fetchImpl?: GovernanceFetch;
  now?: Date;
}) {
  const before = await getGovernanceState({ type: "AUTOMATION_SOURCE", id: input.source.id }, input.database);
  if (!before.schemaAvailable || !before.state) {
    return { refreshed: false, governance: before, access: null, robots: null };
  }

  const sourceUrl = input.source.sourceUrl && isSafeAutomationSourceUrl(input.source.sourceUrl)
    ? canonicalizeSourceUrl(input.source.sourceUrl)
    : null;
  if (!sourceUrl) {
    return { refreshed: false, governance: before, access: null, robots: null };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const [access, robots] = await Promise.all([
    probeAccess(input.source, fetchImpl),
    probeRobots(input.source, fetchImpl),
  ]);
  const current = before.state;

  const governance = await upsertGovernanceReview({
    subject: { type: "AUTOMATION_SOURCE", id: input.source.id },
    review: {
      accessStatus: access.status,
      robotsStatus: robots.status,
      termsStatus: current.termsStatus,
      recurringStatus: current.recurringStatus,
      retentionStatus: current.retentionStatus,
      retainUrl: current.retainUrl,
      retainTitle: current.retainTitle,
      retainSnippet: current.retainSnippet,
      retainMetadata: current.retainMetadata,
      retentionDays: current.retentionDays,
      minCadenceMinutes: current.minCadenceMinutes,
      maxRequestsPerDay: current.maxRequestsPerDay,
      manualOnly: current.manualOnly,
      pathScope: current.pathScope,
      restrictionsNote: technicalRestrictionsNote(current.restrictionsNote, access, robots),
      termsUrl: current.termsUrl,
      privacyUrl: current.privacyUrl,
      robotsUrl: robots.evidenceUrl,
      evidenceUrl: sourceUrl,
      rationale: current.rationale,
      expiresAt: current.expiresAt,
      reviewDueAt: current.reviewDueAt,
      expectedUpdatedAt: current.updatedAt,
    },
    actor: input.actor,
    now: input.now,
  }, input.database);

  return {
    refreshed: true,
    governance: { schemaAvailable: true, state: governance } satisfies AutomationGovernanceRead,
    access,
    robots,
  };
}

export async function prepareAutomationSourceGovernanceForApproval(input: {
  source: ActivationSource & { timeoutMs?: number };
  actor: string;
  database: AutomationGovernanceDatabase;
  fetchImpl?: GovernanceFetch;
  now?: Date;
}) {
  const before = await getGovernanceState({ type: "AUTOMATION_SOURCE", id: input.source.id }, input.database);
  if (!before.schemaAvailable) {
    return { prepared: false, governance: before, access: null, robots: null };
  }
  if (before.state) {
    const refreshed = await refreshAutomationSourceTechnicalGovernance(input);
    return {
      prepared: refreshed.refreshed,
      governance: refreshed.governance,
      access: refreshed.access,
      robots: refreshed.robots,
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const [access, robots] = await Promise.all([
    probeAccess(input.source, fetchImpl),
    probeRobots(input.source, fetchImpl),
  ]);

  const sourceUrl = input.source.sourceUrl && isSafeAutomationSourceUrl(input.source.sourceUrl)
    ? canonicalizeSourceUrl(input.source.sourceUrl)
    : null;
  if (!sourceUrl) {
    return { prepared: false, governance: before, access, robots };
  }

  const governance = await upsertGovernanceReview({
    subject: { type: "AUTOMATION_SOURCE", id: input.source.id },
    review: {
      accessStatus: access.status,
      robotsStatus: robots.status,
      // "Schváliť" is the explicit operator decision for human governance dimensions.
      // These values are not inferred from the discovery provider or another domain.
      termsStatus: "ALLOWED",
      recurringStatus: "APPROVED",
      retentionStatus: "RESTRICTED",
      retainUrl: true,
      retainTitle: false,
      retainSnippet: false,
      retainMetadata: true,
      retentionDays: null,
      minCadenceMinutes: null,
      maxRequestsPerDay: null,
      manualOnly: false,
      pathScope: null,
      restrictionsNote: technicalRestrictionsNote(
        "Source-only approval. Stored evidence is limited to URL and automation metadata.",
        access,
        robots,
      ),
      termsUrl: null,
      privacyUrl: null,
      robotsUrl: robots.evidenceUrl,
      evidenceUrl: sourceUrl,
      rationale: "Admin source approval: operator explicitly approved source-level terms, recurring monitoring and minimal URL/metadata retention; access and robots were verified against the source domain. Discovery-root governance was not inherited.",
      expiresAt: null,
      reviewDueAt: null,
      expectedUpdatedAt: null,
    },
    actor: input.actor,
    now: input.now,
  }, input.database);

  return {
    prepared: true,
    governance: { schemaAvailable: true, state: governance } satisfies AutomationGovernanceRead,
    access,
    robots,
  };
}
