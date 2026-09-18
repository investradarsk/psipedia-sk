export const DOG_NAME_DAY_TIME_ZONE = "Europe/Bratislava";

export type DogNameDayCalendar = Readonly<Record<string, readonly string[]>>;

// Canonical calendar data has not been approved yet. Keep this empty so the
// public header fails closed instead of inventing or publishing unverified names.
export const DOG_NAME_DAY_CALENDAR: DogNameDayCalendar = Object.freeze({});

export function dogNameDayDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DOG_NAME_DAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return month && day ? `${month}-${day}` : null;
}

export function resolveDogNameDay(
  date: Date = new Date(),
  calendar: DogNameDayCalendar = DOG_NAME_DAY_CALENDAR,
): string[] {
  const key = dogNameDayDateKey(date);
  if (!key) return [];
  const names = calendar[key] ?? [];
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const clean = String(name).trim();
    const normalized = clean.toLocaleLowerCase("sk-SK");
    if (!clean || seen.has(normalized)) return [];
    seen.add(normalized);
    return [clean];
  });
}
