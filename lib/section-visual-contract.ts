import { directoryCategories, directoryCategoryHref } from "@/lib/directory";
import { eventTypeListingSeo, eventTypePortalHref, eventTypes } from "@/lib/events";
import { helpCategories, helpCategoryHref } from "@/lib/help";
import { portalSections, type PortalSection, type SectionHeroConfig } from "@/lib/portal";

export const SECTION_VISUAL_DESKTOP_ASPECT = [16, 7] as const;
export const SECTION_VISUAL_MOBILE_ASPECT = [16, 6] as const;
export const SECTION_VISUAL_RECOMMENDED_SIZE = { width: 2000, height: 900 } as const;
export const SECTION_VISUAL_MINIMUM_SIZE = { width: 1600, height: 720 } as const;
export const SECTION_VISUAL_ZOOM_MIN = 1;
export const SECTION_VISUAL_ZOOM_MAX = 3;

export type SectionVisualCrop = {
  x: number;
  y: number;
  zoom: number;
};

export type SectionVisualType = "homepage" | "section" | "subsection" | "directory" | "events" | "help" | "reviews";

export type SectionVisualDefinition = {
  visualKey: string;
  name: string;
  route: string;
  target: string;
  type: SectionVisualType;
  sectionSlug: string | null;
  subsectionSlug: string | null;
  desktopAspect: readonly [number, number];
  mobileAspect: readonly [number, number];
  recommendedSize: { width: number; height: number };
  minimumSize: { width: number; height: number };
  defaultImageUrl: string;
  defaultAltText: string;
  defaultDesktopCrop: SectionVisualCrop;
  defaultMobileCrop: SectionVisualCrop;
  hasDesktopMobileCrop: true;
};

export type StoredSectionVisual = {
  visualKey: string;
  sectionSlug: string | null;
  subsectionSlug: string | null;
  imageUrl: string;
  imageKey: string | null;
  altText: string;
  desktopCrop: SectionVisualCrop;
  mobileCrop: SectionVisualCrop;
  updatedAt?: string;
  updatedBy?: string;
};

export type ResolvedSectionVisual = StoredSectionVisual & {
  source: "custom" | "default";
  heroContent?: {
    title?: string;
    eyebrow?: string;
    intro?: string;
    config?: SectionHeroConfig;
  };
};

export type SectionVisualAdminItem = {
  definition: SectionVisualDefinition;
  visual: ResolvedSectionVisual;
};

const CENTER_CROP: SectionVisualCrop = { x: 0.5, y: 0.5, zoom: 1 };
const HOME_MOBILE_CROP: SectionVisualCrop = { x: 0.64, y: 0.5, zoom: 1 };

const SECTION_DEFAULTS: Record<string, { imageUrl: string; altText: string }> = {
  novinky: { imageUrl: "/images/hero-labrador.webp", altText: "Pes v prírode – vizuál sekcie Novinky" },
  plemena: { imageUrl: "/images/hero-labrador.webp", altText: "Labrador v prírode – vizuál atlasu plemien" },
  steniatka: { imageUrl: "/images/hero-labrador.webp", altText: "Labrador v prírode – vizuál sekcie Šteniatka" },
  starostlivost: { imageUrl: "/images/zdravie-veterinar.webp", altText: "Veterinárna starostlivosť o psa" },
  aktivity: { imageUrl: "/images/trening-pri-nohe.webp", altText: "Tréning psa pri nohe" },
  adresar: { imageUrl: "/images/hero-labrador.webp", altText: "Pes – vizuál sekcie Služby pre psov" },
  podujatia: { imageUrl: "/images/hero-labrador.webp", altText: "Pes – vizuál sekcie Podujatia" },
  "pomoc-psom": { imageUrl: "/images/hero-labrador.webp", altText: "Pes – vizuál sekcie Pomoc psom" },
  recenzie: { imageUrl: "/images/hero-labrador.webp", altText: "Pes – vizuál sekcie Recenzie a testy" },
};

const MAIN_SECTION_SLUGS = new Set([
  "novinky",
  "plemena",
  "steniatka",
  "starostlivost",
  "aktivity",
  "adresar",
  "podujatia",
  "pomoc-psom",
  "recenzie",
]);

const MANAGED_SUBSECTION_SLUGS = new Set(["steniatka", "starostlivost", "aktivity", "recenzie"]);

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSectionVisualCrop(
  crop: Partial<SectionVisualCrop> | null | undefined,
  fallback: SectionVisualCrop = CENTER_CROP,
): SectionVisualCrop {
  return {
    x: clamp(finiteOr(crop?.x, fallback.x), 0, 1),
    y: clamp(finiteOr(crop?.y, fallback.y), 0, 1),
    zoom: clamp(finiteOr(crop?.zoom, fallback.zoom), SECTION_VISUAL_ZOOM_MIN, SECTION_VISUAL_ZOOM_MAX),
  };
}

function commonDefinition(
  input: Pick<SectionVisualDefinition, "visualKey" | "name" | "route" | "target" | "type" | "sectionSlug" | "subsectionSlug">
    & Partial<Pick<SectionVisualDefinition, "defaultImageUrl" | "defaultAltText" | "defaultDesktopCrop" | "defaultMobileCrop">>,
): SectionVisualDefinition {
  const parentDefault = input.sectionSlug ? SECTION_DEFAULTS[input.sectionSlug] : null;
  return {
    ...input,
    desktopAspect: SECTION_VISUAL_DESKTOP_ASPECT,
    mobileAspect: SECTION_VISUAL_MOBILE_ASPECT,
    recommendedSize: SECTION_VISUAL_RECOMMENDED_SIZE,
    minimumSize: SECTION_VISUAL_MINIMUM_SIZE,
    defaultImageUrl: input.defaultImageUrl ?? parentDefault?.imageUrl ?? "/images/hero-labrador.webp",
    defaultAltText: input.defaultAltText ?? parentDefault?.altText ?? "Pes – vizuál Psipedia",
    defaultDesktopCrop: normalizeSectionVisualCrop(input.defaultDesktopCrop, CENTER_CROP),
    defaultMobileCrop: normalizeSectionVisualCrop(input.defaultMobileCrop, CENTER_CROP),
    hasDesktopMobileCrop: true,
  };
}

function routeForSubpage(section: PortalSection, subpage: PortalSection["subpages"][number]) {
  return subpage.href || `/${section.slug}/${subpage.slug}`;
}

export function buildSectionVisualRegistry(sections: PortalSection[] = portalSections): SectionVisualDefinition[] {
  const definitions: SectionVisualDefinition[] = [
    commonDefinition({
      visualKey: "home.hero",
      name: "Homepage — hlavný hero",
      route: "/",
      target: "Používa sa v hlavnom hero bloku homepage.",
      type: "homepage",
      sectionSlug: null,
      subsectionSlug: null,
      defaultImageUrl: "/images/hero-labrador.webp",
      defaultAltText: "Čierny labrador beží po rannej lúke",
      defaultDesktopCrop: CENTER_CROP,
      defaultMobileCrop: HOME_MOBILE_CROP,
    }),
  ];

  for (const section of sections) {
    if (!MAIN_SECTION_SLUGS.has(section.slug)) continue;
    definitions.push(commonDefinition({
      visualKey: `section.${section.slug}`,
      name: `${section.label} — hlavná sekcia`,
      route: `/${section.slug}`,
      target: `Používa sa v hornej hlavičke stránky /${section.slug}.`,
      type: "section",
      sectionSlug: section.slug,
      subsectionSlug: null,
    }));

    if (!MANAGED_SUBSECTION_SLUGS.has(section.slug)) continue;
    for (const subpage of section.subpages.filter((item) => item.visible !== false)) {
      const isReviews = section.slug === "recenzie";
      const route = routeForSubpage(section, subpage);
      definitions.push(commonDefinition({
        visualKey: isReviews ? `reviews.${subpage.slug}` : `subsection.${section.slug}.${subpage.slug}`,
        name: `${subpage.label} — ${section.label}`,
        route,
        target: `Používa sa v hornej hlavičke stránky ${route}.`,
        type: isReviews ? "reviews" : "subsection",
        sectionSlug: section.slug,
        subsectionSlug: subpage.slug,
        defaultImageUrl: subpage.imageUrl || undefined,
        defaultAltText: subpage.imageAlt || undefined,
      }));
    }
  }

  for (const category of directoryCategories) {
    const route = directoryCategoryHref(category);
    definitions.push(commonDefinition({
      visualKey: `directory.${category.slug}`,
      name: `${category.label} — Služby pre psov`,
      route,
      target: `Používa sa v hornej hlavičke stránky ${route}.`,
      type: "directory",
      sectionSlug: "adresar",
      subsectionSlug: category.slug,
    }));
  }

  const eventRoutes = new Set<string>();
  for (const eventType of eventTypes) {
    const route = eventTypePortalHref(eventType);
    if (!route || eventRoutes.has(route)) continue;
    eventRoutes.add(route);
    const slug = route.split("/").filter(Boolean).at(-1) || eventType.toLocaleLowerCase("sk-SK");
    const seo = eventTypeListingSeo(eventType);
    definitions.push(commonDefinition({
      visualKey: `events.${slug}`,
      name: `${seo.title} — Podujatia`,
      route,
      target: `Používa sa v hornej hlavičke stránky ${route}.`,
      type: "events",
      sectionSlug: "podujatia",
      subsectionSlug: slug,
    }));
  }

  for (const category of helpCategories) {
    const route = helpCategoryHref(category);
    definitions.push(commonDefinition({
      visualKey: `help.${category.slug}`,
      name: `${category.label} — Pomoc psom`,
      route,
      target: `Používa sa v hornej hlavičke stránky ${route}.`,
      type: "help",
      sectionSlug: "pomoc-psom",
      subsectionSlug: category.slug,
    }));
  }

  const unique = new Map(definitions.map((definition) => [definition.visualKey, definition]));
  return [...unique.values()];
}

export const sectionVisualRegistry = buildSectionVisualRegistry();

export function findSectionVisualDefinition(
  visualKey: string,
  registry: SectionVisualDefinition[] = sectionVisualRegistry,
) {
  return registry.find((definition) => definition.visualKey === visualKey) ?? null;
}

export function resolveSectionVisual(
  definition: SectionVisualDefinition,
  stored: StoredSectionVisual | null | undefined,
): ResolvedSectionVisual {
  if (stored?.imageUrl?.trim()) {
    return {
      ...stored,
      visualKey: definition.visualKey,
      sectionSlug: definition.sectionSlug,
      subsectionSlug: definition.subsectionSlug,
      altText: stored.altText.trim() || definition.defaultAltText,
      desktopCrop: normalizeSectionVisualCrop(stored.desktopCrop, definition.defaultDesktopCrop),
      mobileCrop: normalizeSectionVisualCrop(stored.mobileCrop, definition.defaultMobileCrop),
      source: "custom",
    };
  }

  return {
    visualKey: definition.visualKey,
    sectionSlug: definition.sectionSlug,
    subsectionSlug: definition.subsectionSlug,
    imageUrl: definition.defaultImageUrl,
    imageKey: null,
    altText: definition.defaultAltText,
    desktopCrop: { ...definition.defaultDesktopCrop },
    mobileCrop: { ...definition.defaultMobileCrop },
    source: "default",
  };
}

export function sectionVisualPositionPercent(value: number) {
  return `${(clamp(value, 0, 1) * 100).toFixed(2)}%`;
}
