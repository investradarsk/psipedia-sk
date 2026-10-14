/**
 * Values used by Notion are not always public URL slugs.
 * Directory and Help store canonical slugs; Events store singular EventType.
 * Keep this list in sync with eventTypeFromPortalSlug in lib/events.ts.
 *
 * Pure ESM so the independent GitHub Actions worker can import it without
 * a TypeScript transpiler or any Psipedia runtime dependency.
 */
const eventTypeBySlug = Object.freeze({
  vystavy: "Výstava",
  preteky: "Preteky",
  seminare: "Seminár",
  treningy: "Tréning",
  stretnutia: "Stretnutie",
  dalsie: "Iné",
});

export function notionCategoryValue(section, subcategory) {
  if (!/^[a-z0-9-]+$/.test(subcategory)) return null;
  if (section === "events") return eventTypeBySlug[subcategory] ?? null;
  if (section === "directory" || section === "help") return subcategory;
  return null;
}

// Explicit worker capability gate, independent of the broader admin catalog.
export function externalWorkerCategorySupported(key) {
  const [section, slug, extra] = String(key).split(".");
  if (extra || !slug) return false;
  if (section === "events") return Object.hasOwn(eventTypeBySlug, slug);
  if (section === "help") return ["docasna-opatera", "zbierky", "dobrovolnictvo"].includes(slug);
  return section === "directory" && ["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie", "fyzioterapia", "dalsie-sluzby"].includes(slug);
}
