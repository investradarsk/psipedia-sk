import type { PublicRelatedBreed } from "@/lib/content-relations";
import type { DirectoryDetailPresentation } from "@/lib/directory-detail-presentation";
import { getDirectoryCategory, type PublicDirectoryProfile } from "./directory.ts";
import { absoluteUrl, buildWebPageJsonLd, SITE_URL } from "./seo.ts";

export function buildDirectoryProfileJsonLd({
  profile,
  presentation,
  canonical,
  relatedBreeds,
}: {
  profile: PublicDirectoryProfile;
  presentation: DirectoryDetailPresentation;
  canonical: string;
  relatedBreeds: PublicRelatedBreed[];
}) {
  const schemaType = profile.category === "veterinari"
    ? "VeterinaryCare"
    : ["kynologicke-kluby", "chovatelske-kluby"].includes(profile.category)
      ? "Organization"
      : "LocalBusiness";
  const sameAs = [presentation.websiteUrl, presentation.facebookUrl, presentation.instagramUrl]
    .filter((value): value is string => Boolean(value));
  const profileEntityId = `${canonical}#profile`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const profileImage = profile.imageUrl ? absoluteUrl(profile.imageUrl) : undefined;
  const breedNames = relatedBreeds.map((breed) => breed.name.trim()).filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": schemaType,
        "@id": profileEntityId,
        name: profile.name,
        url: canonical,
        description: presentation.description || profile.excerpt,
        mainEntityOfPage: { "@id": canonical },
        image: profileImage,
        ...(schemaType === "Organization" && profileImage
          ? { logo: { "@type": "ImageObject", url: profileImage } }
          : {}),
        telephone: presentation.phone?.value || undefined,
        email: presentation.emails[0]?.value || undefined,
        address: profile.address || profile.city ? {
          "@type": "PostalAddress",
          streetAddress: profile.address || undefined,
          addressLocality: profile.city || undefined,
          addressRegion: profile.region || undefined,
          addressCountry: "SK",
        } : undefined,
        sameAs: sameAs.length > 0 ? sameAs : undefined,
        knowsAbout: breedNames.length > 0 ? breedNames : undefined,
      },
      buildWebPageJsonLd({
        canonical,
        name: profile.name,
        description: presentation.description || profile.excerpt,
        mainEntityId: profileEntityId,
        breadcrumbId,
        dateModified: profile.updatedAt || undefined,
      }),
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Služby pre psov", item: `${SITE_URL}/adresar` },
          { "@type": "ListItem", position: 3, name: getDirectoryCategory(profile.category)?.label, item: `${SITE_URL}/adresar/${profile.category}` },
          { "@type": "ListItem", position: 4, name: profile.name, item: canonical },
        ],
      },
    ],
  };
}
