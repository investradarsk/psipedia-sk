import type { AutomationEntityType } from "./data-automation.ts";
import type { AutomationDiscoveryRoot } from "./data-automation-discovery-store.ts";

export const automationCategoryModes = ["DIRECT_ENTITY", "FEED_SOURCE"] as const;
export type AutomationCategoryMode = (typeof automationCategoryModes)[number];

export type AutomationProductCategorySlug =
  | "veterinari"
  | "psie-sluzby"
  | "utulky-organizacie"
  | "podujatia"
  | "adopcie"
  | "docasna-opatera"
  | "stratene-najdene";

export type AutomationProductCategoryContract = {
  slug: AutomationProductCategorySlug;
  mode: AutomationCategoryMode;
  entityTypes: AutomationEntityType[];
};

export const automationProductCategoryContract: readonly AutomationProductCategoryContract[] = Object.freeze([
  { slug: "veterinari", mode: "DIRECT_ENTITY", entityTypes: ["DIRECTORY"] },
  { slug: "psie-sluzby", mode: "DIRECT_ENTITY", entityTypes: ["DIRECTORY"] },
  { slug: "utulky-organizacie", mode: "DIRECT_ENTITY", entityTypes: ["ORGANIZATION"] },
  { slug: "podujatia", mode: "FEED_SOURCE", entityTypes: ["EVENT"] },
  { slug: "adopcie", mode: "FEED_SOURCE", entityTypes: ["ADOPTION"] },
  { slug: "docasna-opatera", mode: "FEED_SOURCE", entityTypes: ["FOSTER"] },
  { slug: "stratene-najdene", mode: "FEED_SOURCE", entityTypes: ["LOST_FOUND"] },
]);

const serviceDirectoryCategories = new Set([
  "treneri",
  "kynologicke-kluby",
  "chovatelske-kluby",
  "chovatelske-stanice",
  "salony-a-sluzby",
  "hotely-a-opatrovanie",
  "vencenie",
  "fyzioterapia",
  "dalsie-sluzby",
]);

export function automationProductCategoryBySlug(value: string) {
  return automationProductCategoryContract.find((category) => category.slug === value) ?? null;
}

export function automationProductCategoryForEntity(
  entityType: AutomationEntityType,
  directoryCategory?: unknown,
): AutomationProductCategorySlug | null {
  if (entityType === "DIRECTORY") {
    const category = typeof directoryCategory === "string" ? directoryCategory.trim().toLowerCase() : "";
    if (category === "veterinari") return "veterinari";
    if (serviceDirectoryCategories.has(category)) return "psie-sluzby";
    return null;
  }
  if (entityType === "ORGANIZATION") return "utulky-organizacie";
  if (entityType === "EVENT") return "podujatia";
  if (entityType === "ADOPTION") return "adopcie";
  if (entityType === "FOSTER") return "docasna-opatera";
  if (entityType === "LOST_FOUND") return "stratene-najdene";
  return null;
}

export function automationProductCategoryForRoot(
  root: Pick<AutomationDiscoveryRoot, "entityType" | "config">,
) {
  return automationProductCategoryForEntity(root.entityType, root.config.directoryCategory);
}

export function automationProductModeForRoot(
  root: Pick<AutomationDiscoveryRoot, "entityType" | "config">,
): AutomationCategoryMode | null {
  const slug = automationProductCategoryForRoot(root);
  return slug ? automationProductCategoryBySlug(slug)?.mode ?? null : null;
}

export function automationDirectoryCategoryScope(value: unknown) {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (category === "veterinari" || serviceDirectoryCategories.has(category)) return category;
  return null;
}

export function isAutomationServiceDirectoryCategory(value: unknown) {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  return serviceDirectoryCategories.has(category);
}

export const automationServiceDirectoryCategories = Object.freeze([...serviceDirectoryCategories]);
