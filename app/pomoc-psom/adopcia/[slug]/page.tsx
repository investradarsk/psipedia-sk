import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdoptionDetail } from "@/components/adoption-detail";
import { HelpDetail } from "@/components/help-detail";
import { StructuredData } from "@/components/structured-data";
import {
  asPublicAdoptionDetail,
  buildAdoptionDetailSeo,
  buildAdoptionDetailStructuredData,
  isLegacyAdoptionFallbackCandidate,
  resolveAdoptionDetailSource,
} from "@/lib/adoption-detail";
import { getAdoptionBySlug } from "@/lib/adoption-store";
import { buildContentMetadata, helpSeoFallback } from "@/lib/content-seo";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getPublishedHelpCase } from "@/lib/help-store";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function getLegacyAdoption(slug: string) {
  const legacy = await getPublishedHelpCase("adopcia", slug);
  return isLegacyAdoptionFallbackCandidate(legacy) ? legacy : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const current = await getAdoptionBySlug(slug);
  const dog = asPublicAdoptionDetail(current);
  if (dog) {
    const seo = buildAdoptionDetailSeo(dog);
    return buildPageMetadata({
      title: seo.title,
      description: seo.description,
      path: seo.path,
      image: seo.image,
      imageAlt: seo.imageAlt,
      type: "article",
      publishedTime: seo.publishedTime,
      modifiedTime: seo.modifiedTime,
      robots: seo.indexable ? undefined : { index: false, follow: true },
    });
  }

  const legacy = await getLegacyAdoption(slug);
  const fallback = resolveAdoptionDetailSource(current, legacy);
  if (fallback?.kind !== "legacy") return current ? { robots: { index: false, follow: true } } : {};
  const item = fallback.item;
  const seoFallback = helpSeoFallback(item.title, getHelpCategory(item.category)?.singular ?? "Pes na adopciu", item.city);
  return buildContentMetadata({
    seo: item.seo,
    fallbackTitle: seoFallback.title,
    fallbackDescription: seoFallback.description,
    path: helpCaseHref(item),
    image: item.imageUrl,
    imageAlt: item.title,
    type: "article",
    publishedTime: item.publishedAt || item.createdAt,
    modifiedTime: item.updatedAt,
    section: "Pomoc psom",
  });
}

export default async function AdoptionDogPage({ params }: Props) {
  const { slug } = await params;
  const current = await getAdoptionBySlug(slug);
  const dog = asPublicAdoptionDetail(current);
  if (dog) {
    return <>
      <StructuredData value={buildAdoptionDetailStructuredData(dog, SITE_URL)} />
      <AdoptionDetail dog={dog} />
    </>;
  }

  const legacy = await getLegacyAdoption(slug);
  const fallback = resolveAdoptionDetailSource(current, legacy);
  if (fallback?.kind !== "legacy") notFound();
  return <HelpDetail item={fallback.item} />;
}
