import type {
  AutomationEntityType,
  AutomationSourceRecord,
} from "./data-automation.ts";
import type { AutomationSearchResult } from "./data-automation-discovery.ts";
import {
  automationEnrichmentCompleteness,
  normalizeAutomationEnrichmentProposal,
} from "./data-automation-enrichment-normalize.ts";
import {
  automationEnrichmentIdentityMatches,
  automationEnrichmentSearchPlans,
  automationSearchSnippetEvidence,
  mergeAutomationEnrichmentEvidence,
  type AutomationEnrichmentSearchPlan,
} from "./data-automation-enrichment-evidence.ts";

export type EntityEnrichmentSearch =
  (plan: AutomationEnrichmentSearchPlan) => Promise<AutomationSearchResult[]>;

function errorCode(error: unknown) {
  return error instanceof Error ? error.name : "unknown_error";
}

export async function enrichAutomationRecordSchemaFirst(input: {
  entityType: AutomationEntityType;
  record: AutomationSourceRecord;
  targetedSearch?: EntityEnrichmentSearch;
  maxTargetedSearches?: number;
}) {
  let proposed = normalizeAutomationEnrichmentProposal(input.entityType, input.record.proposed);
  const primary = automationEnrichmentCompleteness(input.entityType, proposed);

  console.info(JSON.stringify({
    event: "data_automation_entity_enrichment",
    phase: "primary_parse",
    entityType: input.entityType,
    sourceRecordId: input.record.sourceRecordId,
    fieldsPresent: primary.present.length,
    highValueMissing: primary.missingHighValue.length,
  }));

  let searches = 0;
  let fieldsAdded = 0;
  let conflicts = 0;

  if (input.targetedSearch) {
    const plans = automationEnrichmentSearchPlans({
      entityType: input.entityType,
      proposed,
      sourceUrl: input.record.sourceUrl,
      maxPlans: Math.max(0, Math.min(2, input.maxTargetedSearches ?? 2)),
    });

    for (const plan of plans) {
      let results: AutomationSearchResult[] = [];
      try {
        results = await input.targetedSearch(plan);
        searches += 1;
      } catch (error) {
        console.info(JSON.stringify({
          event: "data_automation_entity_enrichment",
          phase: "enrichment_failed",
          entityType: input.entityType,
          sourceRecordId: input.record.sourceRecordId,
          group: plan.group,
          error: errorCode(error),
        }));
        continue;
      }

      for (const result of results.slice(0, 5)) {
        if (!automationEnrichmentIdentityMatches({
          entityType: input.entityType,
          proposed,
          sourceUrl: input.record.sourceUrl,
          result,
        })) continue;

        const incoming = automationSearchSnippetEvidence(input.entityType, plan.group, result);
        const merged = mergeAutomationEnrichmentEvidence({
          entityType: input.entityType,
          base: proposed,
          incoming,
          evidenceType: "SEARCH_SNIPPET",
          sourceUrl: result.url,
        });
        proposed = merged.proposed;
        fieldsAdded += merged.added.length;
        conflicts += merged.conflicts.length;
      }
    }
  }

  const final = automationEnrichmentCompleteness(input.entityType, proposed);
  console.info(JSON.stringify({
    event: "data_automation_entity_enrichment",
    phase: searches ? "targeted_search_used" : "enrichment_skipped",
    entityType: input.entityType,
    sourceRecordId: input.record.sourceRecordId,
    targetedSearches: searches,
    fieldsAdded,
    conflicts,
    completeForDraft: final.completeForDraft,
  }));

  return { ...input.record, proposed } satisfies AutomationSourceRecord;
}
