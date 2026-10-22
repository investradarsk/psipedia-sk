import { nextGeminiRunAt } from "./gemini-automation-schedule.ts";

/** Read-only explanation of the persisted Gemini schedule.
 * Never changes D1, queues a task, or infers a future run by itself. */
export type GeminiScheduleSnapshot = {
  enabled: boolean;
  saved: boolean;
  maxNewConcepts: number;
  nextRunAt: string | null;
};
export type GeminiScheduleGates = {
  globalRunning: boolean;
  externalEnabled: boolean;
  scheduledEnabled: boolean;
};
export type GeminiSchedulePresentation = {
  label: string;
  explanation: string;
};

export function geminiSchedulePresentation(
  setting: GeminiScheduleSnapshot,
  gates: GeminiScheduleGates,
  now: number,
): GeminiSchedulePresentation {
  if (!setting.saved) return {
    label: "Nenastavené", explanation: "Najprv ulož nastavenia tejto kategórie.",
  };
  if (!setting.enabled) return {
    label: "Vypnuté", explanation: "Kategória nemá zapnuté automatické spúšťanie.",
  };
  if (setting.maxNewConcepts === 0) return {
    label: "Limit 0", explanation: "Pri limite 0 sa platené vyhľadávanie nespúšťa.",
  };
  if (!gates.globalRunning) return {
    label: "Hlavný STOP", explanation: "Plán kategórie je zapnutý, ale hlavný STOP blokuje spustenie.",
  };
  if (!gates.externalEnabled) return {
    label: "Pracovník vypnutý", explanation: "Externý Gemini pracovník nie je povolený.",
  };
  if (!gates.scheduledEnabled) return {
    label: "Plánovač vypnutý", explanation: "Kategória je zapnutá, ale plánovaný dispatch nie je povolený.",
  };
  if (!setting.nextRunAt) return {
    label: "Bez termínu", explanation: "Nebol uložený ďalší plánovaný termín.",
  };
  const date = Date.parse(setting.nextRunAt);
  if (!Number.isFinite(date)) return {
    label: "Neplatný termín", explanation: "Uložený termín sa nedá prečítať.",
  };
  if (date <= now) return {
    label: "Zapnuté",
    explanation: "Starší termín čaká na spracovanie. Plánovač je zapnutý; nové úlohy sa spúšťajú podľa poradia.",
  };
  return {
    label: "Zapnuté",
    explanation: "Kategória je naplánovaná; nasledujúci termín pochádza z D1.",
  };
}


/** Display the next regular future slot while exposing a due D1 slot separately.
 * This is read-only: never advance the persisted slot or dispatch paid work.
 * The worker may process an overdue slot before the displayed future date.
 */
export function nextVisibleGeminiSchedule(
  setting: GeminiScheduleSnapshot & { cadenceMinutes: number; weeklyDay: number | null },
  now: number,
): { nextRegularAt: string | null; overdueAt: string | null } {
  if (!setting.saved || !setting.enabled || setting.maxNewConcepts <= 0 ||
      !setting.nextRunAt || !Number.isFinite(now)) {
    return { nextRegularAt: null, overdueAt: null };
  }
  const due = new Date(setting.nextRunAt);
  if (!Number.isFinite(due.getTime())) return { nextRegularAt: null, overdueAt: null };
  if (due.getTime() > now) return { nextRegularAt: setting.nextRunAt, overdueAt: null };
  try {
    return {
      nextRegularAt: nextGeminiRunAt(due, setting.cadenceMinutes, setting.weeklyDay, new Date(now)),
      overdueAt: setting.nextRunAt,
    };
  } catch {
    return { nextRegularAt: null, overdueAt: setting.nextRunAt };
  }
}
