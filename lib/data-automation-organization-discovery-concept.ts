import { createProductionOrganizationEnricher } from "./data-automation-organization-enrichment.ts";
import { organizationActionableProposal } from "./data-automation-organization-diff.ts";
import type { AutomationFetch } from "./data-automation-connectors.ts";
import { matchAutomationCanonical } from "./data-automation-store.ts";
import { processAutomationRecordForReview } from "./data-automation-runner.ts";
import {
  getAutomationSourceAdmin,
  getAutomationSourceCandidate,
  listAutomationSourceCandidateEvidence,
  sourceAdminRowToRuntimeSource,
  type AutomationSourceCandidateEvidenceRow,
} from "./data-automation-source-store.ts";
import type { AutomationSourceRecord } from "./data-automation.ts";

export type OrganizationDiscoveryConceptOutcome =
  | "NEW_ORGANIZATION"
  | "EXISTING_ORGANIZATION"
  | "POSSIBLE_MATCH"
  | "INSUFFICIENT_EVIDENCE";

export type OrganizationConceptProvenance = {
  field: string;
  sourceCandidateId: number;
  sourceUrl: string;
  evidenceId: number | null;
  evidenceKind: "TAVILY" | "OFFICIAL_SITE";
  title: string | null;
  snippet: string | null;
  confidence: "HIGH" | "MEDIUM";
  reason: string;
};

export type OrganizationDiscoveryConcept = {
  candidateId: number;
  outcome: OrganizationDiscoveryConceptOutcome;
  proposed: Record<string, unknown>;
  provenance: OrganizationConceptProvenance[];
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  matchQuality: string;
  matchReason: string;
  findingId: number | null;
  sourceId: number;
  sourceStatus: {
    enabled: boolean;
    reviewStatus: string;
    connectorType: string;
  };
};

type BuildOptions = {
  database: D1Database;
  candidateId: number;
  now?: Date;
  fetchImpl?: AutomationFetch;
};

const WEBSITE_FIELDS = [
  "publicEmail",
  "publicPhone",
  "facebookUrl",
  "instagramUrl",
  "registrationNumber",
  "shortDescription",
  "imageUrl",
] as const;

function text(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function evidenceText(evidence: AutomationSourceCandidateEvidenceRow[]) {
  return evidence
    .flatMap((item) => [item.title, item.snippet])
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function classifyOrganizationEvidence(value: string) {
  const normalized = value.toLocaleLowerCase("sk-SK");
  if (/\b(mesto|obec|mestsk[aáeé]|obecn[aáeé])\b/.test(normalized)) {
    return { semanticKind: "PUBLIC_ORGANIZATION", type: "MUNICIPAL_ORGANIZATION" };
  }
  if (/\b(občianske združenie|obcianske zdruzenie|o\. ?z\.|\boz\b)/.test(normalized)) {
    return { semanticKind: "LEGAL_ORGANIZATION", type: "CIVIC_ASSOCIATION" };
  }
  if (/\b(neziskov[aá]|n\. ?o\.)\b/.test(normalized)) {
    return { semanticKind: "LEGAL_ORGANIZATION", type: "NONPROFIT" };
  }
  if (/\b(útulok|utulok|rescue|záchran|zachran|dočasn[aá] opatera|docasn[aá] opatera)\b/.test(normalized)) {
    return {
      semanticKind: "RESCUE_GROUP",
      type: /\b(útulok|utulok)\b/.test(normalized) ? "SHELTER" : "RESCUE_ORGANIZATION",
    };
  }
  return { semanticKind: null, type: null };
}

function bestEvidence(evidence: AutomationSourceCandidateEvidenceRow[]) {
  return evidence.find((item) => item.discoveryType === "SEARCH_PROVIDER" && item.title)
    ?? evidence.find((item) => item.title)
    ?? evidence[0]
    ?? null;
}

function supportedMetadata(candidateMetadata: Record<string, unknown>, key: string) {
  const value = text(candidateMetadata[key]);
  return value && value.length <= 500 ? value : null;
}

function provenanceForInitialField(input: {
  field: string;
  candidateId: number;
  sourceUrl: string;
  evidence: AutomationSourceCandidateEvidenceRow | null;
  confidence: "HIGH" | "MEDIUM";
  reason: string;
}): OrganizationConceptProvenance {
  return {
    field: input.field,
    sourceCandidateId: input.candidateId,
    sourceUrl: input.sourceUrl,
    evidenceId: input.evidence?.id ?? null,
    evidenceKind: "TAVILY",
    title: input.evidence?.title ?? null,
    snippet: input.evidence?.snippet ?? null,
    confidence: input.confidence,
    reason: input.reason,
  };
}

function sourceRecord(input: {
  candidateId: number;
  sourceUrl: string;
  candidateLabel: string;
  candidateMetadata: Record<string, unknown>;
  evidence: AutomationSourceCandidateEvidenceRow[];
}) {
  const primary = bestEvidence(input.evidence);
  const proposedName = text(primary?.title) ?? text(input.candidateLabel);
  const classification = classifyOrganizationEvidence([
    proposedName,
    evidenceText(input.evidence),
  ].filter(Boolean).join(" "));
  const city = supportedMetadata(input.candidateMetadata, "city")
    ?? supportedMetadata(primary?.metadata ?? {}, "city");
  const region = supportedMetadata(input.candidateMetadata, "region")
    ?? supportedMetadata(primary?.metadata ?? {}, "region");
  const district = supportedMetadata(input.candidateMetadata, "district")
    ?? supportedMetadata(primary?.metadata ?? {}, "district");

  const proposed: Record<string, unknown> = {
    name: proposedName,
    websiteUrl: input.sourceUrl,
    sourceUrl: input.sourceUrl,
    countryCode: "SK",
  };
  if (classification.semanticKind) proposed.semanticKind = classification.semanticKind;
  if (classification.type) proposed.type = classification.type;
  if (city) proposed.city = city;
  if (region) proposed.region = region;
  if (district) proposed.district = district;

  const provenance: OrganizationConceptProvenance[] = [];
  if (proposedName) {
    provenance.push(provenanceForInitialField({
      field: "name",
      candidateId: input.candidateId,
      sourceUrl: input.sourceUrl,
      evidence: primary,
      confidence: "MEDIUM",
      reason: "Názov pochádza z title SEARCH_PROVIDER evidence a ostáva predmetom ľudského review.",
    }));
  }
  provenance.push(provenanceForInitialField({
    field: "websiteUrl",
    candidateId: input.candidateId,
    sourceUrl: input.sourceUrl,
    evidence: primary,
    confidence: "HIGH",
    reason: "Canonical URL je priamo URL discovery candidate.",
  }));
  for (const [field, value] of [["city", city], ["region", region], ["district", district]] as const) {
    if (!value) continue;
    provenance.push(provenanceForInitialField({
      field,
      candidateId: input.candidateId,
      sourceUrl: input.sourceUrl,
      evidence: primary,
      confidence: "MEDIUM",
      reason: "Pole je explicitne prítomné v discovery metadata; nevzniklo hádaním zo snippetu.",
    }));
  }
  if (classification.type) {
    provenance.push(provenanceForInitialField({
      field: "type",
      candidateId: input.candidateId,
      sourceUrl: input.sourceUrl,
      evidence: primary,
      confidence: "MEDIUM",
      reason: "Typ je odvodený iba z explicitného organizačného označenia v názve/evidence a mapovaný na existujúci enum.",
    }));
  }

  const record: AutomationSourceRecord = {
    sourceRecordId: "discovery-candidate:" + input.candidateId,
    sourceUrl: input.sourceUrl,
    sourceTimestamp: primary?.lastSeenAt ?? null,
    rawRecord: {
      discoveryCandidateId: input.candidateId,
      evidenceIds: input.evidence.map((item) => item.id),
      discoveryEvidence: input.evidence.map((item) => ({
        id: item.id,
        rootId: item.rootId,
        discoveryRunId: item.discoveryRunId,
        discoveryType: item.discoveryType,
        discoveryContext: item.discoveryContext,
        resultRank: item.resultRank,
        title: item.title,
        snippet: item.snippet,
        externalId: item.externalId,
        metadata: item.metadata,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
      })),
    },
    proposed,
  };
  return { record, provenance, semanticKind: classification.semanticKind };
}

function enrichmentProvenance(input: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  candidateId: number;
  sourceUrl: string;
}) {
  const result: OrganizationConceptProvenance[] = [];
  for (const field of WEBSITE_FIELDS) {
    if (text(input.before[field]) || !text(input.after[field])) continue;
    result.push({
      field,
      sourceCandidateId: input.candidateId,
      sourceUrl: input.sourceUrl,
      evidenceId: null,
      evidenceKind: "OFFICIAL_SITE",
      title: null,
      snippet: null,
      confidence: field === "registrationNumber" ? "HIGH" : "MEDIUM",
      reason: "Pole bolo získané generic official-site enrichmentom s bounded/SSRF-safe fetchom.",
    });
  }
  return result;
}

function outcomeFromMatch(input: {
  semanticKind: string | null;
  name: string | null;
  match: Awaited<ReturnType<typeof matchAutomationCanonical>>;
}) {
  if (!input.semanticKind || !input.name) return "INSUFFICIENT_EVIDENCE" as const;
  if (input.match.entityId && input.match.quality !== "UNCERTAIN" && input.match.quality !== "NONE") {
    return "EXISTING_ORGANIZATION" as const;
  }
  if (input.match.quality === "UNCERTAIN" || (input.match.candidates?.length ?? 0) > 0) {
    return "POSSIBLE_MATCH" as const;
  }
  return "NEW_ORGANIZATION" as const;
}

export async function buildOrganizationConceptFromDiscoveryCandidate(
  options: BuildOptions,
): Promise<OrganizationDiscoveryConcept> {
  const candidate = await getAutomationSourceCandidate(options.candidateId, options.database);
  if (!candidate) throw new Error("automation_candidate_not_found");
  if (candidate.entityType !== "ORGANIZATION" || candidate.discoveryType !== "SEARCH_PROVIDER") {
    throw new Error("automation_candidate_not_direct_organization_lead");
  }
  if (candidate.reviewStatus !== "APPROVED") {
    throw new Error("automation_candidate_review_required");
  }
  if (!candidate.duplicateSourceId) {
    throw new Error("automation_candidate_source_missing");
  }

  const sourceAdmin = await getAutomationSourceAdmin(candidate.duplicateSourceId, options.database);
  if (!sourceAdmin || sourceAdmin.entityType !== "ORGANIZATION") {
    throw new Error("automation_candidate_organization_source_missing");
  }
  const source = sourceAdminRowToRuntimeSource(sourceAdmin);
  const evidence = await listAutomationSourceCandidateEvidence(candidate.id, options.database);
  const built = sourceRecord({
    candidateId: candidate.id,
    sourceUrl: candidate.canonicalUrl,
    candidateLabel: candidate.label,
    candidateMetadata: candidate.metadata,
    evidence,
  });
  const before = { ...built.record.proposed };
  const enricher = createProductionOrganizationEnricher({ fetchImpl: options.fetchImpl });
  const enriched = await enricher(built.record, { detectedAt: (options.now ?? new Date()).toISOString() });
  const provenance = [
    ...built.provenance,
    ...enrichmentProvenance({
      before,
      after: enriched.proposed,
      candidateId: candidate.id,
      sourceUrl: candidate.canonicalUrl,
    }),
  ];

  const match = await matchAutomationCanonical(source, enriched, options.database);
  const outcome = outcomeFromMatch({
    semanticKind: built.semanticKind,
    name: text(enriched.proposed.name),
    match,
  });

  let findingId: number | null = null;
  let matchReason = outcome === "INSUFFICIENT_EVIDENCE"
    ? "organization_semantic_kind_or_name_insufficient"
    : match.quality;

  if (outcome !== "INSUFFICIENT_EVIDENCE") {
    const findingProposal = organizationActionableProposal(enriched.proposed, match.before);
    const processed = await processAutomationRecordForReview({
      source,
      record: enriched,
      findingProposal,
      database: options.database,
      now: options.now,
    });
    if ("id" in processed && Number.isSafeInteger(Number(processed.id))) {
      findingId = Number(processed.id);
    }
    matchReason = processed.finding ?? matchReason;
  }

  return {
    candidateId: candidate.id,
    outcome,
    proposed: enriched.proposed,
    provenance,
    canonicalEntityId: match.entityId ?? null,
    canonicalEntityKey: match.entityKey ?? null,
    matchQuality: match.quality,
    matchReason,
    findingId,
    sourceId: source.id,
    sourceStatus: {
      enabled: source.enabled,
      reviewStatus: source.reviewStatus,
      connectorType: source.connectorType,
    },
  };
}
