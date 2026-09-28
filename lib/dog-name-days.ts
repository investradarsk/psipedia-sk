export const DOG_NAME_DAY_TIME_ZONE = "Europe/Bratislava";

export type DogNameDayStatus = "draft" | "published" | "archived";

export type DogNameDayRecord = {
  id: number;
  month: number;
  day: number;
  name: string;
  normalizedName: string;
  status: DogNameDayStatus;
  source: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type DogNameDayResolverRecord = Pick<DogNameDayRecord, "month" | "day" | "name" | "status">;

export function normalizeDogNameDayName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("sk-SK");
}

export function isValidDogNameDayDate(month: number, day: number) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const value = new Date(Date.UTC(2000, month - 1, day, 12));
  return value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

export function dogNameDayDateParts(date: Date) {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DOG_NAME_DAY_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const monthValue = parts.find((part) => part.type === "month")?.value;
  const dayValue = parts.find((part) => part.type === "day")?.value;
  const month = monthValue ? Number.parseInt(monthValue, 10) : Number.NaN;
  const day = dayValue ? Number.parseInt(dayValue, 10) : Number.NaN;
  return isValidDogNameDayDate(month, day) ? { month, day } : null;
}

export function dogNameDayDateKey(date: Date) {
  const parts = dogNameDayDateParts(date);
  return parts ? `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}` : null;
}

export function resolveDogNameDay(date: Date = new Date(), records: readonly DogNameDayResolverRecord[] = []) {
  const parts = dogNameDayDateParts(date);
  if (!parts) return [] as string[];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const record of records) {
    if (record.status !== "published" || record.month !== parts.month || record.day !== parts.day) continue;
    const name = String(record.name).trim().replace(/\s+/g, " ");
    const normalized = normalizeDogNameDayName(name);
    if (!name || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }
  return names;
}
