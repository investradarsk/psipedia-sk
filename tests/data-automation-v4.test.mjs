import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { htmlLinkDirectoryDiscovery } from "../lib/data-automation-discovery.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const fixture = (name) => readFileSync(new URL("./fixtures/data-automation/" + name, import.meta.url), "utf8");

test("trusted HTML directory discovery emits external HTTPS candidates only", () => {
  const rows = htmlLinkDirectoryDiscovery({
    payload: fixture("skj-club-links.html"),
    baseUrl: "https://skj.sk/sk/skj-sekretariat/klubove-web-stranky/",
    entityType: "DIRECTORY",
    suggestedConnectorType: "CONTROLLED_HTML",
    externalOnly: true,
    excludeHosts: ["skj.sk", "fci.be"],
    maxCandidates: 150,
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].candidateType, "SOURCE_CANDIDATE");
  assert.equal(rows[0].sourceUrl, "https://alpha-klub.sk/");
  assert.equal(rows[0].entityType, "DIRECTORY");
  assert.equal(rows[1].sourceUrl, "https://beta-klub.sk/o-nas");
  assert.ok(rows.every((row) => row.suggestedConnectorType === "CONTROLLED_HTML"));
});

test("AUTOMATION-4 has a separate reviewed due-root scheduler", () => {
  const migration = read("drizzle/0056_scheduled_source_discovery.sql");
  const store = read("lib/data-automation-discovery-store.ts");
  assert.match(migration, /CREATE TABLE `automation_discovery_roots`/);
  assert.match(migration, /CREATE TABLE `automation_discovery_runs`/);
  assert.match(store, /enabled=1 AND review_status='APPROVED'/);
  assert.match(store, /next_check_at IS NULL OR next_check_at<=\?/);
  assert.match(store, /nextAutomationDiscoveryCheckAt/);
});

test("scheduled worker runs discovery independently from normal source monitoring", () => {
  const worker = read("worker/index.ts");
  const runner = read("lib/data-automation-discovery-runner.ts");
  const wrangler = read("wrangler.jsonc");

  assert.match(worker, /runDataAutomationSweep/);
  assert.match(worker, /runDataAutomationDiscoverySweep/);
  assert.match(worker, /data_automation_discovery_sweep/);
  assert.match(wrangler, /"crons": \["0 \* \* \* \*"/);
  assert.match(runner, /DATA_AUTOMATION_MAX_DISCOVERY_ROOTS_PER_SWEEP = 2/);
  assert.match(runner, /listDueAutomationDiscoveryRoots/);
});

test("discovery can only create candidates, never active sources or canonical content", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /upsertAutomationSourceCandidate/);
  assert.doesNotMatch(runner, /INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled/);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)/i);

  const sourceStore = read("lib/data-automation-source-store.ts");
  assert.match(sourceStore, /enabled,\s*cadence_minutes/);
  assert.match(sourceStore, /VALUES \(\?,\?,\?,\?,\?,'\{\}',0,1440/);
  assert.match(sourceStore, /'PENDING'/);
});

test("candidate identity is URL plus entity type and expired suppression can reopen", () => {
  const migration = read("drizzle/0056_scheduled_source_discovery.sql");
  const sourceStore = read("lib/data-automation-source-store.ts");

  assert.match(migration, /automation_source_candidates_url_entity_unique/);
  assert.match(migration, /canonical_url`,`entity_type/);
  assert.match(sourceStore, /ON CONFLICT\(canonical_url,entity_type\)/);
  assert.match(sourceStore, /review_status='SUPPRESSED'/);
  assert.match(sourceStore, /suppressed_until<=excluded\.last_detected_at/);
  assert.match(sourceStore, /WHERE canonical_url=\? AND entity_type=\?/);
});

test("seeded discovery root is explicit, reviewed, bounded and non-publishing", () => {
  const migration = read("drizzle/0056_scheduled_source_discovery.sql");
  assert.match(migration, /skj-club-web-directory/);
  assert.match(migration, /https:\/\/skj\.sk\/sk\/skj-sekretariat\/klubove-web-stranky\//);
  assert.match(migration, /HTML_LINK_DIRECTORY/);
  assert.match(migration, /'APPROVED',10080/);
  assert.match(migration, /maxCandidates/);
  assert.doesNotMatch(migration, /INSERT INTO (managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)/i);
});

test("discovery fetches are bounded and redirects are revalidated", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /MAX_DISCOVERY_BYTES = 1_000_000/);
  assert.match(runner, /MAX_REDIRECT_HOPS = 3/);
  assert.match(runner, /redirect: "manual"/);
  assert.match(runner, /AbortSignal\.timeout/);
  assert.match(runner, /isSafeAutomationSourceUrl\(target\.toString\(\)\)/);
  assert.match(runner, /discovery_response_too_large/);
});

test("search discovery remains provider-gated rather than scraping search engines", () => {
  const discovery = read("lib/data-automation-discovery.ts");
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(discovery, /AutomationSearchProvider/);
  assert.match(runner, /requireConfiguredSearchProvider/);
  assert.doesNotMatch(discovery + runner, /google\.com\/search|bing\.com\/search|tinyfish|playwright|puppeteer/i);
});

test("admin source screen exposes discovery health and candidate review", () => {
  const page = read("app/admin/operations/automation/sources/page.tsx");
  const manager = read("components/admin-automation-source-manager.tsx");
  assert.match(page, /listAutomationDiscoveryRoots/);
  assert.match(manager, /Scheduled discovery/);
  assert.match(manager, /lastCheckedAt/);
  assert.match(manager, /lastSuccessAt/);
  assert.match(manager, /nextCheckAt/);
  assert.match(manager, /Čaká na tvoje rozhodnutie/);
  assert.match(manager, /Pridať medzi zdroje/);
});
