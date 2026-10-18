import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";

/**
 * Owner-approved priority A for the remaining 16 Gemini categories:
 * 10 Directory + 6 Help subcategories routed through four canonical agendas.
 *
 * Non-empty Notion editorial fields win; blank Notion values never erase D1.
 * Canonical identity, moderation/publication, private contact/coordinates and
 * confirmed Google locations remain under their existing authoritative gates.
 * The six Event categories are handled independently by notion-event-priority.ts.
 */
export const GEMINI_22_PRIORITY_FLAG = "NOTION_GEMINI_22_PRIORITY_A_ENABLED";

export function gemini22PriorityEnabled(value?: string) {
  return ["true", "1"].includes((value ?? "").trim().toLowerCase());
}

function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Pure deep merge: nested Directory SEO fields also preserve nonempty values. */
export function mergeNotionFilledValues<T>(
  canonical: T,
  notion: T,
  protectedPaths: ReadonlySet<string>,
): T {
  function walk(before: unknown, after: unknown, path: string): unknown {
    if (protectedPaths.has(path) || !isPopulated(after)) return before;
    if (isPlainObject(before) && isPlainObject(after)) {
      const out: Record<string, unknown> = { ...before };
      for (const [key, value] of Object.entries(after)) {
        if (!Object.hasOwn(before, key)) continue;
        out[key] = walk(before[key], value, path ? path + "." + key : key);
      }
      return out;
    }
    return after;
  }
  return walk(canonical, notion, "") as T;
}

const OWNER_FIELDS = new Set(["Slug", "Stav", "Psipedia stav"]);
const PROTECTED_HELP_FIELDS = new Set([
  ...OWNER_FIELDS,
  "Vyriešené", "Urgentné",
  // Manual review, ownership and privacy cannot be bypassed by Gemini/Notion.
  "Latitude", "Longitude", "Presnosť lokality", "Verejný kontakt",
]);

export function mergeGeminiHelpPriority(input: {
  agenda: Exclude<BidirectionalAgendaKey, "events">;
  canonical: Record<string, ReconciliationValue>;
  notion: Record<string, ReconciliationValue>;
  confirmedGooglePlace: boolean;
}): Record<string, ReconciliationValue> {
  const protectedFields = new Set(PROTECTED_HELP_FIELDS);
  if (input.agenda === "help-cases") protectedFields.add("Kategória");
  if (input.agenda === "lost-found") {
    protectedFields.add("Typ");
    protectedFields.add("Zdroj");
  }
  if (input.agenda === "adoptions") protectedFields.add("Organizácia");
  if (input.confirmedGooglePlace) {
    for (const field of ["Adresa", "Miesto", "Mesto", "Okres", "Kraj"]) {
      protectedFields.add(field);
    }
  }
  return mergeNotionFilledValues(input.canonical, input.notion, protectedFields);
}

export function mergeGeminiDirectoryPriority<T>(input: {
  canonical: T;
  notion: T;
  confirmedGooglePlace: boolean;
}): T {
  const protectedPaths = new Set([
    "slug", "category", "status",
    "confirmedServiceLocation", "verified", "featured",
    "qualityResolutions", "qualityCheckedAt",
    "internalEmail",
    "seo.noindex",
  ]);
  if (input.confirmedGooglePlace) {
    for (const field of [
      "region", "district", "city", "address", "postalCode",
      "street", "houseNumber", "addressFormat",
    ]) protectedPaths.add(field);
  }
  return mergeNotionFilledValues(input.canonical, input.notion, protectedPaths);
}
