import {
  FACEBOOK_PLAN_KEYS, facebookPlanAddDays, facebookPlanSlotsForDay,
  type FacebookPlanKey,
} from "@/lib/facebook-weekly-plan";

/** Stable identity lets a day hold several posts of the same category. */
export type FacebookWeeklySlot = {
  id: string;
  day: number; // Monday 0 – Sunday 6
  time: string;
  key: FacebookPlanKey;
  topic: string;
};

export const FACEBOOK_WEEKLY_TOPICS: Record<FacebookPlanKey, readonly string[]> = {
  news: ["Svetová novinka", "Slovensko", "Výskum", "Zaujímavosť"],
  breed: ["Predstavenie plemena", "FCI skupina", "Povaha", "Starostlivosť"],
  video: ["Vtipné video", "Výcvik", "Psí šport", "Zaujímavosť"],
  infographic: ["Zdravie", "Výcvik", "Šteniatka", "Reč tela", "Šport a tréning"],
  help: ["Adopcia", "Stratený pes", "Nájdený pes", "Dočasná opatera"],
  article: ["Výcvik", "Šteniatka", "Zdravie", "Novinky", "Recenzie a testy"],
  service: [
    "Veterinári", "Psie salóny", "Tréneri a psie školy", "Kynologické kluby",
    "Chovateľské kluby", "Chovateľské stanice", "Fyzioterapia",
    "Hotely a opatrovanie", "Venčenie", "Ďalšie služby",
  ],
  event: ["Výstava", "Preteky", "Seminár", "Tréning", "Skúšky", "Podujatie"],
};

const LABELS: Record<FacebookPlanKey, string> = {
  news: "Novinky zo sveta", breed: "Plemeno", video: "Video / Reel",
  infographic: "Infografika", help: "Pomoc psom", article: "Článok",
  service: "Profil", event: "Podujatie",
};

export function facebookWeeklySlotLabel(slot: FacebookWeeklySlot): string {
  return LABELS[slot.key] + (slot.topic ? " · " + slot.topic : "");
}

export function defaultFacebookWeeklyTemplate(): FacebookWeeklySlot[] {
  return Array.from({length: 7}, (_, day) =>
    facebookPlanSlotsForDay(day, facebookPlanAddDays("2026-11-02", day)).map(slot => ({
      id: "base-" + day + "-" + slot.key,
      day,
      time: slot.time,
      key: slot.key,
      topic: slot.key === "article" ? slot.label.replace(/^Článok · /, "") : "",
    })),
  ).flat();
}

export function validateFacebookWeeklyTemplate(raw: unknown): FacebookWeeklySlot[] {
  if (!Array.isArray(raw) || raw.length > 140) {
    throw new Error("Plán môže obsahovať najviac 20 príspevkov denne.");
  }
  const used = new Set<string>();
  const counts = Array<number>(7).fill(0);
  const times = Array.from({length:7},()=>new Set<string>());
  const result: FacebookWeeklySlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Neplatný riadok týždenného plánu.");
    }
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => !["id","day","time","key","topic"].includes(key))) {
      throw new Error("Nepodporované pole týždenného plánu.");
    }
    if (typeof row.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(row.id) ||
      used.has(row.id)) throw new Error("Každý príspevok musí mať vlastné jedinečné ID.");
    used.add(row.id);
    if (!Number.isInteger(row.day) || (row.day as number) < 0 || (row.day as number) > 6) {
      throw new Error("Neplatný deň v týždni.");
    }
    const day = row.day as number;
    if (++counts[day] > 20) throw new Error("V jednom dni môže byť najviac 20 príspevkov.");
    if (typeof row.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time)) {
      throw new Error("Čas musí mať formát HH:MM.");
    }
    if(times[day].has(row.time))throw new Error("Dva príspevky v jednom dni nemôžu mať rovnaký čas.");
    times[day].add(row.time);
    if (typeof row.key !== "string" || !(FACEBOOK_PLAN_KEYS as readonly string[]).includes(row.key)) {
      throw new Error("Neplatná kategória príspevku.");
    }
    if (typeof row.topic !== "string" || row.topic.length > 80 || /[\x00-\x1f\x7f]/.test(row.topic)) {
      throw new Error("Téma môže mať najviac 80 znakov bez riadiacich znakov.");
    }
    result.push({
      id: row.id, day, time: row.time, key: row.key as FacebookPlanKey, topic: row.topic.trim(),
    });
  }
  return result.sort((a,b) => a.day-b.day || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}
