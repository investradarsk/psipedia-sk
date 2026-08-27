import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory-page";
import { directoryCategories, getDirectoryCategory } from "@/lib/directory";
import { getDirectoryCategoryCounts, listPublishedDirectoryProfiles, parseDirectoryFilters } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

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
  const filters = parseDirectoryFilters(await searchParams);
  const [result, categoryCounts] = await Promise.all([
    listPublishedDirectoryProfiles({ category: category.slug, filters }),
    getDirectoryCategoryCounts(),
  ]);
  return <DirectoryPage result={result} filters={filters} categoryCounts={categoryCounts} initialCategory={category.slug} />;
}
