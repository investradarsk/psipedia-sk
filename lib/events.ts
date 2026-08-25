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

export function eventHref(event: Pick<DogEvent, "slug">) {
  return `/podujatia/${event.slug}`;
}

export function formatEventDate(event: Pick<DogEvent, "startDate" | "endDate">) {
  const formatter = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const start = new Date(`${event.startDate}T12:00:00Z`);
  if (!event.endDate || event.endDate === event.startDate) return formatter.format(start);
  const end = new Date(`${event.endDate}T12:00:00Z`);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function eventIsPast(event: Pick<DogEvent, "endDate" | "startDate">, today = new Date()) {
  const lastDate = event.endDate ?? event.startDate;
  const todayIso = today.toISOString().slice(0, 10);
  return lastDate < todayIso;
}

export function eventTypeFromPortalSlug(slug: string): EventType | null {
  return ({ vystavy: "Výstava", preteky: "Preteky", seminare: "Seminár" } as Record<string, EventType>)[slug] ?? null;
}
