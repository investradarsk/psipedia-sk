import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";
import { StructuredData } from "@/components/structured-data";
import { directoryCategories, directoryCategoryHref } from "@/lib/directory";
import {
  getDirectoryCategoryCounts,
  getDirectoryCategoryPreviews,
  listPublishedDirectoryProfiles,
  parseDirectoryFilters,
} from "@/lib/directory-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";

const directoryDescription = "Veterinári, tréneri, psie školy, kluby a ďalšie služby pre psov na Slovensku.";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: "Služby pre psov",
    description: directoryDescription,
    path: "/adresar",
    searchParams: await searchParams,
  });
}

export default async function DirectoryHomePage({ searchParams }: Props) {
  const rawSearchParams = await searchParams;
  const filters = parseDirectoryFilters(rawSearchParams);
  const policy = resolveListingIndexPolicy("/adresar", rawSearchParams);
  const hasSearch = Boolean(
    filters.query || filters.category || filters.region || filters.district || filters.city ||
    filters.service || filters.breed || filters.fciGroup || filters.organization || filters.profileType,
  );
  const [result, categoryCounts, categoryPreviews] = await Promise.all([
    hasSearch ? listPublishedDirectoryProfiles({ filters }) : Promise.resolve({
      profiles: [], total: 0, page: 1, pageSize: 24, totalPages: 1,
      options: { regions: [], districts: [], cities: [], services: [], breeds: [], fciGroups: [], organizations: [], profileTypes: [] },
    }),
    getDirectoryCategoryCounts(),
    hasSearch ? Promise.resolve({}) : getDirectoryCategoryPreviews(3),
  ]);
  const schema = policy.kind === "clean" ? buildCollectionPageJsonLd({
    name: "Služby pre psov",
    description: directoryDescription,
    path: "/adresar",
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Služby pre psov", path: "/adresar" },
    ],
    items: directoryCategories.map((category) => ({
      name: category.label,
      path: directoryCategoryHref(category),
    })),
  }) : null;

  return (
    <>
      {schema && <StructuredData value={schema} />}
      <DirectoryPage
        result={result}
        filters={filters}
        categoryCounts={categoryCounts}
        categoryPreviews={categoryPreviews}
        showResults={hasSearch}
      />
    </>
  );
}
