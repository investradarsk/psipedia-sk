import type { DirectoryCategorySlug } from "@/lib/directory";
import {
  SLOVAK_DISTRICTS_BY_REGION,
  SLOVAK_MUNICIPALITIES_BY_DISTRICT,
  SLOVAK_REGIONS,
} from "@/lib/slovakia-locations";

export const SEARCH_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE = 20;
export const SEARCH_MAX_VISIBLE_RESULTS = SEARCH_PAGE_SIZE * SEARCH_MAX_PAGE;
export const SEARCH_MAX_QUERY_LENGTH = 120;
export const SEARCH_MAX_TOKENS = 8;

export const DIRECTORY_SERVICE_SYNONYMS = {
  veterinari: [
    "veterinárna ambulancia",
    "veterinarna ambulancia",
    "veterinárna klinika",
    "veterinarna klinika",
    "veterinárne pracovisko",
    "veterinarne pracovisko",
    "veterinár",
    "veterinar",
    "veterina",
  ],
  treneri: [
    "tréner psov",
    "trener psov",
    "psí tréner",
    "psi trener",
    "cvičiteľ psov",
    "cvicitel psov",
    "psia škola",
    "psia skola",
  ],
  "kynologicke-kluby": ["kynologický klub", "kynologicky klub", "kynologické cvičisko", "kynologicke cvicisko"],
  "chovatelske-kluby": ["chovateľský klub", "chovatelsky klub", "klub chovateľov", "klub chovatelov"],
  "chovatelske-stanice": ["chovateľská stanica", "chovatelska stanica", "chovná stanica", "chovna stanica"],
  "salony-a-sluzby": ["psí salón", "psi salon", "salón pre psov", "salon pre psov", "grooming", "groomer"],
  "hotely-a-opatrovanie": ["psí hotel", "psi hotel", "hotel pre psov", "opatrovanie psov", "opatrovanie psa"],
  vencenie: ["venčenie psov", "vencenie psov", "venčenie psa", "vencenie psa", "venčenie", "vencenie"],
  fyzioterapia: ["psia fyzioterapia", "fyzioterapia psov", "fyzioterapia psa", "rehabilitácia psov", "rehabilitacia psov"],
  "dalsie-sluzby": ["služby pre psov", "sluzby pre psov"],
  "psie-skoly": ["psie školy", "psie skoly"],
  "utulky-a-zachrana": ["útulok pre psov", "utulok pre psov"],
} satisfies Partial<Record<DirectoryCategorySlug, readonly string[]>>;

export const EVENT_TYPE_SYNONYMS = {
  "Výstava": ["výstava psov", "vystava psov", "výstava", "vystava"],
  "Preteky": ["psie preteky", "preteky psov", "preteky"],
  "Seminár": ["seminár o psoch", "seminar o psoch", "seminár", "seminar"],
  "Tréning": ["tréning psov", "trening psov"],
} as const;

export const ENTITY_INTENT_SYNONYMS = {
  adoption: ["pes na adopciu", "psy na adopciu", "adopcia psa", "adopcia"],
  organization: ["útulok", "utulok", "organizácia pre psov", "organizacia pre psov"],
  lostFound: ["stratený pes", "strateny pes", "nájdený pes", "najdeny pes", "stratené psy", "stratene psy"],
} as const;

export type PortalSearchEntityIntent = "directory" | "event" | "adoption" | "organization" | "lost-found" | null;
export type PortalSearchLocation = {
  level: "city" | "district" | "region";
  city: string;
  district: string;
  region: string;
  matchedText: string;
};

export type ParsedPortalSearchQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
  contentTokens: string[];
  residualTokens: string[];
  directoryCategory: DirectoryCategorySlug | null;
  eventType: keyof typeof EVENT_TYPE_SYNONYMS | null;
  entityIntent: PortalSearchEntityIntent;
  location: PortalSearchLocation | null;
};

type PhraseMatch<T> = { start: number; end: number; value: T; phrase: string };

const QUERY_STOP_WORDS = new Set(["v", "vo", "na", "pri", "u", "do", "z", "zo", "pre"]);
const SPECIAL_CITY_LOCATIONS = [
  { city: "Bratislava", district: "", region: "Bratislavský kraj" },
  { city: "Košice", district: "", region: "Košický kraj" },
] as const;

export function normalizePortalSearch(value: string) {
  return value
    .toLocaleLowerCase("sk")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizePortalSearch(value: string) {
  return normalizePortalSearch(value).split(" ").filter(Boolean).slice(0, SEARCH_MAX_TOKENS);
}

function locationInflections(name: string) {
  const normalized = normalizePortalSearch(name);
  const words = normalized.split(" ");
  const last = words.at(-1) ?? "";
  const variants = new Set([normalized]);
  const replaceLast = (value: string) => variants.add([...words.slice(0, -1), value].join(" "));

  if (last.endsWith("ava")) replaceLast(`${last.slice(0, -1)}e`);
  else if (last.endsWith("ra")) replaceLast(`${last.slice(0, -1)}e`);
  else if (last.endsWith("ina")) replaceLast(`${last.slice(0, -1)}e`);
  if (last.endsWith("ov")) replaceLast(`${last}e`);
  if (last.endsWith("ec")) replaceLast(`${last.slice(0, -2)}ci`);
  if (last.endsWith("ice")) replaceLast(`${last.slice(0, -3)}iciach`);

  return [...variants];
}

const locationAliasMap = (() => {
  const map = new Map<string, Omit<PortalSearchLocation, "matchedText">>();
  const set = (alias: string, value: Omit<PortalSearchLocation, "matchedText">) => {
    const key = normalizePortalSearch(alias);
    if (!key) return;
    const previous = map.get(key);
    const priority = { region: 1, district: 2, city: 3 } as const;
    if (!previous || priority[value.level] >= priority[previous.level]) map.set(key, value);
  };

  for (const region of SLOVAK_REGIONS) {
    set(region, { level: "region", city: "", district: "", region });
    set(region.replace(/ kraj$/, ""), { level: "region", city: "", district: "", region });
  }
  for (const [region, districts] of Object.entries(SLOVAK_DISTRICTS_BY_REGION)) {
    for (const district of districts) {
      set(district, { level: "district", city: "", district, region });
      for (const city of SLOVAK_MUNICIPALITIES_BY_DISTRICT[district] ?? []) {
        for (const alias of locationInflections(city)) set(alias, { level: "city", city, district, region });
      }
    }
  }
  for (const item of SPECIAL_CITY_LOCATIONS) {
    for (const alias of locationInflections(item.city)) set(alias, { level: "city", ...item });
  }
  return map;
})();

const MAX_LOCATION_WORDS = Math.max(...[...locationAliasMap.keys()].map((value) => value.split(" ").length), 1);

function phraseMap<T>(entries: Array<[string, T]>) {
  return new Map(entries.map(([phrase, value]) => [normalizePortalSearch(phrase), value] as const));
}

const directorySynonymMap = phraseMap(
  Object.entries(DIRECTORY_SERVICE_SYNONYMS).flatMap(([category, synonyms]) =>
    synonyms.map((synonym) => [synonym, category as DirectoryCategorySlug] as [string, DirectoryCategorySlug]),
  ),
);
const eventSynonymMap = phraseMap(
  Object.entries(EVENT_TYPE_SYNONYMS).flatMap(([eventType, synonyms]) =>
    synonyms.map((synonym) => [synonym, eventType as keyof typeof EVENT_TYPE_SYNONYMS] as [string, keyof typeof EVENT_TYPE_SYNONYMS]),
  ),
);
const entitySynonymMap = phraseMap<Exclude<PortalSearchEntityIntent, "directory" | "event" | null>>(
  Object.entries(ENTITY_INTENT_SYNONYMS).flatMap(([intent, synonyms]) => {
    const value = intent === "lostFound" ? "lost-found" : intent;
    return synonyms.map((synonym) => [synonym, value as Exclude<PortalSearchEntityIntent, "directory" | "event" | null>]);
  }),
);

function findPhrase<T>(tokens: string[], aliases: Map<string, T>, maxWords = 5): PhraseMatch<T> | null {
  const max = Math.min(maxWords, tokens.length);
  for (let size = max; size >= 1; size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const phrase = tokens.slice(start, start + size).join(" ");
      const value = aliases.get(phrase);
      if (value !== undefined) return { start, end: start + size, value, phrase };
    }
  }
  return null;
}

function findLocation(tokens: string[]): PhraseMatch<PortalSearchLocation> | null {
  const found = findPhrase(tokens, locationAliasMap, MAX_LOCATION_WORDS);
  if (!found) return null;
  return {
    ...found,
    value: { ...found.value, matchedText: found.phrase },
  };
}

function indexesFor(...matches: Array<PhraseMatch<unknown> | null>) {
  const used = new Set<number>();
  for (const match of matches) {
    if (!match) continue;
    for (let index = match.start; index < match.end; index += 1) used.add(index);
  }
  return used;
}

function canonicalIntentToken(parsed: {
  directoryCategory: DirectoryCategorySlug | null;
  eventType: keyof typeof EVENT_TYPE_SYNONYMS | null;
  entityIntent: PortalSearchEntityIntent;
}) {
  if (parsed.directoryCategory === "veterinari") return "veterinar";
  if (parsed.directoryCategory === "treneri") return "trener";
  if (parsed.directoryCategory === "hotely-a-opatrovanie") return "hotel";
  if (parsed.directoryCategory === "fyzioterapia") return "fyzioterapia";
  if (parsed.directoryCategory) return normalizePortalSearch(parsed.directoryCategory.replace(/-/g, " "));
  if (parsed.eventType) return normalizePortalSearch(parsed.eventType);
  if (parsed.entityIntent === "adoption") return "adopcia";
  if (parsed.entityIntent === "organization") return "utulok";
  if (parsed.entityIntent === "lost-found") return "pes";
  return "";
}

export function parsePortalSearchQuery(value: string): ParsedPortalSearchQuery {
  const raw = value.trim().slice(0, SEARCH_MAX_QUERY_LENGTH);
  const normalized = normalizePortalSearch(raw);
  const tokens = normalized.split(" ").filter(Boolean).slice(0, SEARCH_MAX_TOKENS);
  const directory = findPhrase(tokens, directorySynonymMap, 4);
  const event = directory ? null : findPhrase(tokens, eventSynonymMap, 4);
  const entity = directory || event ? null : findPhrase(tokens, entitySynonymMap, 4);
  const location = findLocation(tokens);
  const used = indexesFor(directory, event, entity, location);
  const residualTokens = tokens.filter((token, index) => !used.has(index) && !QUERY_STOP_WORDS.has(token));
  const directoryCategory = directory?.value ?? null;
  const eventType = event?.value ?? null;
  const entityIntent: PortalSearchEntityIntent = directory ? "directory" : event ? "event" : entity?.value ?? null;
  const intentToken = canonicalIntentToken({ directoryCategory, eventType, entityIntent });
  const contentTokens = [...new Set([intentToken, ...residualTokens].filter(Boolean))].slice(0, SEARCH_MAX_TOKENS);
  const canonicalLocationToken = location
    ? normalizePortalSearch(location.value.city || location.value.district || location.value.region.replace(/ kraj$/, ""))
    : "";
  const fallbackTokens = canonicalLocationToken
    ? [canonicalLocationToken]
    : tokens.filter((token) => !QUERY_STOP_WORDS.has(token));

  return {
    raw,
    normalized,
    tokens,
    contentTokens: contentTokens.length ? contentTokens : fallbackTokens,
    residualTokens,
    directoryCategory,
    eventType,
    entityIntent,
    location: location?.value ?? null,
  };
}

export type PortalSearchRankable = {
  title: string;
  kind: "section" | "breed" | "article" | "event" | "directory" | "organization" | "adoption" | "help" | "lost-found";
  category?: string;
  city?: string;
  district?: string;
  region?: string;
  services?: string;
  haystack?: string;
};

function normalizedLocationMatches(actual: string | undefined, expected: string) {
  if (!actual || !expected) return false;
  const left = normalizePortalSearch(actual);
  const right = normalizePortalSearch(expected);
  return left === right || (right === "bratislava" && left.startsWith("bratislava ")) || (right === "kosice" && left.startsWith("kosice "));
}

export function scorePortalSearchItem(item: PortalSearchRankable, parsed: ParsedPortalSearchQuery) {
  const title = normalizePortalSearch(item.title);
  if (title === parsed.normalized) return 0;

  if (item.kind === "directory" && parsed.directoryCategory && item.category === parsed.directoryCategory) {
    if (parsed.location?.level === "city" && normalizedLocationMatches(item.city, parsed.location.city)) return 10;
    if (parsed.location?.district && normalizedLocationMatches(item.district, parsed.location.district)) return 20;
    if (parsed.location?.region && normalizedLocationMatches(item.region, parsed.location.region)) return 20;
  }

  if (item.kind === "event" && parsed.eventType && item.category === parsed.eventType) {
    if (parsed.location?.level === "city" && normalizedLocationMatches(item.city, parsed.location.city)) return 10;
    if (parsed.location?.region && normalizedLocationMatches(item.region, parsed.location.region)) return 20;
  }

  if (title.startsWith(parsed.normalized)) return 30;

  const services = normalizePortalSearch(item.services ?? "");
  if (item.kind === "directory" && parsed.residualTokens.length && parsed.residualTokens.every((token) => services.includes(token))) return 40;

  const intentMatches =
    (parsed.entityIntent === "directory" && item.kind === "directory")
    || (parsed.entityIntent === "event" && item.kind === "event")
    || (parsed.entityIntent === "adoption" && item.kind === "adoption")
    || (parsed.entityIntent === "organization" && item.kind === "organization")
    || (parsed.entityIntent === "lost-found" && item.kind === "lost-found");
  if (intentMatches) return 50;

  const haystack = normalizePortalSearch(`${item.title} ${item.haystack ?? ""}`);
  const tokens = parsed.contentTokens.length ? parsed.contentTokens : parsed.tokens;
  if (tokens.length && tokens.every((token) => haystack.includes(token))) return 70;
  return 999;
}

export function stablePortalSearchSort<T extends { score: number; title: string; href: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    a.score - b.score
    || a.title.localeCompare(b.title, "sk")
    || a.href.localeCompare(b.href),
  );
}
