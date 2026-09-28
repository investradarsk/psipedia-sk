export const AUTOMATION_TIMEZONE = "Europe/Bratislava" as const;
export const AUTOMATION_WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type AutomationWeekday = (typeof AUTOMATION_WEEKDAYS)[number];

export type AutomationSchedule =
  | { mode: "INTERVAL"; intervalMinutes: number }
  | {
      mode: "CALENDAR";
      daysOfWeek: AutomationWeekday[];
      localTime: string;
      timezone: typeof AUTOMATION_TIMEZONE;
    };

export type AutomationScheduleStorage = {
  cadenceMinutes: number;
  scheduleMode: "INTERVAL" | "CALENDAR" | null;
  scheduleDaysJson: string | null;
  scheduleLocalTime: string | null;
  scheduleTimezone: string | null;
};

const MIN_INTERVAL_MINUTES = 60;
const MAX_INTERVAL_MINUTES = 43_200;
const WEEKDAY_INDEX = new Map<AutomationWeekday, number>(AUTOMATION_WEEKDAYS.map((day, index) => [day, index]));
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

function localParts(date: Date, timezone: string) {
  const parts = formatter(timezone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function sameLocalMinute(
  date: Date,
  timezone: string,
  target: { year: number; month: number; day: number; hour: number; minute: number },
) {
  const actual = localParts(date, timezone);
  return actual.year === target.year
    && actual.month === target.month
    && actual.day === target.day
    && actual.hour === target.hour
    && actual.minute === target.minute;
}

function timezoneOffsetMinutes(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function exactLocalInstant(
  target: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
) {
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set<number>();
  for (const deltaHours of [-12, 0, 12]) {
    offsets.add(timezoneOffsetMinutes(new Date(naiveUtc + deltaHours * 60 * 60_000), timezone));
  }
  const candidates = [...offsets]
    .map((offsetMinutes) => new Date(naiveUtc - offsetMinutes * 60_000))
    .filter((candidate) => sameLocalMinute(candidate, timezone, target))
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

function resolveLocalInstant(
  date: { year: number; month: number; day: number },
  localTime: string,
  timezone: string,
) {
  const [hour, minute] = localTime.split(":").map(Number);
  const exact = exactLocalInstant({ ...date, hour, minute }, timezone);
  if (exact) return exact;

  // Spring-forward policy: if the requested wall-clock minute does not exist,
  // use the first valid local minute after it on the same local date.
  const requestedMinute = hour * 60 + minute;
  for (let localMinute = requestedMinute + 1; localMinute < 24 * 60; localMinute += 1) {
    const candidate = exactLocalInstant({
      ...date,
      hour: Math.floor(localMinute / 60),
      minute: localMinute % 60,
    }, timezone);
    if (candidate) return candidate;
  }
  return null;
}

function validIntervalMinutes(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= MIN_INTERVAL_MINUTES && Number(value) <= MAX_INTERVAL_MINUTES;
}

function normalizedWeekdays(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > AUTOMATION_WEEKDAYS.length) {
    throw new Error("automation_schedule_days_invalid");
  }
  const result: AutomationWeekday[] = [];
  const seen = new Set<string>();
  for (const day of value) {
    if (typeof day !== "string" || !WEEKDAY_INDEX.has(day as AutomationWeekday)) {
      throw new Error("automation_schedule_weekday_invalid");
    }
    if (seen.has(day)) throw new Error("automation_schedule_days_duplicate");
    seen.add(day);
    result.push(day as AutomationWeekday);
  }
  return result.sort((a, b) => WEEKDAY_INDEX.get(a)! - WEEKDAY_INDEX.get(b)!);
}

function normalizedLocalTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error("automation_schedule_time_invalid");
  }
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("automation_schedule_time_invalid");
  }
  return value;
}

export function parseAutomationSchedule(value: unknown): AutomationSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("automation_schedule_payload_invalid");
  }
  const input = value as Record<string, unknown>;
  if (input.mode === "INTERVAL") {
    const intervalMinutes = Number(input.intervalMinutes);
    if (!validIntervalMinutes(intervalMinutes)) throw new Error("automation_schedule_interval_invalid");
    return { mode: "INTERVAL", intervalMinutes };
  }
  if (input.mode === "CALENDAR") {
    const timezone = String(input.timezone ?? "");
    if (timezone !== AUTOMATION_TIMEZONE) throw new Error("automation_schedule_timezone_invalid");
    return {
      mode: "CALENDAR",
      daysOfWeek: normalizedWeekdays(input.daysOfWeek),
      localTime: normalizedLocalTime(input.localTime),
      timezone: AUTOMATION_TIMEZONE,
    };
  }
  throw new Error("automation_schedule_mode_invalid");
}

function safeLegacyInterval(cadenceMinutes: unknown) {
  const value = Math.floor(Number(cadenceMinutes));
  return validIntervalMinutes(value) ? value : 1440;
}

export function automationScheduleFromStorage(input: {
  cadenceMinutes: unknown;
  scheduleMode?: unknown;
  scheduleDaysJson?: unknown;
  scheduleLocalTime?: unknown;
  scheduleTimezone?: unknown;
}): AutomationSchedule {
  if (input.scheduleMode === "CALENDAR") {
    try {
      const days = typeof input.scheduleDaysJson === "string" ? JSON.parse(input.scheduleDaysJson) : null;
      return parseAutomationSchedule({
        mode: "CALENDAR",
        daysOfWeek: days,
        localTime: input.scheduleLocalTime,
        timezone: input.scheduleTimezone,
      });
    } catch {
      // Additive migration/backward compatibility: a partial/corrupt calendar
      // row falls back to its existing cadence instead of becoming unschedulable.
    }
  }
  return { mode: "INTERVAL", intervalMinutes: safeLegacyInterval(input.cadenceMinutes) };
}

export function effectiveAutomationCadenceMinutes(schedule: AutomationSchedule) {
  if (schedule.mode === "INTERVAL") return schedule.intervalMinutes;
  const indexes = schedule.daysOfWeek.map((day) => WEEKDAY_INDEX.get(day)!).sort((a, b) => a - b);
  let minimumGapDays = 7;
  for (let index = 0; index < indexes.length; index += 1) {
    const current = indexes[index];
    const next = index === indexes.length - 1 ? indexes[0] + 7 : indexes[index + 1];
    minimumGapDays = Math.min(minimumGapDays, next - current);
  }
  return minimumGapDays * 24 * 60;
}

export function automationScheduleStorage(schedule: AutomationSchedule): AutomationScheduleStorage {
  return schedule.mode === "INTERVAL"
    ? {
        cadenceMinutes: schedule.intervalMinutes,
        scheduleMode: "INTERVAL",
        scheduleDaysJson: null,
        scheduleLocalTime: null,
        scheduleTimezone: null,
      }
    : {
        cadenceMinutes: effectiveAutomationCadenceMinutes(schedule),
        scheduleMode: "CALENDAR",
        scheduleDaysJson: JSON.stringify(schedule.daysOfWeek),
        scheduleLocalTime: schedule.localTime,
        scheduleTimezone: schedule.timezone,
      };
}

export function assertAutomationScheduleMinimumCadence(schedule: AutomationSchedule, minimumMinutes: number) {
  const minimum = Math.max(MIN_INTERVAL_MINUTES, Math.floor(minimumMinutes));
  if (effectiveAutomationCadenceMinutes(schedule) < minimum) {
    throw new Error("automation_schedule_minimum_cadence");
  }
  return schedule;
}

export function automationSchedulesEqual(a: AutomationSchedule, b: AutomationSchedule) {
  if (a.mode !== b.mode) return false;
  if (a.mode === "INTERVAL" && b.mode === "INTERVAL") return a.intervalMinutes === b.intervalMinutes;
  if (a.mode === "CALENDAR" && b.mode === "CALENDAR") {
    return a.localTime === b.localTime
      && a.timezone === b.timezone
      && a.daysOfWeek.length === b.daysOfWeek.length
      && a.daysOfWeek.every((day, index) => day === b.daysOfWeek[index]);
  }
  return false;
}

function weekdayForDate(date: { year: number; month: number; day: number }) {
  const jsDay = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return AUTOMATION_WEEKDAYS[(jsDay + 6) % 7];
}

export function nextAutomationScheduledAt(schedule: AutomationSchedule, after: Date) {
  if (schedule.mode === "INTERVAL") {
    if (!validIntervalMinutes(schedule.intervalMinutes)) throw new Error("automation_schedule_interval_invalid");
    return new Date(after.getTime() + schedule.intervalMinutes * 60_000).toISOString();
  }

  const local = localParts(after, schedule.timezone);
  const localDateUtc = Date.UTC(local.year, local.month - 1, local.day);
  const selected = new Set(schedule.daysOfWeek);
  for (let offsetDays = 0; offsetDays <= 8; offsetDays += 1) {
    const cursor = new Date(localDateUtc + offsetDays * 24 * 60 * 60_000);
    const date = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    };
    if (!selected.has(weekdayForDate(date))) continue;
    const candidate = resolveLocalInstant(date, schedule.localTime, schedule.timezone);
    if (candidate && candidate.getTime() > after.getTime()) return candidate.toISOString();
  }
  throw new Error("automation_schedule_next_occurrence_missing");
}

const WEEKDAY_SK: Record<AutomationWeekday, string> = {
  MON: "Po",
  TUE: "Ut",
  WED: "St",
  THU: "Št",
  FRI: "Pi",
  SAT: "So",
  SUN: "Ne",
};

const WEEKDAY_SK_LONG: Record<AutomationWeekday, string> = {
  MON: "pondelok",
  TUE: "utorok",
  WED: "stredu",
  THU: "štvrtok",
  FRI: "piatok",
  SAT: "sobotu",
  SUN: "nedeľu",
};

const INTERVAL_LABELS = new Map<number, string>([
  [360, "Každých 6 hodín"],
  [720, "Každých 12 hodín"],
  [1440, "Každý deň"],
  [2880, "Každé 2 dni"],
  [10080, "Každý týždeň"],
  [20160, "Každé 2 týždne"],
  [43200, "Každý mesiac"],
]);

export function formatAutomationScheduleSummary(schedule: AutomationSchedule) {
  if (schedule.mode === "INTERVAL") {
    return INTERVAL_LABELS.get(schedule.intervalMinutes) ?? `Každých ${schedule.intervalMinutes} minút`;
  }
  if (schedule.daysOfWeek.length === 7) return `Každý deň o ${schedule.localTime}`;
  if (schedule.daysOfWeek.length === 1) {
    return `Každý ${WEEKDAY_SK_LONG[schedule.daysOfWeek[0]]} o ${schedule.localTime}`;
  }
  return `${schedule.daysOfWeek.map((day) => WEEKDAY_SK[day]).join(", ")} o ${schedule.localTime}`;
}

export function formatAutomationNextRun(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("sk-SK", {
    timeZone: AUTOMATION_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")}. ${get("month")}. o ${get("hour")}:${get("minute")}`;
}

export function automationScheduleErrorMessage(error: unknown, fallback = "Neplatný rozvrh automatizácie.") {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/automation_schedule_(days_invalid|weekday_invalid|days_duplicate)/.test(message)) return "Vyber aspoň jeden platný deň v týždni.";
  if (/automation_schedule_time_invalid/.test(message)) return "Zadaj platný čas vo formáte HH:mm.";
  if (/automation_schedule_timezone_invalid/.test(message)) return "Podporované časové pásmo je Europe/Bratislava.";
  if (/automation_schedule_minimum_cadence/.test(message)) return "Zvolený rozvrh je pre túto automatizáciu príliš častý.";
  if (/automation_schedule_interval_invalid/.test(message)) return "Vyber platný interval plánovania.";
  if (/automation_schedule_(mode_invalid|payload_invalid)/.test(message)) return "Vyber platný spôsob plánovania.";
  return fallback;
}
