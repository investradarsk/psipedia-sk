import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { automationSearchBudgetPolicy } from "../lib/data-automation-search-budget.ts";
import { selectRelevantExistingSourceForCandidate } from "../lib/data-automation-source-matching.ts";
import { isTavilySearchDiscoveryRoot } from "../lib/tavily-canary-control.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const queries = [
  "útulok pre psov Slovensko oficiálna stránka",
  "občianske združenie pomoc psom Slovensko oficiálna stránka",
  "záchrana psov Slovensko občianske združenie web",
];

test("DISCOVERY-CAT-1B provisions one weekly bounded disabled/PENDING ORGANIZATION root", () => {
  const migration = read("drizzle/0088_automation_tavily_organization_root.sql");
  assert.match(migration, /INSERT OR IGNORE INTO automation_discovery_roots/);
  assert.match(migration, /'tavily-sk-dog-organizations'/);
  assert.match(migration, /'SEARCH_PROVIDER'/);
  assert.match(migration, /'ORGANIZATION'/);
  assert.match(migration, /"provider":"tavily"/);
  for (const query of queries) assert.ok(migration.includes(query));
  assert.match(migration, /"country":"SK"/);
  assert.match(migration, /"locale":"sk-SK"/);
  assert.match(migration, /"maxResults":5/);
  assert.match(migration, /"maxCandidates":15/);
  assert.match(migration, /"queriesPerRun":3/);
  assert.match(migration, /"providerRequestsPerRun":3/);
  assert.match(migration, /"rootDailyRequests":3/);
  assert.match(migration, /"queryCooldownMinutes":10080/);
  assert.match(migration, /\n  0,\n  'PENDING',\n  10080,/);
  assert.doesNotMatch(migration, /'APPROVED'/);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO automation_sources/i);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO (help_organizations|organization_locations|partner_resources)/i);
  assert.doesNotMatch(migration, /UPDATE\s+help_organizations|UPDATE\s+organization_locations/i);
});

test("DISCOVERY-CAT-1B weekly budget remains bounded", () => {
  const policy = automationSearchBudgetPolicy({
    entityType: "ORGANIZATION",
    cadenceMinutes: 10080,
    config: {
      searchBudget: {
        queriesPerRun: 3,
        providerRequestsPerRun: 3,
        rootDailyRequests: 3,
        queryCooldownMinutes: 10080,
      },
    },
  });
  assert.equal(policy.queriesPerRun, 3);
  assert.equal(policy.providerRequestsPerRun, 3);
  assert.equal(policy.rootDailyRequests, 3);
  assert.equal(policy.queryCooldownMinutes, 10080);
  assert.equal(policy.maxPagesPerQuery, 1);
});

test("DISCOVERY-CAT-1B existing-source reuse stays exact/single-domain/entity-isolated", () => {
  const sources = [
    { id: 1, entityType: "ORGANIZATION", sourceUrl: "https://example.sk/" },
    { id: 2, entityType: "EVENT", sourceUrl: "https://event.example.sk/" },
  ];
  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://example.sk/",
    sourceUrl: "https://example.sk/",
  }, sources)?.id, 1);
  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://example.sk/utulok",
    sourceUrl: "https://example.sk/utulok",
  }, sources)?.id, 1);
  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://event.example.sk/",
    sourceUrl: "https://event.example.sk/",
  }, sources), null);

  const ambiguous = [
    { id: 3, entityType: "ORGANIZATION", sourceUrl: "https://multi.sk/a" },
    { id: 4, entityType: "ORGANIZATION", sourceUrl: "https://multi.sk/b" },
  ];
  assert.equal(selectRelevantExistingSourceForCandidate({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://multi.sk/c",
    sourceUrl: "https://multi.sk/c",
  }, ambiguous), null);
});

test("DISCOVERY-CAT-1B Tavily admin controls are generic but fail closed", () => {
  const root = {
    id: 99,
    rootKey: "tavily-sk-dog-organizations",
    label: "Organizations",
    discoveryType: "SEARCH_PROVIDER",
    sourceUrl: null,
    entityType: "ORGANIZATION",
    suggestedConnectorType: "CONTROLLED_HTML",
    config: { provider: "tavily", queries },
    enabled: false,
    reviewStatus: "PENDING",
    cadenceMinutes: 10080,
    nextCheckAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNotes: null,
    createdAt: "",
    updatedAt: "",
  };
  assert.equal(isTavilySearchDiscoveryRoot(root), true);
  assert.equal(isTavilySearchDiscoveryRoot({ ...root, config: { provider: "other" } }), false);
  assert.equal(isTavilySearchDiscoveryRoot({ ...root, discoveryType: "RSS" }), false);
});

test("DISCOVERY-CAT-1B discovery remains candidate-only and ORGANIZATION matcher guardrails remain in place", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  const sourceStore = read("lib/data-automation-source-store.ts");
  const matcher = read("lib/data-automation-clustering.ts");
  assert.match(runner, /upsertAutomationSourceCandidate/);
  assert.doesNotMatch(runner, /INSERT INTO (help_organizations|organization_locations|partner_resources)/i);
  assert.match(sourceStore, /selectRelevantExistingSourceForCandidate/);
  assert.match(matcher, /ORGANIZATION_ROOT_KINDS/);
  assert.match(matcher, /ambiguous_exact_organization_identity_requires_review/);
  assert.match(matcher, /partial_organization_identity_requires_review/);
  assert.match(matcher, /verified_canonical_organization_linkage/);
});

test("DISCOVERY-CAT-1B admin category exposes ORGANIZATION Tavily roots", () => {
  const presentation = read("lib/admin-automation-presentation.ts");
  const categoryPage = read("app/admin/automatizacie/[category]/page.tsx");
  const rootPage = read("app/admin/automatizacie/[category]/discovery/[id]/page.tsx");
  assert.match(presentation, /entityTypes: \["ORGANIZATION"\]/);
  assert.match(categoryPage, /import \{ isTavilySearchDiscoveryRoot \} from "@\/lib\/tavily-canary-control"/);
  assert.match(categoryPage, /\.filter\(isTavilySearchDiscoveryRoot\)/);
  assert.match(rootPage, /category\.entityTypes\.includes\(root\.entityType\)/);
});
