import { buildOrganizationProfilePresentation } from "./organization-profile-presentation.ts";
import type { PublicOrganizationType } from "./help-organization-store.ts";

export const organizationPublicationStatuses = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type OrganizationPublicationStatus = (typeof organizationPublicationStatuses)[number];

export const organizationPublicationTypes = [
  "SHELTER",
  "CIVIC_ASSOCIATION",
  "RESCUE_ORGANIZATION",
  "MUNICIPAL_ORGANIZATION",
  "NONPROFIT",
  "OTHER",
] as const satisfies readonly PublicOrganizationType[];

export type OrganizationPublicationCandidate = {
  id: number;
  name: string;
  slug: string;
  legalName: string;
  registrationNumber: string | null;
  type: string;
  status: OrganizationPublicationStatus;
  shortDescription: string;
  description: string;
  publicEmail: string | null;
  publicPhone: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  city: string;
  district: string;
  region: string;
  countryCode: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  lastVerifiedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type OrganizationPublicationBlockerCode =
  | "ARCHIVED"
  | "MISSING_NAME"
  | "MISSING_SLUG"
  | "INVALID_TYPE"
  | "PUBLISHED_WITHOUT_PUBLISHED_AT";

export type OrganizationPublicationWarningCode =
  | "MISSING_DESCRIPTION"
  | "MISSING_LOCATION"
  | "MISSING_CONTACT";

export type OrganizationPublicationPreflight = {
  ready: boolean;
  blockers: { code: OrganizationPublicationBlockerCode; message: string }[];
  warnings: { code: OrganizationPublicationWarningCode; message: string }[];
};

export function isOrganizationPublicationStatus(value: string): value is OrganizationPublicationStatus {
  return (organizationPublicationStatuses as readonly string[]).includes(value);
}

export function isOrganizationPublicationType(value: string): value is PublicOrganizationType {
  return (organizationPublicationTypes as readonly string[]).includes(value);
}

export function buildOrganizationPublicationPreflight(
  organization: OrganizationPublicationCandidate,
): OrganizationPublicationPreflight {
  const blockers: OrganizationPublicationPreflight["blockers"] = [];
  if (organization.status === "ARCHIVED" || organization.archivedAt) {
    blockers.push({ code: "ARCHIVED", message: "Archivovanú organizáciu nemožno publikovať v tomto workflow." });
  }
  if (!organization.name.trim()) {
    blockers.push({ code: "MISSING_NAME", message: "Chýba názov organizácie." });
  }
  if (!organization.slug.trim()) {
    blockers.push({ code: "MISSING_SLUG", message: "Chýba canonical slug organizácie." });
  }
  const validType = isOrganizationPublicationType(organization.type);
  if (!validType) {
    blockers.push({ code: "INVALID_TYPE", message: "Organizácia má nepodporovaný typ." });
  }
  if (organization.status === "PUBLISHED" && !organization.publishedAt) {
    blockers.push({
      code: "PUBLISHED_WITHOUT_PUBLISHED_AT",
      message: "Publikovaný stav nemá published_at a verejný contract ho preto zámerne skryje.",
    });
  }

  const presentation = buildOrganizationProfilePresentation({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    legalName: organization.legalName,
    registrationNumber: organization.registrationNumber,
    type: validType ? organization.type : "OTHER",
    shortDescription: organization.shortDescription,
    description: organization.description,
    publicEmail: organization.publicEmail,
    publicPhone: organization.publicPhone,
    websiteUrl: organization.websiteUrl,
    facebookUrl: organization.facebookUrl,
    instagramUrl: organization.instagramUrl,
    city: organization.city,
    district: organization.district,
    region: organization.region,
    countryCode: organization.countryCode,
    imageUrl: organization.imageUrl,
    sourceUrl: organization.sourceUrl,
    publishedAt: organization.publishedAt ?? organization.updatedAt,
    lastVerifiedAt: organization.lastVerifiedAt,
    updatedAt: organization.updatedAt,
    directory: null,
  });

  const warnings: OrganizationPublicationPreflight["warnings"] = [];
  if (!presentation.shortDescription && !presentation.description) {
    warnings.push({ code: "MISSING_DESCRIPTION", message: "Profil nemá verejný opis; SEO použije bezpečný fallback." });
  }
  if (!presentation.location) {
    warnings.push({ code: "MISSING_LOCATION", message: "Profil nemá zobraziteľnú lokalitu." });
  }
  if (!presentation.contacts.length) {
    warnings.push({ code: "MISSING_CONTACT", message: "Profil nemá použiteľný verejný kontakt ani web." });
  }

  return { ready: blockers.length === 0, blockers, warnings };
}
