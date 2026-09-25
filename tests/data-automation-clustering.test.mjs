import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationEntityResolutionStrategyFor,
  canAutomationObservationEnterCluster,
  selectEventClusterCandidate,
} from "../lib/data-automation-clustering.ts";
import {
  normalizeAutomationAddressComponents,
  normalizeAutomationCandidateKey,
  normalizeAutomationDiscoveryKey,
  normalizeAutomationDomain,
  normalizeAutomationEmail,
  normalizeAutomationExactText,
  normalizeAutomationPhone,
} from "../lib/data-automation-identity.ts";

function record(proposed, overrides = {}) {
  return {
    sourceRecordId: overrides.sourceRecordId ?? "source-a-1",
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTimestamp: null,
    rawRecord: proposed,
    proposed,
  };
}

function candidate(id, fields, canonicalEntityId = null) {
  return { id, fields, canonicalEntityId, canonicalEntityKey: canonicalEntityId ? `event:${canonicalEntityId}` : null };
}

test("A. same normalized EVENT title/date/city forms one STRONG cluster", () => {
  const decision = selectEventClusterCandidate(
    record({ title: "  Klubová výstava psov ", startDate: "2026-10-18", city: "Nitra" }),
    [candidate(7, { title: "klubova vystava psov", startDate: "2026-10-18", city: "nitra" })],
  );
  assert.equal(decision.quality, "STRONG");
  assert.equal(decision.candidateId, 7);
});

test("B. same event title with a different date is never auto-clustered", () => {
  const decision = selectEventClusterCandidate(
    record({ title: "Klubová výstava psov", startDate: "2026-10-19", city: "Nitra", organizer: "SKJ" }),
    [candidate(7, { title: "klubova vystava psov", startDate: "2026-10-18", city: "nitra", organizer: "skj" })],
  );
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.candidateId, null);
});

test("C. same date and city with clearly different title/organizer stays separate", () => {
  const decision = selectEventClusterCandidate(
    record({ title: "Agility Cup", startDate: "2026-10-18", city: "Nitra", organizer: "Agility klub" }),
    [candidate(7, { title: "klubova vystava psov", startDate: "2026-10-18", city: "nitra", organizer: "skj" })],
  );
  assert.equal(decision.quality, "NONE");
  assert.equal(decision.candidateId, null);
});

test("generic per-source externalId never creates cross-source EXACT match", () => {
  const decision = selectEventClusterCandidate(
    record({ title: "Event A", startDate: "2026-10-18", city: "Nitra", externalId: "42" }),
    [candidate(9, { title: "iny event", startDate: "2026-11-01", city: "bratislava", externalId: "42" })],
  );
  assert.equal(decision.quality, "NONE");
  assert.equal(decision.candidateId, null);
});

test("exact canonical event URL is deterministic, while ambiguous exact matches require review", () => {
  const input = record({ title: "Event", startDate: "2026-10-18", city: "Nitra", websiteUrl: "https://example.sk/events/42?utm_source=x" });
  const one = selectEventClusterCandidate(input, [
    candidate(3, { websiteUrl: "https://example.sk/events/42" }),
  ]);
  assert.equal(one.quality, "EXACT");
  assert.equal(one.candidateId, 3);

  const many = selectEventClusterCandidate(input, [
    candidate(3, { websiteUrl: "https://example.sk/events/42" }),
    candidate(4, { websiteUrl: "https://example.sk/events/42" }),
  ]);
  assert.equal(many.quality, "POSSIBLE");
  assert.equal(many.candidateId, null);
  assert.deepEqual(many.possibleCandidateIds, [3, 4]);
});

test("D/E/F/G. schema preserves provenance, current evidence, conflicts and canonical linkage", () => {
  const migration = readFileSync(new URL("../drizzle/0073_automation_multisource_entity_resolution.sql", import.meta.url), "utf8");
  for (const table of [
    "automation_entity_clusters",
    "automation_cluster_observations",
    "automation_cluster_source_records",
    "automation_cluster_match_candidates",
    "automation_field_evidence",
    "automation_field_conflicts",
    "automation_source_authority",
    "automation_cluster_findings",
    "automation_cluster_canonical_claims",
  ]) assert.match(migration, new RegExp(`CREATE TABLE \\\`${table}\\\``));

  assert.match(migration, /PRIMARY KEY \(\`source_id\`,\`entity_type\`,\`source_record_id\`\)/);
  assert.match(migration, /raw_value_json/);
  assert.match(migration, /first_seen_at/);
  assert.match(migration, /last_seen_at/);
  assert.match(migration, /is_current/);
  assert.match(migration, /is_preferred/);
  assert.match(migration, /automation_field_conflicts_open_unique/);
  assert.match(migration, /automation_cluster_match_candidates/);
  assert.match(migration, /canonical_entity_id/);
  assert.match(migration, /authority_score/);
});

test("high-impact conflicts do not silently overwrite canonical data", () => {
  const clustering = readFileSync(new URL("../lib/data-automation-clustering.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.match(clustering, /HIGH_IMPACT_EVENT_FIELDS/);
  assert.match(clustering, /status='OPEN'/);
  assert.match(clustering, /existingPreferred/);
  assert.doesNotMatch(clustering, /UPDATE managed_events/i);
  assert.match(runner, /clusterResolution\?\.quality === "POSSIBLE"/);
  assert.match(clustering, /recordClusterMatchCandidates/);
  assert.match(runner, /DUPLICATE_CANDIDATE/);
});

test("NEW_ENTITY apply has a cluster-level unique canonical creation claim", () => {
  const migration = readFileSync(new URL("../drizzle/0073_automation_multisource_entity_resolution.sql", import.meta.url), "utf8");
  const apply = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
  assert.match(migration, /automation_cluster_canonical_claims/);
  assert.match(migration, /cluster_id.*PRIMARY KEY/);
  assert.match(apply, /automation_cluster_canonical_claims/);
  assert.match(apply, /cluster\.canonicalEntityId/);
  assert.match(apply, /cluster\.canonicalEntityId !== finding\.canonicalEntityId/);
  assert.match(apply, /AutomationApplyConflictError/);
});

test("foundation remains additive and can fail open before migration deployment", () => {
  const migration = readFileSync(new URL("../drizzle/0073_automation_multisource_entity_resolution.sql", import.meta.url), "utf8");
  const clustering = readFileSync(new URL("../lib/data-automation-clustering.ts", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE automation_/i);
  assert.match(clustering, /isMissingClusterSchema/);
  assert.match(clustering, /return null/);
});


test("G1 semantic kind hard guards reject incompatible subjects and UNKNOWN", () => {
  assert.equal(canAutomationObservationEnterCluster({
    entityType: "DIRECTORY",
    observationSemanticKind: "PERSON",
    clusterSemanticKind: "FACILITY_OR_SERVICE_PROFILE",
  }), false);
  assert.equal(canAutomationObservationEnterCluster({
    entityType: "ORGANIZATION",
    observationSemanticKind: "LEGAL_ORGANIZATION",
    clusterSemanticKind: "FACILITY",
  }), false);
  assert.equal(canAutomationObservationEnterCluster({
    entityType: "DIRECTORY",
    observationSemanticKind: "UNKNOWN",
    clusterSemanticKind: "UNKNOWN",
  }), false);
  assert.equal(canAutomationObservationEnterCluster({
    entityType: "DIRECTORY",
    observationSemanticKind: "FACILITY_OR_SERVICE_PROFILE",
    clusterSemanticKind: "FACILITY_OR_SERVICE_PROFILE",
  }), true);
});

test("G1 strategy boundary preserves EVENT and keeps non-EVENT fail-safe", () => {
  assert.equal(automationEntityResolutionStrategyFor("EVENT")?.matcherImplemented, true);
  assert.equal(automationEntityResolutionStrategyFor("DIRECTORY")?.matcherImplemented, false);
  assert.equal(automationEntityResolutionStrategyFor("ORGANIZATION")?.matcherImplemented, false);
  assert.equal(automationEntityResolutionStrategyFor("ADOPTION"), null);
});

test("G1 deterministic normalization preserves exact identity separately from discovery keys", () => {
  assert.equal(normalizeAutomationExactText("  Žilina\u00a0–  Klinika  "), "žilina - klinika");
  assert.equal(normalizeAutomationDiscoveryKey("Žilina – Klinika"), "zilina klinika");
  assert.notEqual(normalizeAutomationExactText("Šaľa"), normalizeAutomationDiscoveryKey("Šaľa"));
  assert.equal(normalizeAutomationEmail(" INFO@Example.SK "), "info@example.sk");
  assert.equal(normalizeAutomationDomain("https://WWW.Example.SK./path"), "example.sk");
  assert.equal(normalizeAutomationPhone("0903 123 456"), "+421903123456");
  assert.equal(normalizeAutomationPhone("+420 603 123 456"), "+420603123456");
  assert.equal(normalizeAutomationPhone("603123456"), null);
  assert.deepEqual(normalizeAutomationAddressComponents({
    municipality: " Nové  Zámky ",
    street: "M. R. Štefánika",
    houseNumber: " 12/A ",
    postalCode: "940 01",
  }), {
    municipality: "nové zámky",
    municipalityDiscoveryKey: "nove zamky",
    street: "m. r. štefánika",
    streetDiscoveryKey: "m r stefanika",
    houseNumber: "12/a",
    postalCode: "94001",
  });
});

test("G1 namespaced registry identity is explicit and generic source ids are not candidate keys", () => {
  assert.deepEqual(normalizeAutomationCandidateKey({
    keyType: "REGISTRY_ID",
    namespace: "RPO",
    value: " 12345 ",
  }), { keyType: "REGISTRY_ID", namespace: "rpo", normalizedValue: "12345" });
  assert.equal(normalizeAutomationCandidateKey({ keyType: "REGISTRY_ID", value: "12345" }), null);
});

test("G1 candidate lookup foundation is indexed, bounded and migration is additive", () => {
  const migration = readFileSync(new URL("../drizzle/0076_automation_non_event_entity_resolution_foundation.sql", import.meta.url), "utf8");
  const clustering = readFileSync(new URL("../lib/data-automation-clustering.ts", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN \`semantic_kind\`/);
  assert.match(migration, /automation_entity_candidate_keys/);
  assert.match(migration, /automation_entity_candidate_keys_lookup_idx/);
  assert.match(migration, /entity_type.*semantic_kind.*key_type.*key_namespace.*normalized_value/s);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+(directory_profiles|help_organizations|automation_entity_clusters)/i);
  assert.match(clustering, /FROM automation_entity_candidate_keys k/);
  assert.match(clustering, /k\.entity_type=\? AND k\.semantic_kind=\?/);
  assert.match(clustering, /LIMIT \?/);
  assert.doesNotMatch(clustering, /FROM automation_entity_clusters[^\n]*WHERE entity_type=\?[^\n]*semantic_kind=\?[^\n]*ORDER BY[^\n]*LIMIT 250/i);
});

test("G1 EVENT regression keeps legacy EVENT matching semantics unchanged", () => {
  const clustering = readFileSync(new URL("../lib/data-automation-clustering.ts", import.meta.url), "utf8");
  assert.match(clustering, /same_source_record_history/);
  assert.match(clustering, /shared_external_identifier_or_canonical_url/);
  assert.match(clustering, /exact_normalized_title_start_date_city/);
  assert.match(clustering, /multiple_exact_cluster_candidates_require_review/);
  assert.match(clustering, /HIGH_IMPACT_EVENT_FIELDS/);
  assert.match(clustering, /createCluster\(input\.source\.entityType, input\.detectedAt/);
  assert.equal(clustering.includes("INSERT INTO automation_entity_clusters (entity_type,semantic_kind"), false);
});
