import { absoluteUrl } from "./seo.ts";

export type ListingSchemaItem = {
  name: string;
  path: string;
};

export type ListingBreadcrumb = {
  name: string;
  path: string;
};

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
