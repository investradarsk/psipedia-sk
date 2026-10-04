import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory-page";
import { StructuredData } from "@/components/structured-data";
import { directoryCategories, directoryCategoryListingMetadata, getDirectoryCategory } from "@/lib/directory";
import { getDirectoryCategoryCounts, listPublishedDirectoryProfiles, parseDirectoryFilters } from "@/lib/directory-store";
import { buildCollectionPageJsonLd, buildListingPageMetadata, resolveListingIndexPolicy } from "@/lib/listing-seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export function generateStaticParams() {
  return directoryCategories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = getDirectoryCategory((await params).category);
  if (!category) return {};
  const rawSearchParams = await searchParams;
  const policy = resolveListingIndexPolicy(`/adresar/${category.slug}`, rawSearchParams, { indexPagination: true });
  const listingMetadata = directoryCategoryListingMetadata(category, policy.page);
  return buildListingPageMetadata({
    title: listingMetadata.title,
    description: listingMetadata.description,
    path: `/adresar/${category.slug}`,
    searchParams: rawSearchParams,
    indexPagination: true,
  });
}

export default async function DirectoryCategoryPage({ params, searchParams }: Props) {
  const category = getDirectoryCategory((await params).category);
  if (!category) notFound();
  const rawSearchParams = await searchParams;
  const filters = parseDirectoryFilters(rawSearchParams);
  const [result, categoryCounts] = await Promise.all([
    listPublishedDirectoryProfiles({ category: category.slug, filters }),
    getDirectoryCategoryCounts(),
  ]);
  const policy = resolveListingIndexPolicy(`/adresar/${category.slug}`, rawSearchParams, { indexPagination: true });
  const schema = policy.kind === "query" ? null : buildCollectionPageJsonLd({
    name: category.heroTitle,
    description: category.intro,
    path: policy.canonicalPath,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Služby pre psov", path: "/adresar" },
      { name: category.label, path: `/adresar/${category.slug}` },
    ],
    items: result.profiles.map((profile) => ({
      name: profile.name,
      path: `/adresar/${profile.category}/${profile.slug}`,
    })),
  });
  return <>{schema && <StructuredData value={schema} />}<DirectoryPage result={result} filters={filters} categoryCounts={categoryCounts} initialCategory={category.slug} /></>;
}
