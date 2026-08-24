import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory-page";
import { directoryCategories, getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

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

export default async function DirectoryCategoryPage({ params }: Props) {
  const category = getDirectoryCategory((await params).category);
  if (!category) notFound();
  return <DirectoryPage profiles={await getPublishedDirectoryProfiles()} initialCategory={category.slug} />;
}
