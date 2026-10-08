import {
  completedAutomationRunStatus,
  safelyRecordAdminAutomationRunEvent,
  type AutomationRunStatus,
} from "./admin-automation-events";

type Counts = {
  enabled?: boolean;
  schemaReady?: boolean;
  checked?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
};

export async function observeScheduledAutomation<T>(input: {
  database: D1Database;
  scheduledTime?: number;
  system: string;
  automationId: string;
  label: string;
  active: boolean;
  execute: () => Promise<T>;
  summarize: (result: T) => Counts;
}): Promise<T> {
  // A reliable cron trigger timestamp is the idempotency key across retries.
  // No synthetic success event is created if the worker did not run this task.
  if (!input.active || !Number.isSafeInteger(input.scheduledTime) || !input.scheduledTime) {
    return input.execute();
  }
  const runId = input.scheduledTime;
  const identity = {
    database: input.database,
    system: input.system,
    automationId: input.automationId,
    runId,
    label: input.label,
    actor: "AUTOMATION" as const,
    scheduled: true,
  };
  await safelyRecordAdminAutomationRunEvent({ ...identity, status: "STARTED", at: new Date() });
  try {
    const result = await input.execute();
    const counts = input.summarize(result);
    const hasChanges = (counts.created ?? 0) + (counts.updated ?? 0) > 0;
    let status: AutomationRunStatus = counts.enabled === false
      ? "SKIPPED"
      : counts.schemaReady === false
        ? "FAILED"
        : completedAutomationRunStatus({
          status: (counts.errors ?? 0) > 0 ? (hasChanges ? "PARTIAL" : "FAILED") : "SUCCESS",
          created: counts.created,
          updated: counts.updated,
        });
    // A task without any count data must not be reported as NO_CHANGE.
    if (status === "NO_CHANGE" && counts.created === undefined && counts.updated === undefined) status = "SUCCESS";
    await safelyRecordAdminAutomationRunEvent({
      ...identity, status, at: new Date(),
      checked: counts.checked, created: counts.created, updated: counts.updated,
      skipped: counts.skipped, errors: counts.errors,
    });
    return result;
  } catch (error) {
    await safelyRecordAdminAutomationRunEvent({
      ...identity, status: "FAILED", at: new Date(), errors: 1,
    });
    throw error;
  }
}
