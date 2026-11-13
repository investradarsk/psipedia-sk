import type { ReactNode } from "react";
import { HomePortalSearch } from "@/components/home-portal-search";
import type { ResolvedSectionVisual } from "@/lib/section-visual-contract";
import { UnifiedSectionHero, UnifiedSectionHeroShell, type UnifiedSectionHeroVariant } from "./unified-section-hero";

/**
 * One facade for static pages and data-driven details.
 * The frame, responsive geometry, overlay and search are rendered exclusively
 * by UnifiedSectionHero. Only photo and editorial copy vary by route.
 */
export function UniversalPageHero({
  title,
  intro,
  eyebrow = "Psipedia.sk",
  breadcrumbs,
  imageUrl,
  imageAlt,
  mediaSlot,
  variant = "homepage-style",
  searchAction = "/hladat",
  searchDefaultValue = "",
  searchHidden = [],
  searchScope,
  allowEmptySearch = false,
}: {
  title: ReactNode;
  intro?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string | null;
  mediaSlot?: ReactNode;
  variant?: UnifiedSectionHeroVariant;
  searchAction?: string;
  searchDefaultValue?: string;
  searchHidden?: Array<{ name: string; value: string }>;
  searchScope?: string;
  allowEmptySearch?: boolean;
}) {
  const visual: ResolvedSectionVisual = {
    visualKey: "detail.public",
    sectionSlug: null,
    subsectionSlug: null,
    imageUrl: imageUrl?.trim() || "/images/hero-labrador.webp",
    imageKey: null,
    altText: imageAlt?.trim() || "Fotografia k obsahu Psipedia.sk",
    desktopCrop: { x: 0.5, y: 0.5, zoom: 1 },
    mobileCrop: { x: 0.5, y: 0.5, zoom: 1 },
    source: "default",
  };

  return (
    <UnifiedSectionHeroShell>
      <UnifiedSectionHero
        contentSource="route"
        variant={variant}
        breadcrumbs={breadcrumbs}
        eyebrow={eyebrow}
        title={title}
        intro={intro}
        visual={visual}
        mediaSlot={mediaSlot}
        portalSearchSlot={
          <HomePortalSearch
            action={searchAction}
            defaultValue={searchDefaultValue}
            hidden={searchHidden}
            searchScope={searchScope}
            allowEmpty={allowEmptySearch}
          />
        }
      />
    </UnifiedSectionHeroShell>
  );
}
