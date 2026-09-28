import type { AutomationEntityType, AutomationFindingType } from "./data-automation.ts";
import type { AutomationFindingDetail } from "./data-automation-store.ts";
import type { CanonicalDraftInput } from "./canonical-draft-service.ts";

function duplicateSlugSuffix(at: string) {
  const digits = at.replace(/[^0-9]/g, "").slice(0, 14);
  return digits ? `koncept-${digits}` : "koncept";
}

export function mapAutomationRecordToDraftInput(input: {
  entityType: AutomationEntityType;
  proposed: Record<string, unknown>;
  sourceUrl?: string | null;
  findingType?: Pick<AutomationFindingDetail, "findingType">["findingType"] | AutomationFindingType;
  createdAt: string;
}): CanonicalDraftInput {
  const data = input.entityType === "DIRECTORY"
    ? {
        ...input.proposed,
        // Discovery never promotes an unverified scraped address to a confirmed
        // service address. Canonical address verification stays authoritative.
        serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
      }
    : input.proposed;
  return {
    entityType: input.entityType,
    data,
    externalSourceUrl: input.sourceUrl ?? null,
    slugSuffix: input.findingType === "DUPLICATE_CANDIDATE"
      ? duplicateSlugSuffix(input.createdAt)
      : null,
  };
}

export function mapAutomationFindingToDraftInput(
  finding: AutomationFindingDetail,
  createdAt: string,
): CanonicalDraftInput {
  const mapped = mapAutomationRecordToDraftInput({
    entityType: finding.entityType,
    proposed: finding.proposed,
    sourceUrl: finding.sourceUrl,
    findingType: finding.findingType,
    createdAt,
  });
  return {
    ...mapped,
    // Keep the DETACH boundary explicit: the canonical draft owns only the
    // external URL, never an automation finding/source ownership link.
    externalSourceUrl: finding.sourceUrl,
  };
}
