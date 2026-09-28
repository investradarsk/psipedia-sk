import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = read("drizzle/0087_automation_tavily_help_roots.sql");

const roots = [
  {
    key: "tavily-sk-dog-adoptions",
    entity: "ADOPTION",
    queries: [
      "slovenské útulky psy na adopciu",
      "adopcia psov Slovensko útulok",
      "psy hľadajú domov Slovensko útulok",
    ],
  },
  {
    key: "tavily-sk-dog-foster",
    entity: "FOSTER",
    queries: [
      "dočasná opatera pes Slovensko útulok",
      "hľadáme dočasnú opateru pes útulok Slovensko",
      "dočaska psy Slovensko útulok",
    ],
  },
  {
    key: "tavily-sk-dog-lost-found",
    entity: "LOST_FOUND",
    queries: [
      "stratené nájdené psy Slovensko útulok",
      "stratený pes Slovensko organizácia",
      "nájdený pes Slovensko útulok",
    ],
  },
];

test("DISCOVERY-CAT-1A provisions three isolated disabled/PENDING HELP Tavily roots", () => {
  assert.equal((migration.match(/INSERT OR IGNORE INTO automation_discovery_roots/g) ?? []).length, 1);
  for (const root of roots) {
    assert.ok(migration.includes("'" + root.key + "'"));
    assert.ok(migration.includes("'" + root.entity + "'"));
    for (const query of root.queries) assert.ok(migration.includes(query), query);
  }
  assert.equal((migration.match(/'SEARCH_PROVIDER'/g) ?? []).length, 3);
  assert.equal((migration.match(/'PENDING'/g) ?? []).length, 3);
  assert.equal((migration.match(/0,'PENDING',1440,NULL/g) ?? []).length, 3);
  assert.equal((migration.match(/"provider":"tavily"/g) ?? []).length, 3);
  assert.equal((migration.match(/"maxResults":5/g) ?? []).length, 3);
  assert.equal((migration.match(/"maxCandidates":15/g) ?? []).length, 3);
  assert.equal((migration.match(/"queriesPerRun":3/g) ?? []).length, 3);
  assert.equal((migration.match(/"providerRequestsPerRun":3/g) ?? []).length, 3);
  assert.equal((migration.match(/"rootDailyRequests":3/g) ?? []).length, 3);
  assert.equal((migration.match(/"queryCooldownMinutes":1440/g) ?? []).length, 3);
});

test("DISCOVERY-CAT-1A is candidate-only provisioning with no activation or canonical/publication writes", () => {
  assert.doesNotMatch(migration, /'APPROVED'/);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO automation_sources/i);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
  assert.doesNotMatch(migration, /UPDATE\s+(managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM/i);
});

test("DISCOVERY-CAT-1A keeps HELP query sets category-specific", () => {
  const allQueries = roots.flatMap((root) => root.queries);
  assert.equal(new Set(allQueries).size, allQueries.length);
  for (const root of roots) assert.equal(root.queries.length, 3);
});

test("DISCOVERY-CAT-1A uses canonical HELP entity types and existing category-first admin exposure", () => {
  const automationTypes = read("lib/data-automation.ts");
  const presentation = read("lib/admin-automation-presentation.ts");
  const categoryPage = read("app/admin/automatizacie/[category]/page.tsx");
  const categorySources = read("components/admin-automation-category-sources.tsx");

  for (const entity of ["ADOPTION", "FOSTER", "LOST_FOUND"]) assert.ok(automationTypes.includes('"' + entity + '"'));
  assert.match(presentation, /slug: "adopcie".*entityTypes: \["ADOPTION"\]/);
  assert.match(presentation, /slug: "docasna-opatera".*entityTypes: \["FOSTER"\]/);
  assert.match(presentation, /slug: "stratene-najdene".*entityTypes: \["LOST_FOUND"\]/);
  assert.match(presentation, /automationDiscoveryRootsForCategory/);
  assert.match(categoryPage, /automationDiscoveryRootsForCategory\(allRoots, slug\)/);
  assert.match(categorySources, /Automaticky hľadať nové zdroje/);
});

test("DISCOVERY-CAT-1A remains compatible with generic governance fail-closed scheduling", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const governance = read("lib/data-automation-governance.ts");
  assert.match(store, /WHERE enabled=1 AND review_status='APPROVED'/);
  assert.match(governance, /DISCOVERY_ROOT/);
});

test("DISCOVERY-CAT-1A leaves the existing EVENT Tavily root untouched", () => {
  const eventRoot = read("drizzle/0085_automation_tavily_discovery_root.sql");
  const eventCadence = read("drizzle/0086_automation_tavily_event_cadence.sql");
  assert.match(eventRoot, /'tavily-sk-dog-events'/);
  assert.match(eventRoot, /'EVENT'/);
  assert.match(eventCadence, /root_key = 'tavily-sk-dog-events'/);
  assert.match(eventCadence, /cadence_minutes = 2880/);
  assert.doesNotMatch(migration, /tavily-sk-dog-events/);
});
