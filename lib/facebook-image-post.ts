/** Scheduling is data only. This module has no publishing or provider integration. */
export const FACEBOOK_IMAGE_TIME_ZONE = "Europe/Bratislava";
export type FacebookImageStatus = "draft" | "scheduled" | "published";
export type FacebookImagePost = {
  id: string; title: string; imageUrl: string; imageKey: string; caption: string;
  scheduledAt: string | null; status: FacebookImageStatus; version: number;
  createdAt: string; updatedAt: string;
};
const wallFormat = new Intl.DateTimeFormat("en-CA", { timeZone: FACEBOOK_IMAGE_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function facebookWallTime(instant: string) {
  const parts = Object.fromEntries(wallFormat.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${parts.year.padStart(4,"0")}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function facebookScheduleInstant(date: string, time: string, repeatedHour?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Vyplň platný dátum aj čas.");
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(naive)) throw new Error("Neplatný dátum alebo čas.");
  const matches: string[] = [];
  for (let minutes = -180; minutes <= 180; minutes += 15) {
    const iso = new Date(naive + minutes * 60000).toISOString();
    const wall = facebookWallTime(iso);
    if (wall.date === date && wall.time === time) matches.push(iso);
  }
  if (!matches.length) throw new Error("Tento čas v Europe/Bratislava neexistuje (zmena letného času alebo neplatný dátum).");
  if (matches.length > 1 && repeatedHour !== "earlier" && repeatedHour !== "later") throw new Error("Čas sa pri zmene zimného času opakuje. Vyber prvý alebo druhý výskyt.");
  return repeatedHour === "later" ? matches[matches.length - 1] : matches[0];
}
export type FacebookImageInput = { title: string; imageUrl: string; imageKey: string; caption: string; scheduledAt: string | null; status: "draft" | "scheduled" };
export function normalizeFacebookImageInput(input: unknown): FacebookImageInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Neplatný príspevok.");
  const row = input as Record<string, unknown>;
  const allowed = new Set(["title","imageUrl","imageKey","caption","date","time","repeatedHour","status","expectedVersion"]);
  if (Object.keys(row).some(key => !allowed.has(key))) throw new Error("Príspevok obsahuje nespravované polia.");
  function text(key: string, limit: number) {
    const value = row[key] ?? "";
    if (typeof value !== "string" || value.length > limit) throw new Error(`Neplatné pole ${key}.`);
    return value.trim();
  }
  const title = text("title",200), imageUrl = text("imageUrl",500), imageKey = text("imageKey",400), caption = text("caption",15000);
  if (!title) throw new Error("Vyplň interný názov.");
  if (row.status !== "draft" && row.status !== "scheduled") throw new Error("Povoľujeme iba koncept alebo naplánovanie.");
  if ((imageKey || imageUrl) && (!/^facebook-images\/\d{4}\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(imageKey) || imageUrl !== `/media/${imageKey}`)) throw new Error("Použi obrázok nahratý v tomto module.");
  const date = text("date",10), time = text("time",5);
  if (!date && time) throw new Error("Doplň dátum alebo vymaž čas.");
  const scheduledAt = date ? facebookScheduleInstant(date,time,text("repeatedHour",7)) : null;
  if (row.status === "scheduled" && (!scheduledAt || !imageKey)) throw new Error("Naplánovanie vyžaduje obrázok, dátum a čas.");
  return {title,imageUrl,imageKey,caption,scheduledAt,status:row.status};
}
export function facebookPostsForDay(items: FacebookImagePost[], date: string) {
  return items.filter(item => item.scheduledAt && facebookWallTime(item.scheduledAt).date === date);
}
