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
    label: "Čaká na plánovač",
    explanation: "Termín už nastal. Plánovač čaká na voľného pracovníka alebo ďalšiu kontrolu.",
  };
  return {
    label: "Zapnuté",
    explanation: "Kategória je naplánovaná; nasledujúci termín pochádza z D1.",
  };
}
