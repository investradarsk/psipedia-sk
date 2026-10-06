import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { DirectoryLocationLandingPage } from "@/components/directory-location-landing";
import { StructuredData } from "@/components/structured-data";
import {
  buildDirectoryLocationLandingBreadcrumbs,
  canonicalDirectoryLocationLandingCategory,
  directoryLocationLandingPath,
  getDirectoryLocationLanding,
} from "@/lib/directory-location-landings";
import { buildCollectionPageJsonLd, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { buildPageMetadata, INDEXABLE_ROBOTS, NOINDEX_FOLLOW_ROBOTS } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ category: string; locationSlug: string }>;
  searchParams: Promise<Search>;
};

const DIMENSION = "city" as const;
const loadLanding = cache((category: string, locationSlug: string) => (
  getDirectoryLocationLanding({ category, dimension: DIMENSION, locationSlug })
));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category, locationSlug } = await params;
  const canonicalCategory = canonicalDirectoryLocationLandingCategory(category);
  if (!canonicalCategory) return { robots: NOINDEX_FOLLOW_ROBOTS };

  const landing = await loadLanding(canonicalCategory, locationSlug);
  if (!landing) return { robots: NOINDEX_FOLLOW_ROBOTS };

  const queryPolicy = resolveListingIndexPolicy(landing.path, await searchParams);
  return buildPageMetadata({
    title: landing.seoTitle,
    description: landing.description,
    path: landing.path,
    canonical: landing.path,
    robots: landing.indexable && queryPolicy.kind === "clean"
      ? INDEXABLE_ROBOTS
      : NOINDEX_FOLLOW_ROBOTS,
  });
}

export default async function DirectoryLocationLandingRoute({ params }: Props) {
  const { category, locationSlug } = await params;
  const canonicalCategory = canonicalDirectoryLocationLandingCategory(category);
  if (!canonicalCategory) notFound();
  if (canonicalCategory !== category) {
    permanentRedirect(directoryLocationLandingPath(canonicalCategory, DIMENSION, locationSlug));
  }

  const landing = await loadLanding(canonicalCategory, locationSlug);
  if (!landing || landing.total === 0) notFound();

  const schema = buildCollectionPageJsonLd({
    name: landing.h1,
    description: landing.description,
    path: landing.path,
    breadcrumbs: buildDirectoryLocationLandingBreadcrumbs(landing),
    items: landing.profiles.map((profile) => ({
      name: profile.name,
      path: `/adresar/${profile.category}/${profile.slug}`,
    })),
  });

  return <><StructuredData value={schema} /><DirectoryLocationLandingPage landing={landing} /></>;
}
