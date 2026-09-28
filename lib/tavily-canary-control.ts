import type { AutomationDiscoveryRoot } from "./data-automation-discovery-store.ts";
import type { AutomationGovernanceRead } from "./data-automation-governance.ts";
import { evaluateGovernanceForActivation } from "./data-automation-governance.ts";

export const TAVILY_EVENT_ROOT_KEY = "tavily-sk-dog-events";

export function isTavilySearchDiscoveryRoot(root: AutomationDiscoveryRoot) {
  return root.discoveryType === "SEARCH_PROVIDER" && String(root.config.provider ?? "").toLowerCase() === "tavily";
}

const TAVILY_SEARCH_GOVERNANCE_BASE = Object.freeze({
  accessStatus: "ALLOWED" as const,
  robotsStatus: "NOT_APPLICABLE" as const,
  termsStatus: "ALLOWED" as const,
  recurringStatus: "APPROVED" as const,
  retentionStatus: "APPROVED" as const,
  retainUrl: true,
  retainTitle: true,
  retainSnippet: true,
  retainMetadata: true,
  retentionDays: null,
  maxRequestsPerDay: 3,
  manualOnly: false,
  pathScope: null,
  restrictionsNote: "Internal source discovery only. Human review required before candidate source approval.",
  termsUrl: null,
  privacyUrl: null,
  robotsUrl: null,
  evidenceUrl: null,
  rationale: "Approved for controlled Psipedia source-discovery canary.",
  expiresAt: null,
  reviewDueAt: null,
});

type TavilyGovernanceCadencePolicy = {
  entityType: AutomationDiscoveryRoot["entityType"];
  minCadenceMinutes: number;
};

const TAVILY_GOVERNANCE_CADENCE_POLICY = Object.freeze({
  "tavily-sk-dog-events": { entityType: "EVENT", minCadenceMinutes: 2880 },
  "tavily-sk-dog-adoptions": { entityType: "ADOPTION", minCadenceMinutes: 1440 },
  "tavily-sk-dog-foster": { entityType: "FOSTER", minCadenceMinutes: 1440 },
  "tavily-sk-dog-lost-found": { entityType: "LOST_FOUND", minCadenceMinutes: 1440 },
  "tavily-sk-dog-organizations": { entityType: "ORGANIZATION", minCadenceMinutes: 10080 },
  "tavily-sk-dog-veterinarians": { entityType: "DIRECTORY", minCadenceMinutes: 10080 },
  "tavily-sk-dog-grooming": { entityType: "DIRECTORY", minCadenceMinutes: 10080 },
  "tavily-sk-dog-hotels-daycare": { entityType: "DIRECTORY", minCadenceMinutes: 10080 },
  "tavily-sk-dog-trainers": { entityType: "DIRECTORY", minCadenceMinutes: 10080 },
  "tavily-sk-dog-rehabilitation": { entityType: "DIRECTORY", minCadenceMinutes: 10080 },
} satisfies Record<string, TavilyGovernanceCadencePolicy>);

export function tavilySearchGovernancePresetForRoot(root: AutomationDiscoveryRoot) {
  if (!isTavilySearchDiscoveryRoot(root)) throw new Error("GOVERNANCE_POLICY_UNSUPPORTED");
  const policy = TAVILY_GOVERNANCE_CADENCE_POLICY[
    root.rootKey as keyof typeof TAVILY_GOVERNANCE_CADENCE_POLICY
  ];
  if (!policy || policy.entityType !== root.entityType) {
    throw new Error("GOVERNANCE_POLICY_UNSUPPORTED");
  }
  return Object.freeze({
    ...TAVILY_SEARCH_GOVERNANCE_BASE,
    minCadenceMinutes: policy.minCadenceMinutes,
  });
}

// Backwards-compatible EVENT preset for existing callers/tests. New approvals must
// use tavilySearchGovernancePresetForRoot(root), not this fixed EVENT policy.
export const TAVILY_EVENT_GOVERNANCE_PRESET = Object.freeze({
  ...TAVILY_SEARCH_GOVERNANCE_BASE,
  minCadenceMinutes: 2880,
});

export function tavilyRootGovernanceEvaluation(
  root: AutomationDiscoveryRoot,
  governance: AutomationGovernanceRead,
  now = new Date(),
) {
  return evaluateGovernanceForActivation(governance, {
    recurring: true,
    cadenceMinutes: root.cadenceMinutes,
    storageFields: ["url", "title", "snippet", "metadata"],
  }, now);
}

export function tavilyCanaryReadiness(input: {
  root: AutomationDiscoveryRoot;
  governance: AutomationGovernanceRead;
  secretConfigured: boolean;
  now?: Date;
}) {
  const governanceEvaluation = tavilyRootGovernanceEvaluation(
    input.root,
    input.governance,
    input.now ?? new Date(),
  );
  const blockers: string[] = [];
  if (!input.secretConfigured) blockers.push("SECRET_NOT_CONFIGURED");
  if (!governanceEvaluation.allowed) blockers.push(...governanceEvaluation.blockingReasons);
  if (input.root.reviewStatus !== "APPROVED") blockers.push("ROOT_NOT_APPROVED");
  if (!input.root.enabled) blockers.push("ROOT_DISABLED");
  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    governanceEvaluation,
  };
}
