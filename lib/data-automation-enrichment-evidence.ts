import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  type AutomationEntityType,
} from "./data-automation.ts";
import type { AutomationSearchResult } from "./data-automation-discovery.ts";
import { normalizeAutomationEmail, normalizeAutomationPhone } from "./data-automation-identity.ts";
import {
  automationEntityEnrichmentTemplate,
  type AutomationEnrichmentGroup,
} from "./data-automation-enrichment-template.ts";
import { normalizeAutomationEnrichmentProposal } from "./data-automation-enrichment-normalize.ts";

export type AutomationEnrichmentEvidenceType =
  | "FIRST_PARTY_STRUCTURED" | "FIRST_PARTY_PAGE" | "TRUSTED_REGISTER"
  | "SOURCE_DETAIL" | "SEARCH_SNIPPET" | "VERIFIED_PROVIDER";

export type AutomationFieldEvidence = {
  value: unknown;
  sourceUrl: string | null;
  evidenceType: AutomationEnrichmentEvidenceType;
};

export type AutomationEnrichmentSearchPlan = {
  group: AutomationEnrichmentGroup;
  query: string;
  missingFields: string[];
  sameDomain: string | null;
};

function safeText(value: unknown, max = 180) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

function host(value: string | null | undefined) {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    return new URL(canonical).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function label(entityType: AutomationEntityType, proposed: Record<string, unknown>) {
  const candidates =
    entityType === "EVENT" ? [proposed.title]
    : entityType === "FOSTER" || entityType === "HELP_ITEM" ? [proposed.dogName, proposed.title]
    : entityType === "LOST_FOUND" ? [proposed.dogName]
    : [proposed.name];
  return candidates.map((value) => safeText(value)).find(Boolean) ?? null;
}

export function automationEnrichmentSearchPlans(input: {
  entityType: AutomationEntityType;
  proposed: Record<string, unknown>;
  sourceUrl?: string | null;
  maxPlans?: number;
}) {
  if (input.entityType === "LOST_FOUND") return [];

  const template = automationEntityEnrichmentTemplate(input.entityType);
  const proposed = normalizeAutomationEnrichmentProposal(input.entityType, input.proposed);
  const entityLabel = label(input.entityType, proposed);
  if (!entityLabel) return [];

  const sameDomain = host(
    input.sourceUrl
      ?? String(proposed.websiteUrl ?? proposed.sourceUrl ?? proposed.externalSourceUrl ?? proposed.actionUrl ?? ""),
  );
  const groups = new Map<AutomationEnrichmentGroup, string[]>();
  const triggers = new Set<AutomationEnrichmentGroup>();

  for (const field of Object.values(template.fields)) {
    if (!field.enrichmentAllowed || !field.group) continue;
    if (Object.prototype.hasOwnProperty.call(proposed, field.canonicalField)) continue;
    // DIRECTORY location remains owned by the existing address evidence -> Geoapify pipeline.
    if (input.entityType === "DIRECTORY" && field.group === "LOCATION") continue;
    groups.set(field.group, [...(groups.get(field.group) ?? []), field.canonicalField]);
    if (field.priority === "HIGH_VALUE") triggers.add(field.group);
  }

  const terms: Record<AutomationEnrichmentGroup, string> = {
    CONTACT: "kontakt telefón email facebook instagram",
    LOCATION: "adresa sídlo lokalita",
    DETAIL: input.entityType === "EVENT"
      ? "detail registrácia organizátor miesto"
      : "o nás služby informácie",
  };

  const plans: AutomationEnrichmentSearchPlan[] = [];
  const maxPlans = Math.max(0, Math.min(2, input.maxPlans ?? 2));
  for (const group of ["CONTACT","DETAIL","LOCATION"] as const) {
    const missingFields = groups.get(group);
    if (!missingFields?.length || !triggers.has(group)) continue;
    const query = [entityLabel, sameDomain ? "site:" + sameDomain : "", terms[group]]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 500);
    plans.push({ group, query, missingFields, sameDomain });
    if (plans.length >= maxPlans) break;
  }
  return plans;
}

function sameHost(left: string | null | undefined, right: string | null | undefined) {
  const a = host(left);
  const b = host(right);
  return Boolean(a && b && (a === b || a.endsWith("." + b) || b.endsWith("." + a)));
}

export function automationEnrichmentIdentityMatches(input: {
  entityType: AutomationEntityType;
  proposed: Record<string, unknown>;
  sourceUrl?: string | null;
  result: AutomationSearchResult;
}) {
  if (sameHost(input.sourceUrl, input.result.url)) return true;

  const proposed = normalizeAutomationEnrichmentProposal(input.entityType, input.proposed);
  const entityLabel = label(input.entityType, proposed);
  if (!entityLabel) return false;

  const needle = normalizeAutomationIdentity(entityLabel);
  const haystack = normalizeAutomationIdentity(
    String(input.result.title) + " " + String(input.result.snippet ?? ""),
  );
  if (!needle || !haystack) return false;
  if (haystack.includes(needle)) {
    const city = safeText(proposed.city, 100);
    return !city || haystack.includes(normalizeAutomationIdentity(city));
  }

  const stop = new Set([
    "utulok","veterinarna","ambulancia","klinika","obcianske","zdruzenie",
    "hotel","trener","podujatie",
  ]);
  const tokens = needle.split(" ").filter((value) => value.length >= 4 && !stop.has(value));
  if (!tokens.length) return false;
  if (tokens.filter((value) => haystack.includes(value)).length < Math.min(2, tokens.length)) return false;
  const city = safeText(proposed.city, 100);
  return !city || haystack.includes(normalizeAutomationIdentity(city));
}

function normalizedEmail(value: string) {
  const result = normalizeAutomationEmail(value);
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null;
}

function normalizedPhone(value: string) {
  return normalizeAutomationPhone(value);
}

function socialUrl(value: string, service: "facebook" | "instagram") {
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    const h = url.hostname.toLowerCase().replace(/^www\./, "");
    if (service === "facebook") {
      if (!["facebook.com","m.facebook.com","fb.com"].includes(h)) return null;
      if (!url.pathname || url.pathname === "/" || /^\/(?:sharer|share\.php|dialog|login)(?:\/|$)/i.test(url.pathname)) return null;
    } else {
      if (h !== "instagram.com") return null;
      if (!url.pathname || url.pathname === "/" || /^\/(?:accounts|developer|login)(?:\/|$)/i.test(url.pathname)) return null;
    }
    return canonical;
  } catch {
    return null;
  }
}

export function automationSearchSnippetEvidence(
  entityType: AutomationEntityType,
  group: AutomationEnrichmentGroup,
  result: AutomationSearchResult,
) {
  const content = String(result.title) + " " + String(result.snippet ?? "");
  const output: Record<string, unknown> = {};

  if (group === "CONTACT") {
    const emails = [...content.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)]
      .map((match) => normalizedEmail(match[0])).filter((value): value is string => Boolean(value));
    const phones = [...content.matchAll(/(?:\+421|00421|0)[\s().\/-]*\d(?:[\s().\/-]*\d){8}/g)]
      .map((match) => normalizedPhone(match[0])).filter((value): value is string => Boolean(value));
    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    if (uniqueEmails.length === 1) output.publicEmail = uniqueEmails[0];
    if (uniquePhones.length === 1) output.publicPhone = uniquePhones[0];

    const facebook = socialUrl(result.url, "facebook");
    const instagram = socialUrl(result.url, "instagram");
    if (facebook) output.facebookUrl = facebook;
    if (instagram) output.instagramUrl = instagram;
  }

  if (group === "DETAIL" && (entityType === "DIRECTORY" || entityType === "ORGANIZATION")) {
    const snippet = safeText(result.snippet, 1000);
    if (snippet && snippet.length >= 80) output.description = snippet;
  }

  return output;
}

const evidenceRank: Record<AutomationEnrichmentEvidenceType, number> = {
  VERIFIED_PROVIDER: 700,
  FIRST_PARTY_STRUCTURED: 600,
  FIRST_PARTY_PAGE: 500,
  TRUSTED_REGISTER: 450,
  SOURCE_DETAIL: 400,
  SEARCH_SNIPPET: 250,
};

export function mergeAutomationEnrichmentEvidence(input: {
  entityType: AutomationEntityType;
  base: Record<string, unknown>;
  incoming: Record<string, unknown>;
  evidenceType: AutomationEnrichmentEvidenceType;
  sourceUrl?: string | null;
  existingEvidence?: Record<string, AutomationFieldEvidence>;
}) {
  const base = normalizeAutomationEnrichmentProposal(input.entityType, input.base);
  const incoming = normalizeAutomationEnrichmentProposal(input.entityType, input.incoming);
  const evidence: Record<string, AutomationFieldEvidence> = { ...(input.existingEvidence ?? {}) };
  const proposed = { ...base };
  const added: string[] = [];
  const conflicts: string[] = [];

  for (const [key, value] of Object.entries(base)) {
    evidence[key] ??= { value, sourceUrl: null, evidenceType: "FIRST_PARTY_PAGE" };
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (proposed[key] === undefined) {
      proposed[key] = value;
      evidence[key] = {
        value,
        sourceUrl: canonicalizeSourceUrl(input.sourceUrl),
        evidenceType: input.evidenceType,
      };
      added.push(key);
      continue;
    }
    if (JSON.stringify(proposed[key]) === JSON.stringify(value)) continue;

    const current = evidence[key];
    const currentRank = current ? evidenceRank[current.evidenceType] : evidenceRank.FIRST_PARTY_PAGE;
    if (evidenceRank[input.evidenceType] > currentRank) {
      proposed[key] = value;
      evidence[key] = {
        value,
        sourceUrl: canonicalizeSourceUrl(input.sourceUrl),
        evidenceType: input.evidenceType,
      };
    } else {
      conflicts.push(key);
    }
  }

  return { proposed, evidence, added, conflicts: [...new Set(conflicts)] };
}
