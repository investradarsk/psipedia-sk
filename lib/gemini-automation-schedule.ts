import { geminiAutomationCatalog } from "./gemini-automation-catalog.ts";

/** Suggested values affect unsaved categories only; persisted choices always win. */
const recommended: Readonly<Record<string, number>> = {
  "directory.veterinari": 20160,
  "directory.treneri": 20160,
  "directory.kynologicke-kluby": 43200,
  "directory.chovatelske-kluby": 43200,
  "directory.chovatelske-stanice": 20160,
  "directory.salony-a-sluzby": 20160,
  "directory.hotely-a-opatrovanie": 20160,
  "directory.vencenie": 20160,
  "directory.fyzioterapia": 20160,
  "directory.dalsie-sluzby": 43200,
  "events.vystavy": 10080,
  "events.preteky": 10080,
  "events.seminare": 10080,
  "events.treningy": 10080,
  "events.stretnutia": 10080,
  "events.dalsie": 10080,
  "help.adopcia": 4320,
  "help.utulky": 43200,
  "help.docasna-opatera": 4320,
  "help.zbierky": 10080,
  "help.stratene-a-najdene": 1440,
  "help.dobrovolnictvo": 20160,
};

if (Object.keys(recommended).length !== geminiAutomationCatalog.length ||
  geminiAutomationCatalog.some((item) => !recommended[item.stableKey])) {
  throw new Error("GEMINI_RECOMMENDATIONS_OUT_OF_SYNC");
}

export function recommendedGeminiCadence(stableKey: string): number {
  return recommended[stableKey] ?? 1440;
}

export const geminiSchedulerOptions = [
  { minutes: 1440, label: "Denne" },
  { minutes: 2880, label: "Každé 2 dni" },
  { minutes: 4320, label: "Každé 3 dni" },
  { minutes: 7200, label: "Každých 5 dní" },
  { minutes: 10080, label: "Týždenne" },
  { minutes: 20160, label: "Každých 14 dní" },
  { minutes: 43200, label: "Každých 30 dní" },
] as const;

export const geminiWeekdays = [
  { value: 1, label: "Pondelok" }, { value: 2, label: "Utorok" },
  { value: 3, label: "Streda" }, { value: 4, label: "Štvrtok" },
  { value: 5, label: "Piatok" }, { value: 6, label: "Sobota" },
  { value: 7, label: "Nedeľa" },
] as const;

// Dates are stored as UTC instants but recurrence is calculated using civil time
// in Europe/Bratislava so 24h/day arithmetic never drifts at DST boundaries.
const localFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
type Local = { year: number; month: number; day: number; hour: number; minute: number; second: number };
function localParts(date: Date): Local {
  const values = Object.fromEntries(localFormatter.formatToParts(date)
    .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return values as Local;
}
function localInstant(fields: Local): Date {
  const target = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const observed = localParts(new Date(candidate));
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day,
      observed.hour, observed.minute, observed.second);
    const difference = observedUtc - target;
    if (difference === 0) break;
    candidate -= difference;
  }
  return new Date(candidate);
}
function advanceCalendar(date: Date, days: number): Date {
  const fields = localParts(date);
  const shifted = new Date(Date.UTC(fields.year, fields.month - 1, fields.day + days,
    fields.hour, fields.minute, fields.second));
  return localInstant({
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(), hour: fields.hour, minute: fields.minute, second: fields.second,
  });
}
function nextWeekly(base: Date, weekday: number): Date {
  const fields = localParts(base);
  const currentDay = (new Date(Date.UTC(fields.year, fields.month - 1, fields.day)).getUTCDay() + 6) % 7 + 1;
  const offset = (weekday - currentDay + 7) % 7;
  const localDay = new Date(Date.UTC(fields.year, fields.month - 1, fields.day + offset));
  let candidate = localInstant({ year: localDay.getUTCFullYear(), month: localDay.getUTCMonth() + 1,
    day: localDay.getUTCDate(), hour: 9, minute: 0, second: 0 });
  if (candidate.getTime() <= base.getTime()) candidate = advanceCalendar(candidate, 7);
  return candidate;
}

/** Strictly later than after: overdue slots are skipped, never replayed as paid retries. */
export function nextGeminiRunAt(base: Date, cadenceMinutes: number, weekday: number | null,
  after: Date = base): string {
  if (!Number.isSafeInteger(cadenceMinutes) || cadenceMinutes < 5 || cadenceMinutes > 43200)
    throw new Error("GEMINI_SCHEDULE_INVALID_CADENCE");
  if (weekday != null && (cadenceMinutes !== 10080 || !Number.isInteger(weekday) ||
    weekday < 1 || weekday > 7)) throw new Error("GEMINI_SCHEDULE_INVALID_WEEKDAY");
  let candidate = weekday != null ? nextWeekly(base, weekday)
    : cadenceMinutes % 1440 === 0 ? advanceCalendar(base, cadenceMinutes / 1440)
      : new Date(base.getTime() + cadenceMinutes * 60_000);
  // A long outage should never generate multiple historical paid jobs.
  for (let i = 0; candidate <= after && i < 4096; i++) {
    candidate = weekday != null ? advanceCalendar(candidate, 7)
      : cadenceMinutes % 1440 === 0 ? advanceCalendar(candidate, cadenceMinutes / 1440)
        : new Date(candidate.getTime() + cadenceMinutes * 60_000);
  }
  if (candidate <= after) {
    return nextGeminiRunAt(after, cadenceMinutes, weekday, after);
  }
  return candidate.toISOString();
}
