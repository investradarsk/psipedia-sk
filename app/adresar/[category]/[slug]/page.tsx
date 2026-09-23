import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DirectoryProfileDetail } from "@/components/directory-profile-detail";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getDirectoryDetailPresentation } from "@/lib/directory-detail-presentation";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";
import { StructuredData } from "@/components/structured-data";
import { buildContentMetadata, directorySeoFallback, resolvedCanonical } from "@/lib/content-seo";
import { absoluteUrl, SITE_URL } from "@/lib/seo";
import { PartnerPublicOwnership } from "@/components/partner-public-ownership";
import { isPublicPartnerResourceVerified } from "@/lib/partner-claims";
import { getPublicProfileReviewData, type ProfileReviewReadDatabase } from "@/lib/profile-review-read";
import { getPublicPartnerCommercialFlags } from "@/lib/partner-commercial-agreements";

export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<Search>;
};
type ReviewBindings = { DB?: ProfileReviewReadDatabase };

function reviewDatabase() {
  const database = (env as unknown as ReviewBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza profilových recenzií zatiaľ nie je pripojená.");
  }
  return database;
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const LEGACY_DIRECTORY_SLUGS: Record<string, string> = {
  "veterinari/veterinarna-poliklinka-althea": "veterinarna-poliklinika-althea",
};

function resolveDirectorySlug(category: string, slug: string) {
  return LEGACY_DIRECTORY_SLUGS[`${category}/${slug}`] ?? slug;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const profile = await getPublishedDirectoryProfile(category, resolveDirectorySlug(category, slug));
  const fallback = profile ? directorySeoFallback(profile.name, profile.city, profile.category) : null;
  return profile && fallback ? buildContentMetadata({
    seo: profile.seo, fallbackTitle: fallback.title,
    fallbackDescription: fallback.description,
    path: directoryProfileHref(profile),
    image: profile.imageUrl || null,
    imageAlt: profile.name,
  }) : {};
}

export default async function DirectoryProfilePage({ params, searchParams }: Props) {
  const { category, slug } = await params;
  if (!getDirectoryCategory(category)) notFound();
  const resolvedSlug = resolveDirectorySlug(category, slug);
  if (resolvedSlug !== slug) permanentRedirect(`/adresar/${category}/${resolvedSlug}`);
  const profile = await getPublishedDirectoryProfile(category, resolvedSlug);
  if (!profile) notFound();
  const canonical = resolvedCanonical(profile.seo, directoryProfileHref(profile));
  const presentation = getDirectoryDetailPresentation(profile);
  const reviewPage = scalar((await searchParams).reviewsPage);
  const partnerVerifiedPromise = isPublicPartnerResourceVerified("DIRECTORY_PROFILE", profile.id);
  const commercialPromise = getPublicPartnerCommercialFlags("DIRECTORY_PROFILE", profile.id, reviewDatabase());
  const reviewsPromise = getPublicProfileReviewData(reviewDatabase(), {
    entityType: "DIRECTORY_PROFILE",
    canonicalId: profile.id,
    category: profile.category,
  }, { page: reviewPage })
    .then((data) => ({ data, readError: false }))
    .catch((error) => {
      console.error("Public directory profile reviews read failed", {
        profileId: profile.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { data: null, readError: true };
    });
  const [partnerVerified, reviewResult, commercial] = await Promise.all([partnerVerifiedPromise, reviewsPromise, commercialPromise]);
  const schemaType = profile.category === "veterinari" ? "VeterinaryCare" : ["kynologicke-kluby","chovatelske-kluby"].includes(profile.category) ? "Organization" : "LocalBusiness";
  const sameAs = [presentation.websiteUrl, presentation.facebookUrl, presentation.instagramUrl].filter((value): value is string => Boolean(value));
  const schema = { "@context":"https://schema.org", "@graph":[
    { "@type":schemaType, "@id":`${canonical}#profile`, name:profile.name, url:canonical, description:presentation.description || profile.excerpt,
      image:profile.imageUrl ? absoluteUrl(profile.imageUrl) : undefined,
      telephone:presentation.phone?.value || undefined,
      email:presentation.emails[0]?.value || undefined,
      address:profile.address || profile.city ? { "@type":"PostalAddress", streetAddress:profile.address || undefined, addressLocality:profile.city || undefined, addressRegion:profile.region || undefined, addressCountry:"SK" } : undefined,
      sameAs:sameAs.length > 0 ? sameAs : undefined },
    { "@type":"BreadcrumbList", "@id":`${canonical}#breadcrumb`, itemListElement:[
      {"@type":"ListItem",position:1,name:"Domov",item:SITE_URL}, {"@type":"ListItem",position:2,name:"Služby pre psov",item:`${SITE_URL}/adresar`},
      {"@type":"ListItem",position:3,name:getDirectoryCategory(profile.category)?.label,item:`${SITE_URL}/adresar/${profile.category}`}, {"@type":"ListItem",position:4,name:profile.name,item:canonical}]}
  ]};
  const claimHref = `/partner/prevziat-profil/DIRECTORY_PROFILE/${profile.id}`;
  return <><StructuredData value={schema}/><DirectoryProfileDetail presentation={presentation} reviews={reviewResult.data} reviewReadError={reviewResult.readError} commercial={commercial} /><PartnerPublicOwnership verified={partnerVerified} claimHref={claimHref} /></>;
}
