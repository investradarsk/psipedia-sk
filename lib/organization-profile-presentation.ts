import type { PublicHelpOrganization } from "./help-organization-store.ts";
import { validateFundraisingUrl } from "./organization-fundraising-contract.ts";
import type { PublicOrganizationFundraisingMethod } from "./organization-fundraising-public.ts";

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

export type OrganizationProfileLocation = {
  id: number | null;
  label: string | null;
  value: string;
  isPrimary: boolean;
};


export type OrganizationFundraisingPresentation = {
  id: number;
  typeLabel: string;
  title: string;
  detail: { label: string; value: string } | null;
  instructions: string | null;
  action: OrganizationProfileAction | null;
};

export type OrganizationProfilePresentation = {
  shortDescription: string | null;
  description: string | null;
  location: string | null;
  locations: OrganizationProfileLocation[];
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

const fundraisingTypeLabels: Record<PublicOrganizationFundraisingMethod["type"], string> = {
  MATERIAL_DONATION: "Materiálna pomoc",
  DONATION_PAGE: "Online podpora",
  BANK_TRANSFER: "Bankový prevod",
  TRANSPARENT_ACCOUNT: "Transparentný účet",
  EXTERNAL_FUNDRAISER: "Externá zbierka",
};

const fundraisingActionLabels: Partial<Record<PublicOrganizationFundraisingMethod["type"], string>> = {
  MATERIAL_DONATION: "Viac o materiálnej pomoci ↗",
  DONATION_PAGE: "Otvoriť stránku podpory ↗",
  TRANSPARENT_ACCOUNT: "Otvoriť transparentný účet ↗",
  EXTERNAL_FUNDRAISER: "Otvoriť zbierku ↗",
};

function formatOrganizationUpdatedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

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

function locationValue(location: PublicHelpOrganization["locations"][number]) {
  const city = text(location.city);
  const district = text(location.district);
  const region = text(location.region);
  const countryCode = text(location.countryCode)?.toUpperCase() ?? null;
  const parts = [
    city,
    district && district !== city ? `okres ${district}` : null,
    region && region !== city && region !== district ? region : null,
    countryCode && countryCode !== "SK" ? countryCode : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function presentationLocations(organization: PublicHelpOrganization): OrganizationProfileLocation[] {
  const canonical = Array.isArray(organization.locations)
    ? [...organization.locations].sort((left, right) =>
        (left.role === "SITE" ? 0 : 1) - (right.role === "SITE" ? 0 : 1)
        || Number(right.isPrimary) - Number(left.isPrimary)
        || left.sortOrder - right.sortOrder
        || (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER),
      )[0] ?? null
    : null;
  const location = canonical ?? {
    id: null,
    organizationId: organization.id,
    role: "UNSPECIFIED" as const,
    label: "",
    city: organization.city,
    district: organization.district,
    region: organization.region,
    countryCode: organization.countryCode,
    isPrimary: true,
    sortOrder: 0,
  };
  const value = locationValue(location);
  if (!value) return [];
  return [{
    id: location.id,
    label: null,
    value,
    isPrimary: true,
  }];
}

export function buildOrganizationFundraisingPresentation(
  methods: readonly PublicOrganizationFundraisingMethod[],
): OrganizationFundraisingPresentation[] {
  return methods.map((method) => {
    const typeLabel = fundraisingTypeLabels[method.type];
    const title = text(method.label) ?? typeLabel;
    const detail = method.value
      ? {
          label: method.type === "BANK_TRANSFER" || method.type === "TRANSPARENT_ACCOUNT" ? "IBAN" : "Možnosť pomoci",
          value: method.value,
        }
      : null;
    const urlResult = method.url ? validateFundraisingUrl(method.url) : null;
    const actionLabel = fundraisingActionLabels[method.type];
    const action = urlResult?.valid && actionLabel
      ? { label: actionLabel, href: urlResult.normalizedUrl, external: true }
      : null;

    return {
      id: method.id,
      typeLabel,
      title,
      detail,
      instructions: text(method.instructions),
      action,
    };
  });
}

export function buildOrganizationProfilePresentation(
  organization: PublicHelpOrganization,
): OrganizationProfilePresentation {
  const shortDescription = text(organization.shortDescription);
  const description = text(organization.description);
  const locations = presentationLocations(organization);
  const singleLocation = locations.length === 1 ? locations[0] : null;
  const singleLocationParts = singleLocation
    ? [singleLocation.label, singleLocation.value].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
    : [];
  const website = externalUrl(organization.websiteUrl);

  const updatedAt = formatOrganizationUpdatedAt(organization.updatedAt);
  const facts: OrganizationProfileFact[] = [
    { label: "Typ organizácie", value: organizationTypeLabels[organization.type] },
    text(organization.legalName) && text(organization.legalName) !== text(organization.name)
      ? { label: "Právny názov", value: text(organization.legalName)! }
      : null,
    text(organization.registrationNumber)
      ? { label: "Registračné číslo", value: text(organization.registrationNumber)! }
      : null,
    updatedAt ? { label: "Aktualizované", value: updatedAt } : null,
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
    location: singleLocationParts.length ? singleLocationParts.join(" · ") : null,
    locations,
    imageUrl: mediaUrl(organization.imageUrl),
    facts,
    contacts,
    actions,
  };
}
