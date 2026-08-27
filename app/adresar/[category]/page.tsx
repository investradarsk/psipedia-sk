import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory-page";
import { DirectoryClubResults } from "@/components/directory-club-results";
import { directoryCategories, getDirectoryCategory, kynologicalClubCategory } from "@/lib/directory";
import { getPublishedDirectoryCategoryCounts, getPublishedDirectoryProfiles, parseDirectoryClubSearchParams, searchPublishedKynologicalClubs } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export function generateStaticParams() {
  return directoryCategories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = getDirectoryCategory((await params).category);
  return category ? buildPageMetadata({
    title: `${category.label} – adresár`,
    description: category.description,
    path: `/adresar/${category.slug}`,
  }) : {};
}

export default async function DirectoryCategoryPage({ params, searchParams }: Props) {
  const category = getDirectoryCategory((await params).category);
  if (!category) notFound();
  if (category.slug === kynologicalClubCategory) {
    const current = parseDirectoryClubSearchParams(await searchParams);
    const [result, categoryCounts] = await Promise.all([
      searchPublishedKynologicalClubs(current),
      getPublishedDirectoryCategoryCounts(),
    ]);
    return <DirectoryPage profiles={[]} initialCategory={category.slug} categoryCounts={categoryCounts} results={<DirectoryClubResults current={current} result={result} />} />;
  }
  return <DirectoryPage profiles={await getPublishedDirectoryProfiles()} initialCategory={category.slug} />;
}
