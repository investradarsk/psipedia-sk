import { directoryCategories } from "./directory.ts";
import { eventTypes, eventPortalCategory } from "./events.ts";
import { helpCategories } from "./help.ts";

/** Canonical public taxonomies, never legacy automation source categories. */
export const geminiAutomationSections = [
  { key: "directory", label: "Služby pre psov" },
  { key: "events", label: "Podujatia" },
  { key: "help", label: "Pomoc psom" },
] as const;

export type GeminiSectionKey = (typeof geminiAutomationSections)[number]["key"];
export type GeminiCatalogItem = {
  stableKey: string;
  section: GeminiSectionKey;
  subcategory: string;
  label: string;
};

export const geminiAutomationCatalog: readonly GeminiCatalogItem[] = Object.freeze([
  ...directoryCategories.map((item) => ({
    stableKey: "directory." + item.slug,
    section: "directory" as const,
    subcategory: item.slug,
    label: item.label,
  })),
  ...eventTypes.map((item) => {
    const category = eventPortalCategory(item);
    const slug = category.href.split("/").at(-1)!;
    return {
      stableKey: "events." + slug,
      section: "events" as const,
      subcategory: slug,
      label: category.label,
    };
  }),
  ...helpCategories.map((item) => ({
    stableKey: "help." + item.slug,
    section: "help" as const,
    subcategory: item.slug,
    label: item.label,
  })),
]);

const catalogByKey = new Map(geminiAutomationCatalog.map((item) => [item.stableKey, item]));
if (catalogByKey.size !== geminiAutomationCatalog.length) {
  throw new Error("Duplicate Gemini automation stable key");
}

export function getGeminiCatalogItem(stableKey: string) {
  return catalogByKey.get(stableKey) ?? null;
}

export const geminiCadenceOptions = [
  { minutes: 360, label: "Každých 6 hodín" },
  { minutes: 720, label: "Každých 12 hodín" },
  { minutes: 1440, label: "Každý deň" },
  { minutes: 2880, label: "Každé 2 dni" },
  { minutes: 10080, label: "Každý týždeň" },
  { minutes: 20160, label: "Každé 2 týždne" },
  { minutes: 43200, label: "Každých 30 dní" },
] as const;

export const GEMINI_DEFAULT_CADENCE_MINUTES = 1440;
export const GEMINI_DEFAULT_MAX_NEW_CONCEPTS = 5;
