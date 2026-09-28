import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref, isHelpCategory } from "@/lib/help";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
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
  if (category === "stratene-a-najdene") redirect("/pomoc-psom/stratene-psy");
  const definition = getHelpCategory(category);
  if (!definition) notFound();
  const items = await getPublishedHelpCases(category);
  const schema = buildCollectionPageJsonLd({
    name: definition.label,
    description: definition.description,
    path: `/pomoc-psom/${definition.slug}`,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: "Pomoc psom", path: "/pomoc-psom" },
      { name: definition.label, path: `/pomoc-psom/${definition.slug}` },
    ],
    items: items.slice(0, 50).map((item) => ({ name: item.title, path: helpCaseHref(item) })),
  });
  return <><StructuredData value={schema} /><HelpPage items={items} initialCategory={category} /></>;
}
