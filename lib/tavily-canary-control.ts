import type { AutomationDiscoveryRoot } from "./data-automation-discovery-store.ts";
import type { AutomationGovernanceRead } from "./data-automation-governance.ts";
import { evaluateGovernanceForActivation } from "./data-automation-governance.ts";

export const TAVILY_EVENT_ROOT_KEY = "tavily-sk-dog-events";

export const TAVILY_EVENT_GOVERNANCE_PRESET = Object.freeze({
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
  minCadenceMinutes: 2880,
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
