export type AutomationActor = "AUTOMATION" | "SYSTEM" | "ADMIN" | "PARTNER" | "PUBLIC";
export type AutomationRunStatus = "STARTED" | "SUCCESS" | "NO_CHANGE" | "PARTIAL_SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";
export type AdminPushCategory = "RUN_STARTED" | "RUN_RESULTS" | "ERRORS" | "PUBLISH" | "IMPORT_SYNC";
export const ADMIN_PUSH_CATEGORIES: AdminPushCategory[] = ["RUN_STARTED", "RUN_RESULTS", "ERRORS", "PUBLISH", "IMPORT_SYNC"];

export function adminPushCategoryForEvent(eventType: string, system?: string): AdminPushCategory | null {
  if (eventType === "automation_run_started") return "RUN_STARTED";
  if (eventType === "automation_run_failed" || eventType === "automation_run_partial_success" || eventType === "automation_source_issue") return "ERRORS";
  if (eventType.startsWith("automation_run_") && system === "notion") return "IMPORT_SYNC";
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

