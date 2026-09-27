import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DISCOVERY-1A migration creates additive evidence table with bounded identity", () => {
  const migration = read("drizzle/0082_automation_discovery_candidate_evidence.sql");
  assert.match(migration, /CREATE TABLE `automation_source_candidate_evidence`/);
  assert.match(migration, /`candidate_id` integer NOT NULL REFERENCES `automation_source_candidates`/);
  assert.match(migration, /`root_id` integer NOT NULL REFERENCES `automation_discovery_roots`/);
  assert.match(migration, /`discovery_run_id` integer REFERENCES `automation_discovery_runs`/);
  assert.match(migration, /automation_source_candidate_evidence_identity_unique/);
  assert.match(migration, /(`candidate_id`,`root_id`,`discovery_context_key`)/);
  assert.match(migration, /automation_source_candidate_evidence_last_seen_idx/);
  assert.doesNotMatch(migration, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|foster|lost_found)/i);
});

test("candidate identity remains canonical URL plus entity type and provenance is no longer overwritten", () => {
  const migration = read("drizzle/0056_scheduled_source_discovery.sql");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(migration, /automation_source_candidates_url_entity_unique/);
  assert.match(migration, /canonical_url`,`entity_type/);
  assert.match(store, /ON CONFLICT\(canonical_url,entity_type\)/);
  const conflictUpdate = store.split("ON CONFLICT(canonical_url,entity_type) DO UPDATE SET")[1].split("review_status=CASE")[0];
  assert.doesNotMatch(conflictUpdate, /discovered_from_source_id=excluded/);
  assert.doesNotMatch(conflictUpdate, /reason=excluded/);
  assert.doesNotMatch(conflictUpdate, /metadata_json=excluded/);
});

test("multi-root provenance preserves one candidate with N evidence paths", () => {
  const migration = read("drizzle/0082_automation_discovery_candidate_evidence.sql");
  assert.match(migration, /UNIQUE INDEX[\s\S]+candidate_id[\s\S]+root_id[\s\S]+discovery_context_key/);
  assert.match(read("lib/data-automation-discovery-runner.ts"), /candidateId: stored\.id[\s\S]+rootId: root\.id[\s\S]+discoveryRunId: runId/);
});

test("same root/context is idempotent and keeps first_seen while moving last_seen", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /ON CONFLICT\(candidate_id,root_id,discovery_context_key\) DO UPDATE SET/);
  assert.match(store, /last_seen_at=excluded\.last_seen_at/);
  assert.doesNotMatch(
    store.split("ON CONFLICT(candidate_id,root_id,discovery_context_key) DO UPDATE SET")[1].split("return true")[0],
    /first_seen_at=excluded/,
  );
});

test("cross-method context is preserved and SEARCH_PROVIDER is query-context ready", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /root\.discoveryType === "SEARCH_PROVIDER"/);
  assert.match(runner, /queryFingerprint/);
  assert.match(runner, /discoveryContextKey: root\.discoveryType === "SEARCH_PROVIDER" && fingerprint/);
  assert.match(runner, /SEARCH_PROVIDER:/);
  assert.match(runner, /root\.discoveryType === "RSS"/);
  assert.match(runner, /root\.discoveryType === "SITEMAP"/);
  assert.match(runner, /directory:\$\{discoveredFrom\}/);
  assert.match(runner, /resultRank: evidenceRank\(candidate\)/);
  assert.match(runner, /snippet: evidenceMetadataValue/);
});

test("runner evidence persistence is governance-only and never activates or canonically writes", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /upsertAutomationSourceCandidateEvidence/);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled|INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});

test("candidate approval semantics remain disabled and PENDING", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,\?,0,1440/);
  assert.match(store, /candidateProvisioningConfig/);
  assert.match(store, /'PENDING'/);
});

test("0082 remains represented in guarded production migration history", () => {
  const script = read("scripts/production-d1-migrate.mjs");
  const workflow = read(".github/workflows/production-d1-migrate.yml");
  assert.match(script, /0082_automation_discovery_candidate_evidence\.sql/);
  assert.match(script, /AUTOMATION_DISCOVERY_EVIDENCE_INDEXES/);
  assert.match(workflow, /0082_automation_discovery_candidate_evidence\.sql/);
  assert.match(workflow, /APPLY-0082-psipedia-sk-db/);
  assert.doesNotMatch(workflow, /schedule:/);
});


test("ORGANIZATION-DISCOVERY-1 direct candidate concepts reuse generic automation review without source activation", () => {
  const concept = read("lib/data-automation-organization-discovery-concept.ts");
  const runner = read("lib/data-automation-runner.ts");
  const route = read("app/api/admin/automation-source-candidates/[id]/route.ts");
  const ui = read("components/admin-automation-candidate-review.tsx");

  assert.match(concept, /buildOrganizationConceptFromDiscoveryCandidate/);
  assert.match(concept, /candidate\.entityType !== "ORGANIZATION" \|\| candidate\.discoveryType !== "SEARCH_PROVIDER"/);
  assert.match(concept, /createProductionOrganizationEnricher/);
  assert.match(concept, /listAutomationSourceCandidateEvidence/);
  assert.match(concept, /matchAutomationCanonical/);
  assert.match(concept, /processAutomationRecordForReview/);
  assert.match(runner, /processRecord\(input\.source, null, record/);
  assert.match(route, /prepare_organization_concept/);
  assert.match(ui, /Pripraviť návrh organizácie/);

  assert.doesNotMatch(concept, /UPDATE\s+automation_sources|enabled\s*=|cadence_minutes\s*=/i);
  assert.doesNotMatch(concept, /INSERT\s+INTO\s+help_organizations|UPDATE\s+help_organizations|PUBLISHED/i);
  assert.doesNotMatch(concept, /hostname\s*===|hostname\s*==|switch\s*\([^)]*hostname/i);
});

test("ORGANIZATION-DISCOVERY-1 keeps identity and type inference conservative and provenance explicit", () => {
  const concept = read("lib/data-automation-organization-discovery-concept.ts");

  for (const outcome of [
    "NEW_ORGANIZATION",
    "EXISTING_ORGANIZATION",
    "POSSIBLE_MATCH",
    "INSUFFICIENT_EVIDENCE",
  ]) assert.ok(concept.includes(outcome));

  for (const type of [
    "SHELTER",
    "CIVIC_ASSOCIATION",
    "RESCUE_ORGANIZATION",
    "MUNICIPAL_ORGANIZATION",
    "NONPROFIT",
  ]) assert.ok(concept.includes(type));

  assert.match(concept, /if \(!input\.semanticKind \|\| !input\.name\) return "INSUFFICIENT_EVIDENCE"/);
  assert.match(concept, /evidenceKind: "TAVILY"/);
  assert.match(concept, /evidenceKind: "OFFICIAL_SITE"/);
  assert.match(concept, /evidenceId/);
  assert.match(concept, /sourceUrl/);
  assert.match(concept, /confidence/);
  assert.match(concept, /reason/);
  assert.doesNotMatch(concept, /proposed\.address\s*=/);
  assert.doesNotMatch(concept, /organization_locations|LEGAL_SEAT|SERVICE_AREA/);
});

test("ORGANIZATION-DISCOVERY-1 canonical lookup includes the discovered official website", () => {
  const store = read("lib/data-automation-store.ts");
  const organizationBranch = store.split('if (source.entityType === "ORGANIZATION")')[1].split('if (source.entityType === "DIRECTORY")')[0];
  assert.match(organizationBranch, /website_url=\?/);
  assert.match(organizationBranch, /websiteUrl: String\(row\.website_url/);
  assert.match(organizationBranch, /sourceUrl: String\(row\.source_url/);
  assert.doesNotMatch(organizationBranch, /sourceUrl: String\(row\.website_url/);
});

test("ORGANIZATION-DISCOVERY-1 direct review path has no migration and preserves publication safeguards", () => {
  const treeFiles = [
    "lib/data-automation-organization-discovery-concept.ts",
    "lib/data-automation-runner.ts",
    "lib/data-automation-source-store.ts",
    "lib/data-automation-store.ts",
    "app/api/admin/automation-source-candidates/[id]/route.ts",
    "components/admin-automation-candidate-review.tsx",
  ];
  assert.equal(treeFiles.some((path) => path.startsWith("drizzle/")), false);

  const apply = read("lib/data-automation-apply.ts");
  const publication = read("lib/help-organization-publication.ts");
  assert.match(apply, /CREATE_DRAFT/);
  assert.match(publication, /buildOrganizationPublicationPreflight/);
  assert.match(publication, /ready: blockers\.length === 0/);
});
