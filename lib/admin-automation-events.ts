import { enqueueAdminNotificationEvent } from "./admin-notifications";
import { isAutomaticPushActor } from "./admin-automation-push-policy";
import type { AutomationActor, AutomationRunStatus } from "./admin-automation-push-policy";
export {
  adminPushCategoryForEvent,
  parsePushCategories,
  parseStoredPushCategories,
  completedAutomationRunStatus,
  isAutomaticPushActor,
  ADMIN_PUSH_CATEGORIES,
} from "./admin-automation-push-policy";
export type { AutomationActor, AutomationRunStatus, AdminPushCategory } from "./admin-automation-push-policy";

export type AutomationEventInput = {
  database: Pick<D1Database, "prepare">;
  system: string;
  automationId: string | number;
  runId: string | number;
  label: string;
  status: AutomationRunStatus;
  actor: AutomationActor;
  scheduled: boolean;
  at: Date;
  checked?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  targetUrl?: string;
};

/** Only invoked AFTER persisted run transitions. One stable event per stage/run. */
export async function recordAdminAutomationRunEvent(input: AutomationEventInput) {
  if (!isAutomaticPushActor(input.actor, input.scheduled)) return { created: false, suppressed: true };
  const stage = input.status.toLowerCase();
  const counts = [
    input.checked !== undefined ? `Skontrolovaných: ${input.checked}` : null,
    input.created !== undefined ? `nových: ${input.created}` : null,
    input.updated !== undefined ? `aktualizovaných: ${input.updated}` : null,
    input.skipped !== undefined ? `preskočených: ${input.skipped}` : null,
    input.errors !== undefined ? `chýb: ${input.errors}` : null,
  ].filter(Boolean).join(", ");
  const intro: Record<AutomationRunStatus, string> = {
    STARTED: "Automatická kontrola sa začala.",
    SUCCESS: "Automatická kontrola dokončená.",
    NO_CHANGE: "Kontrola dokončená bez nových zmien.",
    PARTIAL_SUCCESS: "Kontrola dokončená s čiastočným úspechom.",
    FAILED: "Automatická kontrola zlyhala.",
    SKIPPED: "Automatická kontrola bola preskočená.",
    CANCELLED: "Automatická kontrola bola zrušená.",
  };
  return enqueueAdminNotificationEvent(input.database, {
    eventType: `automation_run_${stage}`,
    sourceType: "AUTOMATION_RUN",
    resourceType: input.system,
    resourceRef: String(input.runId),
    actorType: "AUTOMATION",
    actorRef: `${input.system}/${input.automationId}`,
    targetUrl: input.targetUrl ?? "/admin/operations/automaticke-udalosti",
    title: `Psipedia — ${input.label}`,
    body: counts ? `${intro[input.status]} ${counts}.` : intro[input.status],
    tag: `auto-${input.system}-${input.runId}-${stage}`,
    dedupeKey: `automation-run/${input.system}/${input.automationId}/${input.runId}/${stage}`,
  }, input.at);
}

export async function safelyRecordAdminAutomationRunEvent(input: AutomationEventInput): Promise<void> {
  try { await recordAdminAutomationRunEvent(input); }
  catch (error) {
    // Observation cannot change a canonical automation result.
    console.error(JSON.stringify({
      event: "admin_automation_event_failed",
      system: input.system,
      runId: String(input.runId),
      status: input.status,
      reason: error instanceof Error ? error.name : "unknown",
    }));
  }
}
