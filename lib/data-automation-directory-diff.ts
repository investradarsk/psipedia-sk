import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  stableJson,
} from "./data-automation.ts";
import { normalizeAutomationEmail, normalizeAutomationPhone } from "./data-automation-identity.ts";

const DIRECTORY_ACTIONABLE_FIELDS = [
  "name",
  "excerpt",
  "description",
  "services",
  "qualifications",
  "city",
  "district",
  "region",
  "address",
  "postalCode",
  "street",
  "houseNumber",
  "addressFormat",
  "online",
  "priceNote",
  "websiteUrl",
  "importKey",
  "verified",
  "publicPhone",
  "publicEmail",
  "facebookUrl",
  "instagramUrl",
] as const;

type DirectoryActionableField = (typeof DIRECTORY_ACTIONABLE_FIELDS)[number];

function sameCanonicalUrl(left: unknown, right: unknown) {
  const a = canonicalizeSourceUrl(left);
  const b = canonicalizeSourceUrl(right);
  return Boolean(a && b && a === b);
}

function fieldEquivalent(field: DirectoryActionableField, before: unknown, proposed: unknown) {
  if (field === "name" || field === "city" || field === "district" || field === "region") {
    const a = normalizeAutomationIdentity(before);
    const b = normalizeAutomationIdentity(proposed);
    return Boolean(a && b && a === b);
  }
  if (field === "publicPhone") {
    const a = normalizeAutomationPhone(before);
    const b = normalizeAutomationPhone(proposed);
    return Boolean(a && b && a === b);
  }
  if (field === "publicEmail") {
    const a = normalizeAutomationEmail(before);
    const b = normalizeAutomationEmail(proposed);
    return Boolean(a && b && a === b);
  }
  if (field === "websiteUrl" || field === "facebookUrl" || field === "instagramUrl") {
    return sameCanonicalUrl(before, proposed);
  }
  return stableJson(before ?? null) === stableJson(proposed ?? null);
}

export function directoryActionableProposal(
  proposed: Record<string, unknown>,
  canonicalBefore: Record<string, unknown> | null,
) {
  const actionable: Record<string, unknown> = {};
  for (const field of DIRECTORY_ACTIONABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(proposed, field)) continue;
    const value = proposed[field];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) continue;
    if (canonicalBefore && fieldEquivalent(field, canonicalBefore[field], value)) continue;
    actionable[field] = value;
  }
  return actionable;
}

export const directoryActionableFields = DIRECTORY_ACTIONABLE_FIELDS;
