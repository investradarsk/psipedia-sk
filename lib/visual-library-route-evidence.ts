/**
 * The owner library may attach a placement to a static page only when an
 * existing audited catalogue supplies that exact public URL. Transitive React
 * imports and URL-pattern matches are never grounds for a "confirmed" use.
 *
 * This reports evidence from the code/data catalogue, NOT a live DOM audit.
 */
export type PinnedVisualUse = {
  url: string;
  label: string;
  placement: string;
  anchorId?: string;
};

export type PinnedVisual = {
  id: string;
  label: string;
  uses: readonly PinnedVisualUse[];
};

export type RoutePlacement = {
  id: string;
  visualLabel: string;
  category: "banner" | "hero" | "cta" | "karty";
  url: string;
  anchorId?: string;
  placement: string;
  source: "banner-catalogue" | "visual-example";
};

function staticPublicPath(route: string): boolean {
  return route.startsWith("/") && !route.startsWith("//") &&
    !route.startsWith("/admin/") && route !== "/admin" &&
    !route.includes("[") && !route.includes("?") && !route.includes("#") &&
    !route.includes("..");
}

export function collectPinnedStaticRoutePlacements(
  route: string,
  banners: readonly PinnedVisual[],
  examples: readonly (PinnedVisual & { category: "hero" | "cta" | "karty" })[],
): RoutePlacement[] {
  if (!staticPublicPath(route)) return [];
  const placements: RoutePlacement[] = [];
  const seen = new Set<string>();

  const add = (
    visual: PinnedVisual, category: RoutePlacement["category"], source: RoutePlacement["source"],
  ) => {
    for (const use of visual.uses) {
      let url: URL;
      try { url = new URL(use.url); } catch { continue; }
      // Exact host/path only; never accept arbitrary URLs, "similar" paths,
      // dynamic slug guesses or redirects masquerading as public placements.
      if (url.origin !== "https://psipedia.sk" || url.pathname !== route ||
          url.search || url.hash) continue;
      const anchor = use.anchorId && /^[A-Za-z][A-Za-z0-9_-]*$/.test(use.anchorId)
        ? use.anchorId : undefined;
      const key = [visual.id, use.url, anchor ?? "", use.placement].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      placements.push({
        id: visual.id, visualLabel: visual.label, category,
        url: use.url, anchorId: anchor, placement: use.placement, source,
      });
    }
  };

  for (const banner of banners) add(banner, "banner", "banner-catalogue");
  for (const example of examples) add(example, example.category, "visual-example");
  return placements.sort((a, b) => a.visualLabel.localeCompare(b.visualLabel, "sk") ||
    a.placement.localeCompare(b.placement, "sk"));
}
