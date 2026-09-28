import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdoptionDetail } from "@/components/adoption-detail";
import { StructuredData } from "@/components/structured-data";
import {
  asPublicAdoptionDetail,
  buildAdoptionDetailSeo,
  buildAdoptionDetailStructuredData,
} from "@/lib/adoption-detail";
import { getAdoptionBySlug, getPublicAdoptionOrganizationById } from "@/lib/adoption-store";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

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

  return current ? { robots: { index: false, follow: true } } : {};
}

export default async function AdoptionDogPage({ params }: Props) {
  const { slug } = await params;
  const current = await getAdoptionBySlug(slug);
  const dog = asPublicAdoptionDetail(current);
  if (dog) {
    const organization = await getPublicAdoptionOrganizationById(dog.organizationId);
    return <>
      <StructuredData value={buildAdoptionDetailStructuredData(dog, SITE_URL)} />
      <AdoptionDetail dog={dog} organization={organization} />
    </>;
  }

  notFound();
}
