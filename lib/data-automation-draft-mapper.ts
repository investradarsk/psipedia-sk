import type { AutomationFindingDetail } from "./data-automation-store.ts";
import type { CanonicalDraftInput } from "./canonical-draft-service.ts";

function duplicateSlugSuffix(at: string) {
  const digits = at.replace(/[^0-9]/g, "").slice(0, 14);
  return digits ? `koncept-${digits}` : "koncept";
}

export function mapAutomationFindingToDraftInput(
  finding: AutomationFindingDetail,
  createdAt: string,
): CanonicalDraftInput {
  return {
    entityType: finding.entityType,
    data: finding.proposed,
    externalSourceUrl: finding.sourceUrl,
    slugSuffix: finding.findingType === "DUPLICATE_CANDIDATE"
      ? duplicateSlugSuffix(createdAt)
      : null,
  };
}
