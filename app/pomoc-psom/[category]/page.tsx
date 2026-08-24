import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, isHelpCategory } from "@/lib/help";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getHelpCategory(slug);
  return category ? buildPageMetadata({
    title: `${category.label} – Pomoc psom`,
    description: category.description,
    path: `/pomoc-psom/${category.slug}`,
  }) : {};
}

export default async function HelpCategoryPage({ params }: Props) {
  const { category } = await params;
  if (!isHelpCategory(category)) notFound();
  return <HelpPage items={await getPublishedHelpCases()} initialCategory={category} />;
}
