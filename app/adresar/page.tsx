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
import { buildCollectionPageJsonLd, buildListingPageMetadata, coreLandingSeoFallback, resolveListingIndexPolicy } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";

const directoryDescription = "Veterinári, tréneri, psie školy, kluby a ďalšie služby pre psov na Slovensku.";
const directoryLandingSeo = coreLandingSeoFallback("directory");

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return buildListingPageMetadata({
    title: directoryLandingSeo.title,
    description: directoryLandingSeo.description,
    path: "/adresar",
    searchParams: await searchParams,
  });
}

export default async function DirectoryHomePage({ searchParams }: Props) {
  const rawSearchParams = await searchParams;
  const filters = parseDirectoryFilters(rawSearchParams);
  const policy = resolveListingIndexPolicy("/adresar", rawSearchParams);
  // Only the unfiltered landing loads category previews; search and category pages remain unchanged.
  const showOverview = filters.page === 1 && Object.values(filters).every(
    (value) => value === "" || value === "recommended" || value === 1,
  );
  const [result, categoryCounts, categoryPreviews] = await Promise.all([
    listPublishedDirectoryProfiles({ filters }),
    getDirectoryCategoryCounts(),
    showOverview ? getDirectoryCategoryPreviews(7) : Promise.resolve({}),
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
      />
    </>
  );
}
