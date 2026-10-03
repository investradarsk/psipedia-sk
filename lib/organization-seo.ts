import type { Metadata } from "next";

import type { PublicHelpOrganization } from "./help-organization-store.ts";
import { buildOrganizationProfilePresentation } from "./organization-profile-presentation.ts";
import { absoluteUrl, buildPageMetadata, buildWebPageJsonLd } from "./seo.ts";

export function organizationCanonicalPath(slug: string) {
  return `/organizacie/${encodeURIComponent(slug)}`;
}

export function organizationMetadataDescription(organization: PublicHelpOrganization) {
  const presentation = buildOrganizationProfilePresentation(organization);
  return presentation.shortDescription
    ?? presentation.description
    ?? `Verejný profil organizácie ${organization.name} na Psipedia.sk.`;
}

export function buildOrganizationMetadata(organization: PublicHelpOrganization): Metadata {
  const presentation = buildOrganizationProfilePresentation(organization);
  return buildPageMetadata({
    title: organization.name,
    description: organizationMetadataDescription(organization),
    path: organizationCanonicalPath(organization.slug),
    image: presentation.imageUrl,
    imageAlt: organization.name,
  });
}

export function buildOrganizationJsonLd(organization: PublicHelpOrganization) {
  const presentation = buildOrganizationProfilePresentation(organization);
  const canonicalUrl = absoluteUrl(organizationCanonicalPath(organization.slug));
  const organizationEntityId = `${canonicalUrl}#organization`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const description = presentation.description ?? presentation.shortDescription;
  const email = presentation.contacts.find((contact) => contact.label === "Email");
  const telephone = presentation.contacts.find((contact) => contact.label === "Telefón");
  const imageUrl = presentation.imageUrl ? absoluteUrl(presentation.imageUrl) : undefined;
  const sameAs = [...new Set(
    presentation.contacts
      .filter((contact) => contact.external)
      .map((contact) => contact.href),
  )];
  const postalAddress = organization.city || organization.region || organization.countryCode
    ? {
        "@type": "PostalAddress",
        ...(organization.city ? { addressLocality: organization.city } : {}),
        ...(organization.region ? { addressRegion: organization.region } : {}),
        ...(organization.countryCode ? { addressCountry: organization.countryCode } : {}),
      }
    : undefined;

  const organizationEntity = {
    "@type": "Organization",
    "@id": organizationEntityId,
    name: organization.name,
    url: canonicalUrl,
    mainEntityOfPage: { "@id": canonicalUrl },
    ...(description ? { description } : {}),
    ...(imageUrl ? {
      image: imageUrl,
      logo: { "@type": "ImageObject", url: imageUrl },
    } : {}),
    ...(email ? { email: email.value } : {}),
    ...(telephone ? { telephone: telephone.value } : {}),
    ...(postalAddress ? { address: postalAddress } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationEntity,
      buildWebPageJsonLd({
        canonical: canonicalUrl,
        name: organization.name,
        description: organizationMetadataDescription(organization),
        mainEntityId: organizationEntityId,
        breadcrumbId,
        datePublished: organization.publishedAt,
        dateModified: organization.updatedAt,
      }),
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Pomoc psom", item: absoluteUrl("/pomoc-psom") },
          { "@type": "ListItem", position: 3, name: organization.name, item: canonicalUrl },
        ],
      },
    ],
  };
}
