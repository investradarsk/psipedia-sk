import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationCategoryForCandidate,
  automationCategoryForDiscoveryRoot,
  automationCategoryForSource,
} from "../lib/admin-automation-presentation.ts";
import { automationSearchBudgetPolicy } from "../lib/data-automation-search-budget.ts";
import {
  DIRECTORY_SEMANTIC_KIND,
  selectDirectoryClusterCandidate,
} from "../lib/data-automation-directory-matching.ts";
import { selectRelevantExistingSourceForCandidate } from "../lib/data-automation-source-matching.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = read("drizzle/0089_automation_tavily_directory_roots.sql");

const roots = [
  {
    key: "tavily-sk-dog-veterinarians",
    category: "veterinari",
    adminCategory: "veterinari",
    queries: [
      "veterinárna klinika pes Slovensko oficiálna stránka",
      "veterinárna ambulancia psy Slovensko oficiálny web",
      "veterinárna nemocnica Slovensko pes oficiálna stránka",
    ],
  },
  {
    key: "tavily-sk-dog-grooming",
    category: "salony-a-sluzby",
    adminCategory: "psie-sluzby",
    queries: [
      "psí salón Slovensko oficiálna stránka",
      "strihanie psov Slovensko salón oficiálny web",
      "grooming psy Slovensko salón oficiálna stránka",
    ],
  },
  {
    key: "tavily-sk-dog-hotels-daycare",
    category: "hotely-a-opatrovanie",
    adminCategory: "psie-sluzby",
    queries: [
      "hotel pre psov Slovensko oficiálna stránka",
      "škôlka pre psov Slovensko oficiálny web",
      "ubytovanie opatera psov Slovensko oficiálna stránka",
    ],
  },
  {
    key: "tavily-sk-dog-trainers",
    category: "treneri",
    adminCategory: "psie-sluzby",
    queries: [
      "psia škola Slovensko oficiálna stránka",
      "výcvik psov Slovensko tréner oficiálny web",
      "tréner psov Slovensko oficiálna stránka",
    ],
  },
  {
    key: "tavily-sk-dog-rehabilitation",
    category: "fyzioterapia",
    adminCategory: "psie-sluzby",
    queries: [
      "rehabilitácia psov Slovensko oficiálna stránka",
      "fyzioterapia pre psov Slovensko oficiálny web",
      "rehabilitačné centrum pre psy Slovensko oficiálna stránka",
    ],
  },
];

test("DISCOVERY-CAT-1C provisions five isolated canonical DIRECTORY roots", () => {
  assert.equal((migration.match(/'SEARCH_PROVIDER'/g) ?? []).length, 5);
  assert.equal((migration.match(/'DIRECTORY'/g) ?? []).length, 5);
  assert.equal((migration.match(/'CONTROLLED_HTML'/g) ?? []).length, 5);
  assert.equal((migration.match(/0,'PENDING',10080,NULL/g) ?? []).length, 5);
  assert.equal((migration.match(/"provider":"tavily"/g) ?? []).length, 5);
  assert.equal((migration.match(/"maxResults":5/g) ?? []).length, 5);
  assert.equal((migration.match(/"maxCandidates":15/g) ?? []).length, 5);
  assert.equal((migration.match(/"queriesPerRun":3/g) ?? []).length, 5);
  assert.equal((migration.match(/"providerRequestsPerRun":3/g) ?? []).length, 5);
  assert.equal((migration.match(/"rootDailyRequests":3/g) ?? []).length, 5);
  assert.equal((migration.match(/"queryCooldownMinutes":10080/g) ?? []).length, 5);

  const allQueries = [];
  for (const root of roots) {
    assert.ok(migration.includes("'" + root.key + "'"));
    assert.ok(migration.includes('"directoryCategory":"' + root.category + '"'));
    assert.equal(root.queries.length, 3);
    for (const query of root.queries) {
      assert.ok(migration.includes(query), query);
      allQueries.push(query);
    }
  }
  assert.equal(new Set(allQueries).size, 15);
});

test("DISCOVERY-CAT-1C weekly Tavily budget remains bounded", () => {
  const policy = automationSearchBudgetPolicy({
    entityType: "DIRECTORY",
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

test("DISCOVERY-CAT-1C remains candidate-only and preserves category into pending source provisioning", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  const sourceStore = read("lib/data-automation-source-store.ts");
  const provisioning = read("lib/data-automation-source-provisioning.ts");
  assert.match(runner, /upsertAutomationSourceCandidate/);
  assert.match(runner, /directoryCategory/);
  assert.doesNotMatch(runner, /INSERT INTO directory_profiles|UPDATE directory_profiles|DELETE FROM directory_profiles/i);
  assert.match(sourceStore, /candidateProvisioningConfig/);
  assert.match(provisioning, /semanticKind: "FACILITY_OR_SERVICE_PROFILE"/);
  assert.match(sourceStore, /const provisioningConfig = candidateProvisioningConfig\\(candidate\\)/);
  assert.match(sourceStore, /assertCandidateProvisioningReady\\(candidate, provisioningConfig\\)/);
  assert.match(sourceStore, /stableJson\\(provisioningConfig\\)/);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO automation_sources/i);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO directory_profiles/i);
  assert.doesNotMatch(migration, /UPDATE\s+directory_profiles|DELETE FROM\s+directory_profiles/i);
  assert.doesNotMatch(migration, /'APPROVED'/);
});

test("DISCOVERY-CAT-1C admin exposure uses canonical DIRECTORY category metadata", () => {
  for (const root of roots) {
    assert.equal(automationCategoryForDiscoveryRoot({
      entityType: "DIRECTORY",
      rootKey: root.key,
      label: root.key,
      sourceUrl: null,
      config: { directoryCategory: root.category },
    }), root.adminCategory);

    assert.equal(automationCategoryForCandidate({
      entityType: "DIRECTORY",
      label: "neutral label",
      sourceUrl: "https://example.sk/",
      reason: "search result",
      metadata: { directoryCategory: root.category },
    }), root.adminCategory);

    assert.equal(automationCategoryForSource({
      entityType: "DIRECTORY",
      sourceKey: "source",
      label: "neutral label",
      sourceUrl: "https://example.sk/",
      config: { staticFields: { category: root.category } },
    }), root.adminCategory);
  }
});

test("DISCOVERY-CAT-1C source reuse is entity- and category-aware", () => {
  const candidate = {
    entityType: "DIRECTORY",
    canonicalUrl: "https://multi.example.sk/vet",
    sourceUrl: "https://multi.example.sk/vet",
    metadata: { directoryCategory: "veterinari" },
  };
  const sources = [
    {
      id: 1,
      entityType: "DIRECTORY",
      sourceUrl: "https://multi.example.sk/grooming",
      config: { staticFields: { category: "salony-a-sluzby" } },
    },
    {
      id: 2,
      entityType: "DIRECTORY",
      sourceUrl: "https://multi.example.sk/veterina",
      config: { staticFields: { category: "veterinari" } },
    },
    {
      id: 3,
      entityType: "EVENT",
      sourceUrl: "https://multi.example.sk/vet",
      config: {},
    },
  ];
  assert.equal(selectRelevantExistingSourceForCandidate(candidate, sources)?.id, 2);

  assert.equal(selectRelevantExistingSourceForCandidate({
    ...candidate,
    canonicalUrl: "https://multi.example.sk/grooming",
    sourceUrl: "https://multi.example.sk/grooming",
  }, sources), null);

  const ambiguous = [
    ...sources,
    {
      id: 4,
      entityType: "DIRECTORY",
      sourceUrl: "https://multi.example.sk/vet-2",
      config: { staticFields: { category: "veterinari" } },
    },
  ];
  assert.equal(selectRelevantExistingSourceForCandidate(candidate, ambiguous), null);

  assert.equal(selectRelevantExistingSourceForCandidate({
    ...candidate,
    metadata: { directoryCategory: "fyzioterapia" },
  }, sources), null);
});

test("DISCOVERY-CAT-1C DIRECTORY matcher retains category/service guardrails", () => {
  const record = {
    sourceRecordId: "directory-1",
    sourceUrl: "https://example.sk/",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category: "veterinari",
      name: "Happy Dog",
      city: "Nitra",
      street: "Hlavná",
      houseNumber: "1",
    },
  };
  const decision = selectDirectoryClusterCandidate(record, [{
    id: 10,
    semanticKind: DIRECTORY_SEMANTIC_KIND,
    canonicalEntityId: null,
    canonicalEntityKey: null,
    fields: {
      category: "salony-a-sluzby",
      name: "happy dog",
      municipality: "nitra",
      street: "hlavná",
      houseNumber: "1",
    },
    keys: [],
  }]);
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.candidateId, null);
  assert.equal(decision.reason, "directory_category_conflict_requires_review");
  assert.deepEqual(decision.conflicts, ["category"]);
});

test("DISCOVERY-CAT-1C governance stays fail-closed and earlier roots remain untouched", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const eventRoot = read("drizzle/0085_automation_tavily_discovery_root.sql");
  const helpRoots = read("drizzle/0087_automation_tavily_help_roots.sql");
  const organizationRoot = read("drizzle/0088_automation_tavily_organization_root.sql");
  assert.match(store, /WHERE enabled=1 AND review_status='APPROVED'/);
  assert.match(store, /SEARCH_PROVIDER roots fail closed/);
  assert.match(eventRoot, /'tavily-sk-dog-events'/);
  assert.match(helpRoots, /'tavily-sk-dog-adoptions'/);
  assert.match(organizationRoot, /'tavily-sk-dog-organizations'/);
  assert.doesNotMatch(migration, /tavily-sk-dog-events|tavily-sk-dog-adoptions|tavily-sk-dog-organizations/);
});
