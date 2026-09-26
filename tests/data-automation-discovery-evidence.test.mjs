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
  assert.match(runner, /query:\\$\{query\}/);
  assert.match(runner, /root\.discoveryType === "RSS"/);
  assert.match(runner, /root\.discoveryType === "SITEMAP"/);
  assert.match(runner, /directory:\\$\{discoveredFrom\}/);
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
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,'\{\}',0,1440/);
  assert.match(store, /'PENDING'/);
});

test("0082 is guarded by production migration tooling but is not auto-applied", () => {
  const script = read("scripts/production-d1-migrate.mjs");
  const workflow = read(".github/workflows/production-d1-migrate.yml");
  assert.match(script, /0082_automation_discovery_candidate_evidence\.sql/);
  assert.match(workflow, /0082_automation_discovery_candidate_evidence\.sql/);
  assert.match(workflow, /APPLY-0082-psipedia-sk-db/);
  assert.doesNotMatch(workflow, /schedule:/);
});
