import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdoptionDetail } from "@/components/adoption-detail";
import { HelpDetail } from "@/components/help-detail";
import { StructuredData } from "@/components/structured-data";
import { adoptionHref, adoptionIsIndexable } from "@/lib/adoption";
import { getPublicAdoptionBySlug } from "@/lib/adoption-store";
import { getPublishedHelpCase } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { buildContentMetadata, helpSeoFallback } from "@/lib/content-seo";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const dog = await getPublicAdoptionBySlug(slug);
  if (dog) return buildPageMetadata({
    title: `${dog.name} – pes na adopciu`,
    description: dog.shortDescription || `${dog.name} hľadá nový domov v lokalite ${dog.city}.`,
    path: adoptionHref(dog), image: dog.mainImage, imageAlt: `${dog.name} – pes na adopciu`, type: "article",
    publishedTime: dog.publishedAt || dog.createdAt, modifiedTime: dog.updatedAt,
    robots: adoptionIsIndexable(dog) ? undefined : { index: false, follow: true },
  });
  const legacy = await getPublishedHelpCase("adopcia", slug);
  if (!legacy) return {};
  const fallback = helpSeoFallback(legacy.title, getHelpCategory(legacy.category)?.singular ?? "Pes na adopciu", legacy.city);
  return buildContentMetadata({ seo: legacy.seo, fallbackTitle: fallback.title, fallbackDescription: fallback.description,
    path: helpCaseHref(legacy), image: legacy.imageUrl, imageAlt: legacy.title, type: "article",
    publishedTime: legacy.publishedAt || legacy.createdAt, modifiedTime: legacy.updatedAt, section: "Pomoc psom" });
}

export default async function AdoptionDogPage({ params }: Props) {
  const { slug } = await params;
  const dog = await getPublicAdoptionBySlug(slug);
  if (!dog) {
    const legacy = await getPublishedHelpCase("adopcia", slug);
    if (!legacy) notFound();
    return <HelpDetail item={legacy} />;
  }
  const canonical = `${SITE_URL}${adoptionHref(dog)}`;
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": canonical, url: canonical, name: `${dog.name} – pes na adopciu`, description: dog.shortDescription, dateModified: dog.updatedAt },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Pomoc psom", item: `${SITE_URL}/pomoc-psom` },
      { "@type": "ListItem", position: 3, name: "Psy na adopciu", item: `${SITE_URL}/pomoc-psom/adopcia` },
      { "@type": "ListItem", position: 4, name: dog.name, item: canonical },
    ] },
  ] };
  return <><StructuredData value={schema} /><AdoptionDetail dog={dog} /></>;
}
