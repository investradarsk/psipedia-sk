import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";
import { getDirectoryCategoryCounts, listPublishedDirectoryProfiles, parseDirectoryFilters } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Služby pre psov",
  description: "Veterinári, tréneri, psie školy, kluby a ďalšie služby pre psov na Slovensku.",
  path: "/adresar",
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DirectoryHomePage({ searchParams }: Props) {
  const filters = parseDirectoryFilters(await searchParams);
  const hasSearch = Boolean(filters.query || filters.category || filters.region || filters.district || filters.city || filters.service || filters.breed || filters.fciGroup || filters.organization || filters.profileType);
  const [result, categoryCounts] = await Promise.all([
    hasSearch ? listPublishedDirectoryProfiles({ filters }) : Promise.resolve({
      profiles: [], total: 0, page: 1, pageSize: 24, totalPages: 1,
      options: { regions: [], districts: [], cities: [], services: [], breeds: [], fciGroups: [], organizations: [], profileTypes: [] },
    }),
    getDirectoryCategoryCounts(),
  ]);
  return <DirectoryPage result={result} filters={filters} categoryCounts={categoryCounts} showResults={hasSearch} />;
}
