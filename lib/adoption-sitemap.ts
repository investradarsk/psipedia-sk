import { adoptionIsIndexable, type AdoptionDog } from "./adoption.ts";
import { getPublicAdoptions } from "./adoption-store.ts";

export type AdoptionSitemapItem = {
  slug: string;
  updatedAt: string;
  mainImage: string | null;
};

export function filterIndexableAdoptionsForSitemap(items: AdoptionDog[], now = new Date()) {
  return [...new Map(items
    .filter((dog) => adoptionIsIndexable(dog, now))
    .map((dog) => [dog.slug, {
      slug: dog.slug,
      updatedAt: dog.updatedAt,
      mainImage: dog.mainImage,
    } satisfies AdoptionSitemapItem])).values()];
}

export async function listIndexableAdoptionsForSitemap(now = new Date()) {
  const first = await getPublicAdoptions({ page: 1 });
  const rest = first.pagination.totalPages > 1
    ? await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => getPublicAdoptions({ page: index + 2 })))
    : [];
  return filterIndexableAdoptionsForSitemap([
    ...first.items,
    ...rest.flatMap((page) => page.items),
  ], now);
}
