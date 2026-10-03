import type { Metadata } from "next";
import {
  absoluteUrl,
  buildPageMetadata,
  INDEXABLE_ROBOTS,
  NOINDEX_FOLLOW_ROBOTS,
} from "./seo.ts";

export type ListingSchemaItem = {
  name: string;
  path: string;
};

export type ListingBreadcrumb = {
  name: string;
  path: string;
};

export type ListingSearchParams = Record<string, string | string[] | undefined>;

export type ListingIndexPolicy = {
  kind: "clean" | "pagination" | "query";
  index: boolean;
  follow: true;
  canonicalPath: string;
  page: number | null;
};

export type CoreLandingSeoKey = "directory" | "events" | "help" | "breeds";

const coreLandingSeo = {
  directory: {
    title: "Služby pre psov – adresár Slovensko",
    description: "Nájdite veterinárov, trénerov, psie salóny, hotely, opatrovanie, kluby a ďalšie služby pre psov podľa lokality.",
  },
  events: {
    title: "Podujatia pre psov na Slovensku",
    description: "Kalendár výstav, pretekov, skúšok, tréningov, seminárov a stretnutí so psami na Slovensku.",
  },
  help: {
    title: "Pomoc psom – adopcie a stratené psy",
    description: "Adopcie, stratené a nájdené psy, útulky, dočasná opatera, zbierky a ďalšie možnosti pomoci psom na Slovensku.",
  },
  breeds: {
    title: "Plemená psov – atlas a informácie",
    description: "Atlas plemien psov podľa FCI s informáciami o povahe, potrebách, zdraví, pohybe, výcviku a vhodnosti do rodiny.",
  },
} as const satisfies Record<CoreLandingSeoKey, { title: string; description: string }>;

export function coreLandingSeoFallback(key: CoreLandingSeoKey) {
  return coreLandingSeo[key];
}

type ListingMetadataInput = {
  title: string;
  description: string;
  path: string;
  searchParams?: ListingSearchParams;
  indexPagination?: boolean;
  paginationParam?: string;
};

function nonEmptyParamValues(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((item) => item.trim()).filter(Boolean);
}

/**
 * Listing query policy:
 * - clean landing => index/follow + self canonical;
 * - filter/search/sort/unknown query => noindex/follow + canonical to clean landing;
 * - page-only pagination can opt in to index/follow when the route exposes stable,
 *   server-rendered unique entities and crawlable previous/next links.
 */
export function resolveListingIndexPolicy(
  path: string,
  searchParams: ListingSearchParams = {},
  options: { indexPagination?: boolean; paginationParam?: string } = {},
): ListingIndexPolicy {
  const active = Object.entries(searchParams)
    .map(([key, value]) => [key, nonEmptyParamValues(value)] as const)
    .filter(([, values]) => values.length > 0);

  if (active.length === 0) {
    return { kind: "clean", index: true, follow: true, canonicalPath: path, page: null };
  }

  const paginationParam = options.paginationParam ?? "page";
  if (options.indexPagination && active.length === 1 && active[0][0] === paginationParam) {
    const values = active[0][1];
    const rawPage = values.length === 1 ? values[0] : "";
    if (/^[1-9]\d*$/.test(rawPage)) {
      const page = Number(rawPage);
      if (Number.isSafeInteger(page)) {
        if (page === 1) {
          return { kind: "clean", index: true, follow: true, canonicalPath: path, page: 1 };
        }
        return {
          kind: "pagination",
          index: true,
          follow: true,
          canonicalPath: `${path}?${encodeURIComponent(paginationParam)}=${page}`,
          page,
        };
      }
    }
  }

  return { kind: "query", index: false, follow: true, canonicalPath: path, page: null };
}

export function buildListingPageMetadata({
  title,
  description,
  path,
  searchParams = {},
  indexPagination = false,
  paginationParam = "page",
}: ListingMetadataInput): Metadata {
  const policy = resolveListingIndexPolicy(path, searchParams, { indexPagination, paginationParam });
  return buildPageMetadata({
    title,
    description,
    path,
    canonical: policy.canonicalPath,
    robots: policy.index ? INDEXABLE_ROBOTS : NOINDEX_FOLLOW_ROBOTS,
  });
}

type CollectionPageSchemaInput = {
  name: string;
  description: string;
  path: string;
  items: ListingSchemaItem[];
  breadcrumbs: ListingBreadcrumb[];
};

/** Build one non-conflicting CollectionPage graph for a public listing route. */
export function buildCollectionPageJsonLd({
  name,
  description,
  path,
  items,
  breadcrumbs,
}: CollectionPageSchemaInput) {
  const canonical = absoluteUrl(path);
  const collectionId = `${canonical}#collection`;
  const itemListId = `${canonical}#item-list`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const publicItems = items
    .filter((item) => item.name.trim() && item.path.trim())
    .map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name.trim(),
      item: absoluteUrl(item.path),
    }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": collectionId,
        url: canonical,
        name,
        description,
        inLanguage: "sk-SK",
        mainEntity: { "@id": itemListId },
        breadcrumb: { "@id": breadcrumbId },
      },
      {
        "@type": "ItemList",
        "@id": itemListId,
        numberOfItems: publicItems.length,
        itemListElement: publicItems,
      },
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: breadcrumbs.map((breadcrumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: breadcrumb.name.trim(),
          item: absoluteUrl(breadcrumb.path),
        })),
      },
    ],
  };
}
