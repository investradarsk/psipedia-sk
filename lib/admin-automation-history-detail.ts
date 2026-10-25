/** Read-only helpers for the persisted admin automation event history. */
export type AutomationHistoryCount = {
  label: string;
  value: number;
};

const countLabels = [
  ["Skontrolovaných", "Skontrolovaných"],
  ["Nových", "nových"],
  ["Aktualizovaných", "aktualizovaných"],
  ["Preskočených", "preskočených"],
  ["Chýb", "chýb"],
  ["Konfliktov na kontrolu", "konfliktov na kontrolu"],
] as const;

/** Only display counters which were actually persisted in the event body. */
export function parseAutomationHistoryCounts(body: string): AutomationHistoryCount[] {
  return countLabels.flatMap(([label, storedLabel]) => {
    const found = new RegExp(`(?:^|[\\s,])${storedLabel}:\\s*(\\d+)(?=[.,\\s]|$)`, "iu").exec(body);
    if (!found) return [];
    const value = Number(found[1]);
    return Number.isSafeInteger(value) ? [{ label, value }] : [];
  });
}

export function automationHistoryDetailHref(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid automation event ID.");
  return `/admin/operations/automaticke-udalosti/${id}`;
}

export function automationHistoryListHref(input: {
  system: string;
  runId: string;
  actorRef: string | null;
}): string {
  const base = "/admin/operations/automaticke-udalosti";
  if (!["data", "gemini", "discovery", "notion"].includes(input.system)) return base;
  const params = new URLSearchParams({ system: input.system, period: "90" });
  if (input.runId.length <= 60 && input.runId) params.set("run", input.runId);
  const prefix = `${input.system}/`;
  if (input.actorRef?.startsWith(prefix)) {
    const automation = input.actorRef.slice(prefix.length);
    if (automation && automation.length <= 120) params.set("automation", automation);
  }
  return `${base}?${params.toString()}`;
}
