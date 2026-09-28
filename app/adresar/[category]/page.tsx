import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory-page";
import { StructuredData } from "@/components/structured-data";
import { directoryCategories, getDirectoryCategory } from "@/lib/directory";
import { getDirectoryCategoryCounts, listPublishedDirectoryProfiles, parseDirectoryFilters } from "@/lib/directory-store";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
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
  const rawSearchParams = await searchParams;
  const filters = parseDirectoryFilters(rawSearchParams);
  const [result, categoryCounts] = await Promise.all([
    listPublishedDirectoryProfiles({ category: category.slug, filters }),
    getDirectoryCategoryCounts(),
  ]);
  const hasQuery = Object.values(rawSearchParams).some((value) => Array.isArray(value) ? value.some(Boolean) : Boolean(value));
  const schema = hasQuery ? null : buildCollectionPageJsonLd({
    name: category.label,
    description: category.description,
    path: `/adresar/${category.slug}`,
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
