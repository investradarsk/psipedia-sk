import Fuse from "fuse.js";

type SearchableConcept = {
  item: { label: string };
  draft: { name: string; city?: string | null };
};

const fold = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk-SK");

/**
 * Preserve previous accent-insensitive substring semantics. Only when no
 * literal match exists offer typo-tolerant candidates, not extra results
 * mixed into exact searches. Caller has already applied state/category filters.
 */
export function filterGeminiConcepts<T extends SearchableConcept>(entries: T[], search: string): T[] {
  const query = fold(search.trim());
  if (!query) return entries;
  const exact = entries.filter(({ item, draft }) =>
    [draft.name, draft.city ?? "", item.label].some(value => fold(value).includes(query)),
  );
  if (exact.length || query.length < 3) return exact;

  const indexed = entries.map((entry, index) => ({
    index,
    name: fold(entry.draft.name),
    city: fold(entry.draft.city ?? ""),
    category: fold(entry.item.label),
  }));
  const fuse = new Fuse(indexed, {
    keys: [{ name: "name", weight: 0.6 }, { name: "city", weight: 0.25 }, { name: "category", weight: 0.15 }],
    threshold: 0.28,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });
  return fuse.search(query, { limit: 50 }).map(({ item }) => entries[item.index]);
}
