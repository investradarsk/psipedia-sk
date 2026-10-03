import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { HelpPage } from "@/components/help-page";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref, isHelpCategory } from "@/lib/help";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getHelpCategory(slug);
  return category ? buildPageMetadata({
    title: `${category.label} – Pomoc psom`,
    description: category.description,
    path: `/pomoc-psom/${category.slug}`,
  }) : {};
}

export default async function HelpCategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  if (!isHelpCategory(category)) notFound();
  if (category === "stratene-a-najdene") redirect("/pomoc-psom/stratene-psy");
  const definition = getHelpCategory(category);
  if (!definition) notFound();
  const [items, rawSearchParams] = await Promise.all([getPublishedHelpCases(category), searchParams]);
  const initialQuery = scalar(rawSearchParams.q).trim().slice(0, 120);
  const initialActiveOnly = scalar(rawSearchParams.stav) !== "vsetky";
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
  return <><StructuredData value={schema} /><HelpPage items={items} initialCategory={category} initialQuery={initialQuery} initialActiveOnly={initialActiveOnly} /></>;
}
