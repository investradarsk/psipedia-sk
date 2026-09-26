import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeAutomationSearchRequest,
  requireConfiguredSearchProvider,
} from "../lib/data-automation-discovery.ts";
import { automationSearchBudgetPolicy } from "../lib/data-automation-search-budget.ts";
import { TavilyAutomationSearchProvider } from "../lib/data-automation-search-tavily.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const queries = [
  "kynologický kalendár podujatí Slovensko",
  "agility preteky kalendár Slovensko",
  "mushing preteky kalendár Slovensko",
];

test("DISCOVERY-2C-C migration provisions one bounded disabled/PENDING Tavily EVENT root", () => {
  const migration = read("drizzle/0085_automation_tavily_discovery_root.sql");
  assert.match(migration, /INSERT OR IGNORE INTO automation_discovery_roots/);
  assert.match(migration, /'tavily-sk-dog-events'/);
  assert.match(migration, /'SEARCH_PROVIDER'/);
  assert.match(migration, /'EVENT'/);
  assert.match(migration, /"provider":"tavily"/);
  for (const query of queries) assert.ok(migration.includes(query));
  assert.match(migration, /"country":"SK"/);
  assert.match(migration, /"locale":"sk-SK"/);
  assert.match(migration, /"maxResults":5/);
  assert.match(migration, /"queriesPerRun":3/);
  assert.match(migration, /"providerRequestsPerRun":3/);
  assert.match(migration, /"rootDailyRequests":3/);
  assert.match(migration, /"queryCooldownMinutes":1440/);
  assert.match(migration, /\n  0,\n  'PENDING',\n  1440,/);
  assert.doesNotMatch(migration, /'APPROVED'/);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO automation_sources/i);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE\s+/i);
});

test("DISCOVERY-2C-C search contract accepts exact query set with five-result bounds", () => {
  for (const query of queries) {
    const request = normalizeAutomationSearchRequest({
      query,
      maxResults: 5,
      country: "SK",
      locale: "sk-SK",
    });
    assert.equal(request.query, query.toLocaleLowerCase());
    assert.equal(request.maxResults, 5);
    assert.equal(request.country, "SK");
    assert.equal(request.locale, "sk-sk");
    assert.equal(request.allowDomains, undefined);
    assert.equal(request.freshness, undefined);
  }
});

test("DISCOVERY-2C-C root-local budget is 3 queries, 3 provider requests/day, one page and 24h cooldown", () => {
  const policy = automationSearchBudgetPolicy({
    entityType: "EVENT",
    cadenceMinutes: 1440,
    config: {
      searchBudget: {
        queriesPerRun: 3,
        providerRequestsPerRun: 3,
        rootDailyRequests: 3,
        queryCooldownMinutes: 1440,
      },
    },
  });
  assert.equal(policy.queriesPerRun, 3);
  assert.equal(policy.providerRequestsPerRun, 3);
  assert.equal(policy.rootDailyRequests, 3);
  assert.equal(policy.queryCooldownMinutes, 1440);
  assert.equal(policy.maxPagesPerQuery, 1);
});

test("DISCOVERY-2C-C Tavily provider resolves without making a live request", () => {
  const provider = new TavilyAutomationSearchProvider({ apiKey: "test-only-key" });
  assert.equal(provider.key, "tavily");
  assert.equal(provider.credentialConfigured, true);
  assert.equal(requireConfiguredSearchProvider(provider, "tavily"), provider);

  const unconfigured = new TavilyAutomationSearchProvider({ apiKey: "" });
  assert.equal(unconfigured.credentialConfigured, false);
  assert.throws(() => requireConfiguredSearchProvider(unconfigured, "tavily"));
});

test("DISCOVERY-2C-C disabled/PENDING roots are excluded from scheduler selection", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  assert.match(store, /WHERE enabled=1 AND review_status='APPROVED'/);
});

test("DISCOVERY-2C-C runner keeps multi-query execution budgeted and candidate-only", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /Array\.isArray\(root\.config\.queries\)/);
  assert.match(runner, /\.slice\(0, policy\.queriesPerRun\)/);
  assert.match(runner, /reserveAutomationSearchRequest/);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});
