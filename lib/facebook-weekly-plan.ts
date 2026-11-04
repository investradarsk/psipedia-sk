export const FACEBOOK_PLAN_KEYS = [
  "news",
  "breed",
  "video",
  "infographic",
  "help",
  "article",
  "service",
  "event",
] as const;

export type FacebookPlanKey = (typeof FACEBOOK_PLAN_KEYS)[number];

type PlannedSlot = { time: string; key: FacebookPlanKey };
export type DisplaySlot = PlannedSlot & { label: string };

const LABELS: Record<FacebookPlanKey, string> = {
  news: "Novinky zo sveta",
  breed: "Plemeno z Psipedie",
  video: "Video / Reel",
  infographic: "Infografika",
  help: "Adopcia / nájdený pes",
  article: "Článok",
  service: "Služba pre psov",
  event: "Podujatie",
};

const ARTICLE_TOPICS = [
  "Výcvik",
  "Šteniatka",
  "Zdravie",
  "Výcvik",
  "Šteniatka",
  "Zdravie",
  "Výcvik",
] as const;

// Repeatable weekly template. Every weekday uses all eight categories in a
// different order so no category occupies one fixed publishing time every day.
const WEEKLY_SLOTS: readonly (readonly PlannedSlot[])[] = [
  [
    { time: "08:00", key: "news" },
    { time: "09:30", key: "breed" },
    { time: "11:00", key: "service" },
    { time: "12:30", key: "infographic" },
    { time: "14:30", key: "article" },
    { time: "16:00", key: "video" },
    { time: "18:00", key: "event" },
    { time: "20:00", key: "help" },
  ],
  [
    { time: "08:30", key: "video" },
    { time: "10:00", key: "news" },
    { time: "11:30", key: "article" },
    { time: "13:00", key: "breed" },
    { time: "15:00", key: "help" },
    { time: "16:30", key: "infographic" },
    { time: "18:30", key: "service" },
    { time: "20:30", key: "event" },
  ],
  [
    { time: "08:00", key: "infographic" },
    { time: "09:30", key: "article" },
    { time: "11:00", key: "event" },
    { time: "12:30", key: "news" },
    { time: "14:30", key: "video" },
    { time: "16:00", key: "breed" },
    { time: "18:00", key: "help" },
    { time: "20:00", key: "service" },
  ],
  [
    { time: "08:30", key: "breed" },
    { time: "10:00", key: "video" },
    { time: "11:30", key: "news" },
    { time: "13:00", key: "service" },
    { time: "15:00", key: "article" },
    { time: "16:30", key: "event" },
    { time: "18:30", key: "infographic" },
    { time: "20:30", key: "help" },
  ],
  [
    { time: "08:00", key: "help" },
    { time: "09:30", key: "article" },
    { time: "11:00", key: "breed" },
    { time: "12:30", key: "news" },
    { time: "14:30", key: "infographic" },
    { time: "16:00", key: "service" },
    { time: "18:00", key: "video" },
    { time: "20:00", key: "event" },
  ],
  [
    { time: "08:30", key: "event" },
    { time: "10:00", key: "article" },
    { time: "11:30", key: "video" },
    { time: "13:00", key: "help" },
    { time: "15:00", key: "news" },
    { time: "16:30", key: "breed" },
    { time: "18:30", key: "service" },
    { time: "20:30", key: "infographic" },
  ],
  [
    { time: "08:00", key: "service" },
    { time: "09:30", key: "infographic" },
    { time: "11:00", key: "news" },
    { time: "12:30", key: "breed" },
    { time: "14:30", key: "event" },
    { time: "16:00", key: "article" },
    { time: "18:00", key: "help" },
    { time: "20:00", key: "video" },
  ],
];

export const FACEBOOK_PLAN_WEEKDAYS = [
  "Pondelok",
  "Utorok",
  "Streda",
  "Štvrtok",
  "Piatok",
  "Sobota",
  "Nedeľa",
] as const;

export function facebookPlanSlotsForDay(dayIndex: number): DisplaySlot[] {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    throw new Error("Neplatný deň v týždni.");
  }

  return WEEKLY_SLOTS[dayIndex].map((slot) => ({
    ...slot,
    label: slot.key === "article"
      ? "Článok · " + ARTICLE_TOPICS[dayIndex]
      : LABELS[slot.key],
  }));
}

export function bratislavaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

/** UTC noon ensures that adding civil dates never crosses a DST boundary. */
export function facebookPlanAddDays(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function facebookPlanWeekStart(now = new Date()): string {
  const today = bratislavaToday(now);
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  return facebookPlanAddDays(today, -((weekday + 6) % 7));
}

export function isFacebookPlanDate(value: unknown, now = new Date()): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const start = facebookPlanWeekStart(now);
  return value >= start && value <= facebookPlanAddDays(start, 13);
}

export function isFacebookPlanKey(value: unknown): value is FacebookPlanKey {
  return typeof value === "string" &&
    (FACEBOOK_PLAN_KEYS as readonly string[]).includes(value);
}
