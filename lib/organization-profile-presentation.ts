import type { PublicHelpOrganization } from "./help-organization-store.ts";

export type OrganizationProfileFact = {
  label: string;
  value: string;
};

export type OrganizationProfileContact = {
  label: string;
  value: string;
  href: string;
  external: boolean;
};

export type OrganizationProfileAction = {
  label: string;
  href: string;
  external: boolean;
};

export type OrganizationProfilePresentation = {
  shortDescription: string | null;
  description: string | null;
  location: string | null;
  imageUrl: string | null;
  facts: OrganizationProfileFact[];
  contacts: OrganizationProfileContact[];
  actions: OrganizationProfileAction[];
};

const organizationTypeLabels: Record<PublicHelpOrganization["type"], string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská alebo obecná organizácia",
  NONPROFIT: "Nezisková organizácia",
  OTHER: "Iná organizácia",
};

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function externalUrl(value: string | null | undefined) {
  const normalized = text(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function mediaUrl(value: string | null | undefined) {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  return externalUrl(normalized);
}

function emailContact(value: string | null | undefined): OrganizationProfileContact | null {
  const normalized = text(value);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return { label: "Email", value: normalized, href: `mailto:${normalized}`, external: false };
}

function phoneContact(value: string | null | undefined): OrganizationProfileContact | null {
  const normalized = text(value);
  if (!normalized) return null;
  const compact = normalized.replace(/[^+\d]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return { label: "Telefón", value: normalized, href: `tel:${compact}`, external: false };
}

function externalContact(label: string, value: string | null | undefined): OrganizationProfileContact | null {
  const href = externalUrl(value);
  if (!href) return null;
  return { label, value: text(value)!, href, external: true };
}

export function buildOrganizationProfilePresentation(
  organization: PublicHelpOrganization,
): OrganizationProfilePresentation {
  const shortDescription = text(organization.shortDescription);
  const description = text(organization.description);
  const city = text(organization.city);
  const district = text(organization.district);
  const region = text(organization.region);
  const locationParts = [city, district && district !== city ? `okres ${district}` : null, region].filter(
    (part): part is string => Boolean(part),
  );
  const website = externalUrl(organization.websiteUrl);

  const facts: OrganizationProfileFact[] = [
    { label: "Typ organizácie", value: organizationTypeLabels[organization.type] },
    text(organization.legalName) && text(organization.legalName) !== text(organization.name)
      ? { label: "Právny názov", value: text(organization.legalName)! }
      : null,
    text(organization.registrationNumber)
      ? { label: "Registračné číslo", value: text(organization.registrationNumber)! }
      : null,
    city ? { label: "Mesto", value: city } : null,
    district && district !== city ? { label: "Okres", value: district } : null,
    region ? { label: "Kraj", value: region } : null,
  ].filter((fact): fact is OrganizationProfileFact => Boolean(fact));

  const contacts = [
    website ? { label: "Web", value: text(organization.websiteUrl)!, href: website, external: true } : null,
    externalContact("Facebook", organization.facebookUrl),
    externalContact("Instagram", organization.instagramUrl),
    emailContact(organization.publicEmail),
    phoneContact(organization.publicPhone),
  ].filter((contact): contact is OrganizationProfileContact => Boolean(contact));

  const actions: OrganizationProfileAction[] = website
    ? [{ label: "Navštíviť web organizácie ↗", href: website, external: true }]
    : [];

  return {
    shortDescription,
    description,
    location: locationParts.length ? locationParts.join(" · ") : null,
    imageUrl: mediaUrl(organization.imageUrl),
    facts,
    contacts,
    actions,
  };
}
