import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  stableJson,
} from "./data-automation.ts";

const ORGANIZATION_ACTIONABLE_FIELDS = [
  "name",
  "legalName",
  "type",
  "registrationNumber",
  "websiteUrl",
  "publicEmail",
  "publicPhone",
  "facebookUrl",
  "instagramUrl",
  "address",
  "city",
  "district",
  "region",
  "countryCode",
  "description",
  "shortDescription",
  "imageUrl",
] as const;

type OrganizationActionableField = (typeof ORGANIZATION_ACTIONABLE_FIELDS)[number];

function sameIdentity(left: unknown, right: unknown) {
  const a = normalizeAutomationIdentity(left);
  const b = normalizeAutomationIdentity(right);
  return Boolean(a && b && a === b);
}

function phoneIdentity(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function samePhone(left: unknown, right: unknown) {
  const a = phoneIdentity(left);
  const b = phoneIdentity(right);
  return Boolean(a && b && a === b);
}

function emailIdentity(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

function sameEmail(left: unknown, right: unknown) {
  const a = emailIdentity(left);
  const b = emailIdentity(right);
  return Boolean(a && b && a === b);
}

function sameCanonicalUrl(left: unknown, right: unknown) {
  const a = canonicalizeSourceUrl(left);
  const b = canonicalizeSourceUrl(right);
  return Boolean(a && b && a === b);
}

function organizationFieldEquivalent(
  field: OrganizationActionableField,
  before: unknown,
  proposed: unknown,
) {
  if (field === "name") return sameIdentity(before, proposed);
  if (field === "publicPhone") return samePhone(before, proposed);
  if (field === "publicEmail") return sameEmail(before, proposed);
  if (field === "websiteUrl" || field === "facebookUrl" || field === "instagramUrl") {
    return sameCanonicalUrl(before, proposed);
  }
  return stableJson(before ?? null) === stableJson(proposed ?? null);
}

export function organizationActionableProposal(
  proposed: Record<string, unknown>,
  canonicalBefore: Record<string, unknown> | null,
) {
  const actionable: Record<string, unknown> = {};
  for (const field of ORGANIZATION_ACTIONABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(proposed, field)) continue;
    const value = proposed[field];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) continue;
    if (canonicalBefore && organizationFieldEquivalent(field, canonicalBefore[field], value)) continue;
    actionable[field] = value;
  }
  return actionable;
}

export const organizationActionableFields = ORGANIZATION_ACTIONABLE_FIELDS;
