import {
  calendarMonthDays,
  calendarMonthLabel,
  calendarWeekdays,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "@/lib/event-calendar-view";
import {
  DOG_NAME_DAY_TIME_ZONE,
  normalizeDogNameDayName,
  type DogNameDayResolverRecord,
} from "@/lib/dog-name-days";

export { calendarMonthDays, calendarMonthLabel, calendarWeekdays, moveCalendarMonth };

/** YYYY-MM-DD is computed at the Slovak local date boundary, not via UTC day slicing. */
export function todayInBratislava(now: Date = new Date()) {
  if (Number.isNaN(now.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DOG_NAME_DAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function resolveDogNameDayCalendar(requestedMonth: string, requestedDay: string, today: string) {
  const month = resolveCalendarMonth(requestedMonth, "", today);
  const days = calendarMonthDays(month);
  const validSelection = days.some((day) => day.inMonth && day.date === requestedDay);
  const selectedDay = validSelection ? requestedDay : !requestedDay && month === today.slice(0, 7) ? today : "";
  return { month, days, selectedDay };
}

/** Record projection remains sourced from the canonical D1 table, including publication state. */
export function publishedNamesForCalendarDate(date: string, records: readonly DogNameDayResolverRecord[]) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)) return [] as string[];
  const month = date.slice(0, 7);
  if (!calendarMonthDays(month).some((day) => day.date === date && day.inMonth)) return [] as string[];
  const monthNumber = Number(date.slice(5, 7));
  const dayNumber = Number(date.slice(8, 10));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const record of records) {
    if (record.status !== "published" || record.month !== monthNumber || record.day !== dayNumber) continue;
    const name = String(record.name).trim().replace(/\s+/g, " ");
    const normalized = normalizeDogNameDayName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }
  return names;
}

export function slovakNameDayDateLabel(date: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
