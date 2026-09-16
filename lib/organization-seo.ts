import type { Metadata } from "next";

import type { PublicHelpOrganization } from "./help-organization-store.ts";
import { buildOrganizationProfilePresentation } from "./organization-profile-presentation.ts";
import { absoluteUrl, buildPageMetadata } from "./seo.ts";

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
  const description = presentation.description ?? presentation.shortDescription;
  const email = presentation.contacts.find((contact) => contact.label === "Email");
  const telephone = presentation.contacts.find((contact) => contact.label === "Telefón");
  const sameAs = [...new Set(
    presentation.contacts
      .filter((contact) => contact.external)
      .map((contact) => contact.href),
  )];

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${canonicalUrl}#organization`,
    name: organization.name,
    url: canonicalUrl,
    ...(description ? { description } : {}),
    ...(presentation.imageUrl ? { image: absoluteUrl(presentation.imageUrl) } : {}),
    ...(email ? { email: email.value } : {}),
    ...(telephone ? { telephone: telephone.value } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
