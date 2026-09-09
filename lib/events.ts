import type { ArticleSeo } from "@/lib/content";

export const eventTypes = ["Výstava", "Preteky", "Seminár", "Tréning", "Stretnutie", "Iné"] as const;
export type EventType = (typeof eventTypes)[number];

export const slovakRegions = [
  "Bratislavský kraj",
  "Trnavský kraj",
  "Trenčiansky kraj",
  "Nitriansky kraj",
  "Žilinský kraj",
  "Banskobystrický kraj",
  "Prešovský kraj",
  "Košický kraj",
  "Online",
] as const;
export type SlovakRegion = (typeof slovakRegions)[number];

export type EventStatus = "draft" | "published";

export type DogEvent = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  eventType: EventType;
  status: EventStatus;
  startDate: string;
  startTime: string;
  endDate: string | null;
  endTime: string | null;
  venue: string;
  city: string;
  region: SlovakRegion;
  address: string;
  organizer: string;
  description: string;
  practicalInfo: string;
  websiteUrl: string | null;
  registrationUrl: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  seo?: ArticleSeo;
};

export const eventTypeFilters = [
  { value: "Všetky", label: "Všetky" },
  ...eventTypes.map((value) => ({ value, label: value })),
];

export const EVENT_TIME_ZONE = "Europe/Bratislava";
export type EventDateStatus = "current" | "upcoming" | "past";

function validEventDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function bratislavaDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function eventDateStatus(
  event: Pick<DogEvent, "startDate" | "endDate">,
  today = bratislavaDateKey(),
): EventDateStatus {
  const startDate = validEventDate(event.startDate) ? event.startDate : today;
  const lastDate = event.endDate && validEventDate(event.endDate) ? event.endDate : startDate;
  if (lastDate < today) return "past";
  if (startDate > today) return "upcoming";
  return "current";
}

export function eventIsActive(event: Pick<DogEvent, "startDate" | "endDate">, today = bratislavaDateKey()) {
  return eventDateStatus(event, today) !== "past";
}

export function eventDateTimeIso(date: string, time?: string | null): string {
  if (!time) return date;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const zoned = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(Number(zoned.year), Number(zoned.month) - 1, Number(zoned.day), Number(zoned.hour), Number(zoned.minute));
  const offsetMinutes = Math.round((representedAsUtc - utcGuess) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${date}T${time}:00${offset}`;
}

export function eventHref(event: Pick<DogEvent, "slug">) {
  return `/podujatia/${event.slug}`;
}

export function formatEventDate(event: Pick<DogEvent, "startDate" | "endDate">) {
  const formatter = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric", timeZone: EVENT_TIME_ZONE });
  const start = new Date(`${event.startDate}T12:00:00Z`);
  if (!event.endDate || event.endDate === event.startDate) return formatter.format(start);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  return formatter.formatRange(start, end);
}

export function eventIsPast(event: Pick<DogEvent, "endDate" | "startDate">, today: Date | string = new Date()) {
  return eventDateStatus(event, typeof today === "string" ? today : bratislavaDateKey(today)) === "past";
}

const eventTypePortalSlugs: Partial<Record<EventType, string>> = {
  "Výstava": "vystavy",
  "Preteky": "preteky",
  "Seminár": "seminare",
};

export function eventTypeFromPortalSlug(slug: string): EventType | null {
  return (Object.entries(eventTypePortalSlugs).find(([, value]) => value === slug)?.[0] as EventType | undefined) ?? null;
}

export function eventTypePortalHref(eventType: EventType) {
  const slug = eventTypePortalSlugs[eventType];
  return slug ? `/podujatia/${slug}` : null;
}

export function selectRelatedEvents(
  event: DogEvent,
  candidates: DogEvent[],
  limit = 3,
  today = bratislavaDateKey(),
) {
  const active = candidates
    .filter((candidate) => candidate.slug !== event.slug && !candidate.cancelled && eventDateStatus(candidate, today) !== "past")
    .sort((left, right) => left.startDate.localeCompare(right.startDate)
      || left.startTime.localeCompare(right.startTime)
      || left.id - right.id);

  if (eventDateStatus(event, today) === "past") return active.slice(0, limit);

  const sameType = active.filter((candidate) => candidate.eventType === event.eventType);
  const otherTypes = active.filter((candidate) => candidate.eventType !== event.eventType);
  return [...sameType, ...otherTypes].slice(0, limit);
}
