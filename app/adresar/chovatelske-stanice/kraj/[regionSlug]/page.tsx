import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { BreedingStationLandingPage } from "@/components/breeding-station-landing";
import { StructuredData } from "@/components/structured-data";
import {
  buildBreedingStationLandingBreadcrumbs,
  getBreedingStationLanding,
} from "@/lib/breeding-station-landings";
import { buildCollectionPageJsonLd, resolveListingIndexPolicy } from "@/lib/listing-seo";
import { buildPageMetadata, INDEXABLE_ROBOTS, NOINDEX_FOLLOW_ROBOTS } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ regionSlug: string }>;
  searchParams: Promise<Search>;
};

const loadLanding = cache((regionSlug: string) => getBreedingStationLanding({ regionSlug }));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { regionSlug } = await params;
  const landing = await loadLanding(regionSlug);
  if (!landing) return { robots: NOINDEX_FOLLOW_ROBOTS };

  const queryPolicy = resolveListingIndexPolicy(landing.path, await searchParams);
  return buildPageMetadata({
    title: landing.seoTitle,
    description: landing.description,
    path: landing.path,
    canonical: landing.path,
    robots: landing.indexable && queryPolicy.kind === "clean" ? INDEXABLE_ROBOTS : NOINDEX_FOLLOW_ROBOTS,
  });
}

export default async function BreedingStationRegionLanding({ params }: Props) {
  const { regionSlug } = await params;
  const landing = await loadLanding(regionSlug);
  if (!landing || landing.total === 0) notFound();

  const schema = buildCollectionPageJsonLd({
    name: landing.h1,
    description: landing.description,
    path: landing.path,
    breadcrumbs: buildBreedingStationLandingBreadcrumbs(landing),
    items: landing.profiles.map((profile) => ({
      name: profile.name,
      path: `/adresar/${profile.category}/${profile.slug}`,
    })),
  });

  return <><StructuredData value={schema} /><BreedingStationLandingPage landing={landing} /></>;
}
