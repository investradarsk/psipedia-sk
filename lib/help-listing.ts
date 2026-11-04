import { applyHelpLifecycle } from "./help-lifecycle.ts";
import type { PublicHelpCard, HelpCategorySlug } from "./help";

export const HELP_PAGE_SIZE = 12;

export function helpListingPage(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .trim();
}

export function helpListing(
  items: PublicHelpCard[],
  {
    category = "all",
    query = "",
    region = "all",
    activeOnly = true,
    page = 1,
  }: {
    category?: "all" | HelpCategorySlug;
    query?: string;
    region?: string;
    activeOnly?: boolean;
    page?: number;
  },
) {
  const needle = normalizeSearch(query);
  const filtered = items
    .map(applyHelpLifecycle)
    .filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (region === "all" || item.region === region) &&
        (!activeOnly || !item.resolved) &&
        (!needle ||
          normalizeSearch(
            [
              item.title,
              item.excerpt,
              item.organization,
              item.dogName,
              item.breed,
              item.city,
              item.region,
            ].join(" "),
          ).includes(needle)),
    );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / HELP_PAGE_SIZE));
  const currentPage = Math.min(helpListingPage(page), totalPages);
  return {
    total,
    totalPages,
    page: currentPage,
    items: filtered.slice((currentPage - 1) * HELP_PAGE_SIZE, currentPage * HELP_PAGE_SIZE),
  };
}

export function helpListingHref(
  basePath: string,
  {
    query = "",
    region = "all",
    activeOnly = true,
    page = 1,
  }: { query?: string; region?: string; activeOnly?: boolean; page?: number },
) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim().slice(0, 120));
  if (region !== "all") params.set("region", region);
  if (!activeOnly) params.set("stav", "vsetky");
  if (page > 1) params.set("page", String(page));
  return basePath + (params.size ? `?${params.toString()}` : "") + "#help-results-heading";
}
