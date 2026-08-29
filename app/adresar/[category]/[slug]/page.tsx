import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DirectoryProfileDetail } from "@/components/directory-profile-detail";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";
import { StructuredData } from "@/components/structured-data";
import { buildContentMetadata, directorySeoFallback, resolvedCanonical } from "@/lib/content-seo";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string; slug: string }> };

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

export default async function DirectoryProfilePage({ params }: Props) {
  const { category, slug } = await params;
  if (!getDirectoryCategory(category)) notFound();
  const resolvedSlug = resolveDirectorySlug(category, slug);
  if (resolvedSlug !== slug) permanentRedirect(`/adresar/${category}/${resolvedSlug}`);
  const profile = await getPublishedDirectoryProfile(category, resolvedSlug);
  if (!profile) notFound();
  const canonical = resolvedCanonical(profile.seo, directoryProfileHref(profile));
  const schemaType = profile.category === "veterinari" ? "VeterinaryCare" : ["kynologicke-kluby","chovatelske-kluby"].includes(profile.category) ? "Organization" : "LocalBusiness";
  const schema = { "@context":"https://schema.org", "@graph":[
    { "@type":schemaType, "@id":`${canonical}#profile`, name:profile.name, url:canonical, description:profile.description || profile.excerpt,
      image:profile.imageUrl ? absoluteUrl(profile.imageUrl) : undefined,
      address:profile.address || profile.city ? { "@type":"PostalAddress", streetAddress:profile.address || undefined, addressLocality:profile.city || undefined, addressRegion:profile.region || undefined, addressCountry:"SK" } : undefined,
      sameAs:profile.websiteUrl ? [profile.websiteUrl] : undefined },
    { "@type":"BreadcrumbList", "@id":`${canonical}#breadcrumb`, itemListElement:[
      {"@type":"ListItem",position:1,name:"Domov",item:SITE_URL}, {"@type":"ListItem",position:2,name:"Služby pre psov",item:`${SITE_URL}/adresar`},
      {"@type":"ListItem",position:3,name:getDirectoryCategory(profile.category)?.label,item:`${SITE_URL}/adresar/${profile.category}`}, {"@type":"ListItem",position:4,name:profile.name,item:canonical}]}
  ]};
  return <><StructuredData value={schema}/><DirectoryProfileDetail profile={profile} /></>;
}
