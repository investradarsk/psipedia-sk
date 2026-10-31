import type { PortalSearchItem } from "./portal-search";

/** Lightweight, public-only autocomplete projection of the canonical portal search. */
export type PublicSearchSuggestion = Pick<PortalSearchItem, "href" | "title" | "type" | "description"> & {
  city?: string;
  category?: string;
};

export type PublicSearchSuggestionGroup = {
  id: "breeds" | "articles" | "services" | "events" | "help" | "sections";
  label: string;
  items: PublicSearchSuggestion[];
};

const GROUPS = [
  { id: "breeds", label: "Plemená", kinds: ["breed"] },
  { id: "articles", label: "Články a novinky", kinds: ["article"] },
  { id: "services", label: "Služby a odborníci", kinds: ["directory"] },
  { id: "events", label: "Podujatia", kinds: ["event"] },
  { id: "help", label: "Pomoc psom", kinds: ["adoption", "organization", "lost-found", "help"] },
  { id: "sections", label: "Sekcie Psipedie", kinds: ["section"] },
] as const;

/** Preserve canonical relevance inside each category; never leak unpublished records. */
export function groupPortalSearchSuggestions(
  items: PortalSearchItem[],
  maxPerGroup = 4,
  maxTotal = 16,
): PublicSearchSuggestionGroup[] {
  const remaining = Math.max(0, Math.trunc(maxTotal));
  const perGroup = Math.max(0, Math.trunc(maxPerGroup));
  let total = 0;
  return GROUPS.flatMap((group) => {
    if (total >= remaining) return [];
    const suggestions = items
      .filter((item) => group.kinds.some((kind) => kind === item.kind))
      .filter((item) => /^\/(?!\/)/.test(item.href) && Boolean(item.title.trim()))
      .slice(0, Math.min(perGroup, remaining - total))
      .map((item) => ({
        href: item.href,
        title: item.title.trim(),
        type: item.type,
        description: item.description?.trim().slice(0, 150) ?? "",
        city: item.city || undefined,
        category: item.category || undefined,
      }));
    total += suggestions.length;
    return suggestions.length
      ? [{ id: group.id, label: group.label, items: suggestions }]
      : [];
  });
}
