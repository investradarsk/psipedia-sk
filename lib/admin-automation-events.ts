import { enqueueAdminNotificationEvent } from "./admin-notifications";

export type AutomationActor = "AUTOMATION" | "SYSTEM" | "ADMIN" | "PARTNER" | "PUBLIC";
export type AutomationRunStatus = "STARTED" | "SUCCESS" | "NO_CHANGE" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";
export type AdminPushCategory = "RUN_STARTED" | "RUN_RESULTS" | "ERRORS" | "PUBLISH" | "IMPORT_SYNC";
export const ADMIN_PUSH_CATEGORIES: AdminPushCategory[] = ["RUN_STARTED", "RUN_RESULTS", "ERRORS", "PUBLISH", "IMPORT_SYNC"];

export function adminPushCategoryForEvent(eventType: string): AdminPushCategory | null {
  if (eventType === "automation_run_started") return "RUN_STARTED";
  if (eventType === "automation_run_failed" || eventType === "automation_run_partial_success" || eventType === "automation_source_issue") return "ERRORS";
  if (eventType.startsWith("automation_run_")) return "RUN_RESULTS";
  if (eventType === "automation_article_published" || eventType === "automation_article_draft") return "PUBLISH";
  if (eventType.startsWith("automation_import_") || eventType.startsWith("automation_sync_")) return "IMPORT_SYNC";
  return null; // Existing unrelated administrator alerts retain their previous policy.
}

export function parsePushCategories(value: unknown): AdminPushCategory[] {
  if (!Array.isArray(value)) throw new Error("Očakáva sa zoznam kategórií.");
  if (value.some((key) => typeof key !== "string" || !ADMIN_PUSH_CATEGORIES.includes(key as AdminPushCategory))) {
    throw new Error("Neznáma kategória upozornení.");
  }
  return [...new Set(value as AdminPushCategory[])];
}

export function parseStoredPushCategories(raw: string | null | undefined): AdminPushCategory[] {
  try { return parsePushCategories(JSON.parse(raw ?? "")); }
  catch { return [...ADMIN_PUSH_CATEGORIES]; }
}

export function isAutomaticPushActor(actor: AutomationActor, scheduled: boolean): boolean {
  return actor === "AUTOMATION" && scheduled;
}

export function completedAutomationRunStatus(input: {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  created?: number;
  updated?: number;
  changed?: number;
  draftCreated?: number;
}): AutomationRunStatus {
  if (input.status === "FAILED") return "FAILED";
  if (input.status === "PARTIAL") return "PARTIAL_SUCCESS";
  const changes = [input.created, input.updated, input.changed, input.draftCreated];
  // Undefined counts must never be silently interpreted as zero.
  return changes.some((count) => typeof count === "number")
    && changes.every((count) => count === undefined || count === 0)
    ? "NO_CHANGE"
    : "SUCCESS";
}

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
