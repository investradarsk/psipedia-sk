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
  if (current) {
    const dog = asPublicAdoptionDetail(current);
    if (!dog) return { robots: { index: false, follow: true } };
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
  if (!legacy) return {};
  const fallback = helpSeoFallback(legacy.title, getHelpCategory(legacy.category)?.singular ?? "Pes na adopciu", legacy.city);
  return buildContentMetadata({
    seo: legacy.seo,
    fallbackTitle: fallback.title,
    fallbackDescription: fallback.description,
    path: helpCaseHref(legacy),
    image: legacy.imageUrl,
    imageAlt: legacy.title,
    type: "article",
    publishedTime: legacy.publishedAt || legacy.createdAt,
    modifiedTime: legacy.updatedAt,
    section: "Pomoc psom",
  });
}

export default async function AdoptionDogPage({ params }: Props) {
  const { slug } = await params;
  const current = await getAdoptionBySlug(slug);
  if (current) {
    const dog = asPublicAdoptionDetail(current);
    if (!dog) notFound();
    return <>
      <StructuredData value={buildAdoptionDetailStructuredData(dog, SITE_URL)} />
      <AdoptionDetail dog={dog} />
    </>;
  }

  const legacy = await getLegacyAdoption(slug);
  if (!legacy) notFound();
  return <HelpDetail item={legacy} />;
}
