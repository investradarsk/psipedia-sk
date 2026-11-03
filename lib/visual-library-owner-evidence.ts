import type { VisualBanner } from "@/lib/visual-library-banners";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";

/**
 * Only map manually established renderers to their source-canonical family.
 * A shared CSS class or a matching word is never enough evidence.
 */
export const OWNER_EXAMPLE_GROUPS: Readonly<Record<string, {
  root: string;
  path: string;
  family: "hero" | "cta" | "card";
}>> = {
  "hero:plemena": { root: "unified-section-hero", path: "components/public-visual-system/unified-section-hero.tsx", family: "hero" },
  "hero:clanky": { root: "unified-section-hero", path: "components/public-visual-system/unified-section-hero.tsx", family: "hero" },
  "cta:directory-map": { root: "actions", path: "components/public-visual-system/public-visual-system.tsx", family: "cta" },
  "cta:help-organizations": { root: "actions", path: "components/public-visual-system/public-visual-system.tsx", family: "cta" },
  "card:article-list": { root: "article-list-wrapper", path: "components/article-list-item.tsx", family: "card" },
};

/** Every mapped case is backed by an explicit component use in the public source. */
export function ownerGroupForBanner(banner: Pick<VisualBanner, "id">): string | null {
  if (banner.id.startsWith("clanky:") ||
      banner.id === "homepage:profil" ||
      banner.id === "plemena:kluby") return "magazine";
  if (banner.id === "help:lost-found" || banner.id.startsWith("help:overview:")) return "rescue";
  if (banner.id === "help:closing") return "closing";
  return null;
}

export type OwnerKnownUse = {
  url: string;
  label: string;
  placement: string;
  anchorId?: string;
  evidence: "verified-in-code" | "published-manual" | "published-auto-today";
};

/**
 * The returned URL is a concrete URL from a documented component placement or
 * published-article scan; no /[slug] URL is inferred.
 * "verified-in-code" means reviewed source, not screenshot/DOM confirmation.
 */
export function ownerKnownUsesForGroup(
  groupId: string,
  banners: readonly VisualBanner[],
  examples: readonly VisualLibraryExample[],
  articleUsage: ArticleBannerUsageResult,
): { uses: OwnerKnownUse[]; matchingLabels: string[] } {
  const uses: OwnerKnownUse[] = [];
  const matchingLabels: string[] = [];
  for (const banner of banners) {
    if (ownerGroupForBanner(banner) !== groupId) continue;
    matchingLabels.push(banner.label, banner.title, banner.ctaHref);
    uses.push(...banner.uses);
    if (banner.id.startsWith("clanky:") && articleUsage.status !== "unavailable") {
      uses.push(...(articleUsage.byKey[banner.id.slice(7)] ?? []));
    }
  }
  for (const example of examples) {
    if ((OWNER_EXAMPLE_GROUPS[example.id]?.root ?? "example:" + example.id) !== groupId) continue;
    matchingLabels.push(example.label, example.explanation);
    uses.push(...example.uses.map((use) => ({
      url: use.url,
      label: use.label,
      placement: use.placement,
      anchorId: use.anchorId,
      evidence: "verified-in-code" as const,
    })));
  }
  const seen = new Set<string>();
  const unique = uses.filter((use) => {
    const key = [use.url, use.anchorId || "", use.placement].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { uses: unique, matchingLabels };
}
