import type { AutomationEntityType } from "./data-automation.ts";

export const automationSemanticKinds = [
  "UNKNOWN",
  "EVENT",
  "FACILITY_OR_SERVICE_PROFILE",
  "PERSON",
  "LEGAL_ENTITY",
  "LEGAL_ORGANIZATION",
  "PUBLIC_ORGANIZATION",
  "FACILITY",
  "BRANCH",
  "RESCUE_GROUP",
] as const;
export type AutomationSemanticKind = (typeof automationSemanticKinds)[number];

export const automationCandidateKeyTypes = [
  "REGISTRY_ID",
  "ICO",
  "NAME",
  "MUNICIPALITY",
  "DOMAIN",
  "PHONE",
  "EMAIL",
] as const;
export type AutomationCandidateKeyType = (typeof automationCandidateKeyTypes)[number];

export type AutomationCandidateKey = {
  keyType: AutomationCandidateKeyType;
  namespace: string;
  normalizedValue: string;
};

const SPACE_LIKE = /[\u00a0\u2007\u202f]/g;
const DASH_LIKE = /[\u2010-\u2015\u2212]/g;
const APOSTROPHE_LIKE = /[\u2018\u2019\u02bc]/g;

function baseText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(SPACE_LIKE, " ")
    .replace(DASH_LIKE, "-")
    .replace(APOSTROPHE_LIKE, "'")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAutomationExactText(value: unknown) {
  return baseText(value).toLowerCase();
}

export function normalizeAutomationDiscoveryKey(value: unknown) {
  return normalizeAutomationExactText(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAutomationEmail(value: unknown) {
  const normalized = normalizeAutomationExactText(value);
  if (!normalized || /\s/.test(normalized)) return null;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@") || at === normalized.length - 1) return null;
  return normalized;
}

export function normalizeAutomationDomain(value: unknown) {
  const raw = baseText(value);
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function normalizeAutomationPhone(value: unknown) {
  const raw = baseText(value);
  if (!raw) return null;
  const compact = raw.replace(/[()\s./-]+/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^00\d{8,15}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^0\d{9}$/.test(compact)) return `+421${compact.slice(1)}`;
  return null;
}

export function normalizeAutomationPostalCode(value: unknown) {
  const exact = normalizeAutomationExactText(value);
  if (!exact) return null;
  const compact = exact.replace(/\s+/g, "");
  return /^\d{5}$/.test(compact) ? compact : exact;
}

export function normalizeAutomationAddressComponents(input: {
  municipality?: unknown;
  street?: unknown;
  houseNumber?: unknown;
  postalCode?: unknown;
}) {
  const municipalityExact = normalizeAutomationExactText(input.municipality);
  const streetExact = normalizeAutomationExactText(input.street);
  const houseNumberExact = normalizeAutomationExactText(input.houseNumber);
  return {
    municipality: municipalityExact || null,
    municipalityDiscoveryKey: municipalityExact ? normalizeAutomationDiscoveryKey(municipalityExact) : null,
    street: streetExact || null,
    streetDiscoveryKey: streetExact ? normalizeAutomationDiscoveryKey(streetExact) : null,
    houseNumber: houseNumberExact || null,
    postalCode: normalizeAutomationPostalCode(input.postalCode),
  };
}

export function effectiveAutomationSemanticKind(
  entityType: AutomationEntityType,
  semanticKind: AutomationSemanticKind,
): AutomationSemanticKind {
  if (entityType === "EVENT" && semanticKind === "UNKNOWN") return "EVENT";
  return semanticKind;
}

export function automationSemanticKindsCompatible(
  entityType: AutomationEntityType,
  left: AutomationSemanticKind,
  right: AutomationSemanticKind,
) {
  const a = effectiveAutomationSemanticKind(entityType, left);
  const b = effectiveAutomationSemanticKind(entityType, right);
  if (a === "UNKNOWN" || b === "UNKNOWN") return false;
  return a === b;
}

export function normalizeAutomationCandidateKey(input: {
  keyType: AutomationCandidateKeyType;
  value: unknown;
  namespace?: unknown;
}): AutomationCandidateKey | null {
  let normalizedValue: string | null = null;
  if (input.keyType === "EMAIL") normalizedValue = normalizeAutomationEmail(input.value);
  else if (input.keyType === "DOMAIN") normalizedValue = normalizeAutomationDomain(input.value);
  else if (input.keyType === "PHONE") normalizedValue = normalizeAutomationPhone(input.value);
  else if (input.keyType === "NAME" || input.keyType === "MUNICIPALITY") {
    normalizedValue = normalizeAutomationDiscoveryKey(input.value) || null;
  } else {
    normalizedValue = normalizeAutomationExactText(input.value) || null;
  }
  if (!normalizedValue) return null;
  const namespace = input.keyType === "REGISTRY_ID"
    ? normalizeAutomationExactText(input.namespace)
    : "";
  if (input.keyType === "REGISTRY_ID" && !namespace) return null;
  return { keyType: input.keyType, namespace, normalizedValue };
}
