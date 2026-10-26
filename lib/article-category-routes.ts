import type { Article } from "@/lib/content";

/** The editorial category is cross-sectional; a destination must not silently hide its articles. */
const categorySlugs: Record<Article["category"], string> = {
  Výcvik: "vycvik",
  Zdravie: "zdravie",
  Výživa: "vyziva",
  "Život so psom": "zivot-so-psom",
};

const categoryDestinations: Record<Article["category"], string> = {
  Výcvik: "/clanky?tema=vycvik",
  Zdravie: "/starostlivost/zdravie",
  Výživa: "/starostlivost/vyziva",
  "Život so psom": "/clanky?tema=zivot-so-psom",
};

export function articleCategorySlug(category: Article["category"]) {
  return categorySlugs[category];
}

export function articleCategoryHref(category: Article["category"]) {
  return categoryDestinations[category];
}

export function legacyTopicRedirectHref(slug: string): string | null {
  const category = (Object.keys(categorySlugs) as Array<Article["category"]>)
    .find((item) => categorySlugs[item] === slug);
  return category ? categoryDestinations[category] : null;
}
