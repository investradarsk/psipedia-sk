/**
 * Tavily query text and eligibility for missing-data research.
 * Pure helpers: no external AI, no new Tavily calls, no changes to result matching.
 */
export type QualityResearchKind =
  "DIRECTORY" | "EVENT" | "ORGANIZATION" | "ADOPTION" | "FOSTER" | "HELP_ITEM" | "LOST_FOUND";

export type QualityResearchField = { group: string; key: string };
export type QualityResearchProfile = {
  kind: QualityResearchKind;
  label: string;
  row: Record<string, unknown>;
  missing: readonly QualityResearchField[];
};

function nonempty(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 110) : "";
}

function quoted(value: string): string {
  return '"' + value.replace(/["“”]/g, " ").trim() + '"';
}

export function qualityTodayInSlovakia(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** False means the profile/case is no longer suitable for a paid Tavily lookup. */
export function qualityMayResearch(kind: QualityResearchKind, row: Record<string, unknown>, today: string): boolean {
  const status = nonempty(row.status).toUpperCase();
  if (kind === "EVENT") {
    if (row.cancelled === true || Number(row.cancelled) === 1) return false;
    const start = nonempty(row.start_date);
    const end = nonempty(row.end_date);
    const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start;
    return !/^\d{4}-\d{2}-\d{2}$/.test(lastDay) || lastDay >= today;
  }
  if (kind === "ADOPTION") return !["RESERVED", "ADOPTED", "ARCHIVED"].includes(status);
  if (kind === "ORGANIZATION" || kind === "DIRECTORY") return status !== "ARCHIVED";
  if (kind === "FOSTER" || kind === "HELP_ITEM")
    return row.resolved !== true && Number(row.resolved ?? 0) !== 1;
  if (kind === "LOST_FOUND") {
    if (["RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"].includes(status)) return false;
    const expiry = nonempty(row.expires_at);
    if (status === "ACTIVE" && /^\d{4}-\d{2}-\d{2}/.test(expiry) && expiry.slice(0, 10) < today)
      return false;
  }
  return true;
}

const commonGroupTerms: Record<string, string> = {
  address: "presná adresa ulica číslo miesto konania sídlo",
  web: "oficiálna webová stránka kontakt",
  phone: "kontaktný telefón telefónne číslo",
  email: "kontaktný e-mail email",
  social: "oficiálny Facebook Instagram profil",
  registration: "registrácia prihláška prihlasovanie",
  date: "čas začiatku dátum harmonogram",
  other: "organizátor IČO oficiálne údaje",
};

// When a profile is missing many different fields, keep all groups in a single
// reasonably short Tavily query rather than silently truncating the last groups.
const compactGroupTerms: Record<string, string> = {
  address: "adresa miesto",
  image: "fotografia plagát",
  web: "oficiálny web",
  phone: "telefón",
  email: "email",
  social: "Facebook Instagram",
  registration: "registrácia",
  date: "dátum čas",
  other: "organizátor IČO",
};

function pictureTerms(kind: QualityResearchKind): string {
  switch (kind) {
    case "EVENT": return "kynologické podujatie psy plagát propozície fotografia";
    case "DIRECTORY": return "fotografia prevádzky služby pre psov";
    case "ORGANIZATION": return "fotografia útulku organizácie ochrana psov";
    case "ADOPTION": return "fotografia psa adopcia útulok";
    case "LOST_FOUND": return "fotografia strateného nájdeného psa";
    default: return "fotografia psa oficiálna výzva pomoc psom";
  }
}

function context(profile: QualityResearchProfile): string[] {
  const {kind, row} = profile;
  const bits: string[] = [];
  const add = (value:unknown) => {const str=nonempty(value);if(str)bits.push(str);};
  if (kind === "EVENT") {
    add(row.organizer);
    add(row.venue);
    add(row.city);
    add(row.event_type);
    add(row.start_date);
    bits.push("kynológia psy");
  } else if (kind === "DIRECTORY") {
    add(row.city);
    add(row.category);
    add(row.category_slug);
    bits.push("služby pre psov Slovensko");
  } else if (kind === "ORGANIZATION") {
    add(row.city);
    add(row.type);
    bits.push("útulok pomoc psom Slovensko");
  } else if (kind === "ADOPTION") {
    add(row.organization_name);
    add(row.city);
    add(row.breed_name);
    bits.push("pes na adopciu");
  } else if (kind === "LOST_FOUND") {
    add(row.city);
    add(row.event_date);
    bits.push(nonempty(row.type).toUpperCase() === "FOUND" ? "nájdený pes" : "stratený pes");
  } else {
    add(row.organization);
    add(row.city);
    add(row.dog_name);
    add(row.category);
    bits.push("pomoc psom");
  }
  return bits;
}

/** One bounded context-rich search for all requested missing fields: no per-field extra calls. */
export function buildQualityTavilyQuery(profile: QualityResearchProfile): string {
  const base = quoted(nonempty(profile.label));
  const groups = [...new Set(profile.missing.map(field => field.group))];
  const manyGroups = groups.length > 3;
  const terms = groups.map(group => manyGroups ? compactGroupTerms[group]
    : group === "image" ? pictureTerms(profile.kind) : commonGroupTerms[group])
    .filter((value): value is string => Boolean(value));
  const otherFields = profile.missing.filter(f => f.group === "other").map(f => f.key);
  if(!manyGroups) {
    if (otherFields.includes("organizer")) terms.push("usporiadateľ organizátor");
    if (otherFields.includes("registrationNumber")) terms.push("IČO registračné číslo");
  }
  const termText = terms.join(" ");
  // Reserve space for every missing data type, then use the rest for stored
  // organizer/city/date context. Always keep the named record first.
  const contextLimit = Math.max(0, 450 - base.length - termText.length - 2);
  const contextText = context(profile).join(" ").slice(0, contextLimit).trim();
  return [base, contextText, termText].filter(Boolean).join(" ").slice(0, 450);
}
