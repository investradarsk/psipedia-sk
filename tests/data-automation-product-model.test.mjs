import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  automationProductCategoryContract,
  automationProductCategoryForEntity,
  automationProductCategoryForRoot,
  automationProductModeForRoot,
} from "../lib/data-automation-product-model.ts";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("category matrix is explicit and contractual", () => {
  assert.deepEqual(
    automationProductCategoryContract.map(({ slug, mode }) => [slug, mode]),
    [
      ["veterinari", "DIRECT_ENTITY"],
      ["psie-sluzby", "DIRECT_ENTITY"],
      ["utulky-organizacie", "DIRECT_ENTITY"],
      ["podujatia", "FEED_SOURCE"],
      ["adopcie", "FEED_SOURCE"],
      ["docasna-opatera", "FEED_SOURCE"],
      ["stratene-najdene", "FEED_SOURCE"],
    ],
  );
});

test("DIRECTORY category resolution is explicit and never inferred from a label", () => {
  assert.equal(automationProductCategoryForEntity("DIRECTORY", "veterinari"), "veterinari");
  assert.equal(automationProductCategoryForEntity("DIRECTORY", "treneri"), "psie-sluzby");
  assert.equal(automationProductCategoryForEntity("DIRECTORY", "salony-a-sluzby"), "psie-sluzby");
  assert.equal(automationProductCategoryForEntity("DIRECTORY", undefined), null);
  assert.equal(automationProductCategoryForEntity("DIRECTORY", "unknown"), null);

  const vetRoot = {
    entityType: "DIRECTORY",
    config: { directoryCategory: "veterinari" },
  };
  assert.equal(automationProductCategoryForRoot(vetRoot), "veterinari");
  assert.equal(automationProductModeForRoot(vetRoot), "DIRECT_ENTITY");
  assert.equal(automationProductModeForRoot({ entityType: "EVENT", config: {} }), "FEED_SOURCE");
});

test("direct entity discovery bypasses source candidates while feed discovery preserves them", async () => {
  const runner = await read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /if \(discoveryMode === "DIRECT_ENTITY"\)[\s\S]*ingestDirectEntityUrl/);
  assert.match(runner, /else \{[\s\S]*upsertAutomationSourceCandidate/);
  assert.match(runner, /provenanceType: "DIRECT_ENTITY_DISCOVERY"/);
});

test("search exclusions are category-scoped, bounded and local matching remains authoritative", async () => {
  const [store, runner] = await Promise.all([
    read("lib/data-automation-product-store.ts"),
    read("lib/data-automation-discovery-runner.ts"),
  ]);
  assert.match(store, /FROM directory_profiles[\s\S]*WHERE category=\?/);
  assert.match(store, /FROM help_organizations/);
  assert.match(store, /FROM automation_sources[\s\S]*WHERE entity_type=\?/);
  assert.match(store, /FROM automation_source_candidates[\s\S]*WHERE entity_type=\?/);
  assert.match(store, /review_status IN \('NEW','APPROVED','REJECTED'\)/);
  assert.match(store, /boundedUnique\(\[\.\.\.knownDomains\], 20\)/);
  assert.match(store, /input\.directEntity && input\.entityType === "DIRECTORY"[\s\S]*\? \[\]/);
  assert.match(runner, /blockDomains = \[\.\.\.new Set\([\s\S]*\)\]\.slice\(0, 25\)/);
  assert.match(runner, /automationDiscoveryCandidateExcluded/);
  assert.match(runner, /exclusionCategory/);
  assert.doesNotMatch(runner, /1800/);
});

test("DRAFT and PUBLISHED canonical rows both participate because matching has no published-only filter", async () => {
  const store = await read("lib/data-automation-store.ts");
  const directory = store.match(/if \(source\.entityType === "DIRECTORY"\)[\s\S]*?return result\.results/s)?.[0] ?? "";
  const adoption = store.match(/if \(source\.entityType === "ADOPTION"\)[\s\S]*?return result\.results/s)?.[0] ?? "";
  assert.match(directory, /FROM directory_profiles/);
  assert.match(directory, /category=\?/);
  assert.doesNotMatch(directory, /status\s*=\s*['"]published/i);
  assert.match(adoption, /FROM adoption_dogs/);
  assert.doesNotMatch(adoption, /status\s*=\s*['"]published/i);
});

test("existing canonical payload is classified for updates before duplicate receipt short-circuit", async () => {
  const runner = await read("lib/data-automation-runner.ts");
  const exactMatch = runner.match(/if \(match\.entityId && match\.quality !== "UNCERTAIN"[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(exactMatch, /classifyAutomationFinding/);
  assert.match(exactMatch, /upsertAutomationFinding/);
  assert.match(exactMatch, /upsertCanonicalExternalProvenance/);
  assert.match(exactMatch, /ensureProcessedReceipt/);
  assert.doesNotMatch(runner, /processedReceipt\?\.payloadHash === proposalHash[\s\S]{0,180}return/);
  assert.match(runner, /Once a source-record identity has a receipt/);
  assert.match(runner, /if \(processedReceipt && \(!match\.entityId \|\| match\.quality === "UNCERTAIN" \|\| match\.quality === "NONE"\)\)/);
});

test("canonical provenance is canonical-owned and ingestion receipt still has no canonical id", async () => {
  const [migration, receipt, apply] = await Promise.all([
    read("drizzle/0092_automation_product_model.sql"),
    read("lib/data-automation-ingestion-receipts.ts"),
    read("lib/data-automation-apply.ts"),
  ]);
  const provenanceBlock = migration.match(/CREATE TABLE `canonical_external_provenance`[\s\S]*?;/)?.[0] ?? "";
  assert.match(provenanceBlock, /canonical_entity_id/);
  assert.match(provenanceBlock, /external_record_id/);
  assert.match(provenanceBlock, /external_source_url/);
  assert.doesNotMatch(provenanceBlock, /automation_source_id/);
  assert.doesNotMatch(receipt, /canonical_entity_id/);
  assert.match(apply, /upsertCanonicalExternalProvenance/);
  assert.match(apply, /provenanceType: "AUTOMATION_SOURCE_RECORD"/);
});

test("update suggestions are read-only and canonical auto-update remains absent", async () => {
  const [migration, direct, component] = await Promise.all([
    read("drizzle/0092_automation_product_model.sql"),
    read("lib/data-automation-direct-entity.ts"),
    read("components/admin-automation-category-sources.tsx"),
  ]);
  assert.match(migration, /CREATE TABLE `automation_update_suggestions`/);
  assert.match(direct, /upsertDirectEntityUpdateSuggestion/);
  assert.doesNotMatch(direct, /UPDATE\s+(directory_profiles|help_organizations)/i);
  assert.match(component, /Doplnenia a zmeny/);
  assert.doesNotMatch(component, /Prevziať všetko|auto-apply/i);
});

test("direct refresh is bounded, cursor-based and reuses the discovery sweep", async () => {
  const [runner, store] = await Promise.all([
    read("lib/data-automation-discovery-runner.ts"),
    read("lib/data-automation-product-store.ts"),
  ]);
  assert.match(runner, /const batchSize = 20/);
  assert.match(runner, /listDueDirectEntityRefreshSettings/);
  assert.match(runner, /runDirectEntityRefresh/);
  assert.match(runner, /expectedCanonicalEntityId: candidate\.id/);
  assert.match(store, /WHERE id>\?/);
  assert.match(store, /ORDER BY id ASC LIMIT \?/);
  assert.match(store, /cursor_entity_id=\?/);
  assert.match(store, /new Date\(now\.getTime\(\) \+ 60 \* 60_000\)/);
  assert.match(store, /new Date\(now\.getTime\(\) \+ input\.setting\.cadenceMinutes \* 60_000\)/);
});

test("DIRECT_ENTITY and FEED_SOURCE UX are separated and sources expose canonical content", async () => {
  const [category, source] = await Promise.all([
    read("components/admin-automation-category-sources.tsx"),
    read("components/admin-automation-source-settings.tsx"),
  ]);
  assert.match(category, /category\.mode === "DIRECT_ENTITY"/);
  assert.match(category, /Nové koncepty/);
  assert.match(category, /Hľadať nové zdroje/);
  assert.match(category, /Nové zdroje/);
  assert.match(category, /Schválené zdroje/);
  assert.match(category, /Nájdený obsah/);
  assert.match(category, /sourceContent\[String\(source\.id\)\]/);
  assert.match(source, /content\.map/);
  assert.match(source, /Otvoriť canonical sekciu/);
});

test("canonical editors always navigate back to canonical sections, never automation", async () => {
  const expectations = [
    ["app/admin/adopcie/[id]/page.tsx", "/admin/adopcie"],
    ["app/admin/podujatia/[id]/page.tsx", "/admin/podujatia"],
    ["app/admin/adresar/[id]/page.tsx", "/admin/adresar"],
    ["app/admin/organizacie/[id]/page.tsx", "/admin/organizacie"],
    ["app/admin/pomoc/[id]/page.tsx", "/admin/pomoc"],
    ["app/admin/stratene-najdene/[id]/page.tsx", "/admin/stratene-najdene"],
  ];
  for (const [path, href] of expectations) {
    const page = await read(path);
    assert.match(page, new RegExp(`actions=\\{<Link href="${href.replaceAll("/", "\\/")}"`));
    assert.doesNotMatch(page, /actions=\{<Link href="\/admin\/automatizacie/);
  }
});

test("migration preserves source-independent provenance across source deletion", async () => {
  const migration = await read("drizzle/0092_automation_product_model.sql");
  const block = migration.match(/CREATE TABLE `canonical_external_provenance`[\s\S]*?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(block, /REFERENCES\s+`?automation_sources/i);
  assert.match(migration, /UNIQUE INDEX `canonical_external_provenance_identity_unique`/);
});


test("direct entity fetches are access/robots gated before bounded parser fetch", async () => {
  const direct = await read("lib/data-automation-direct-entity.ts");
  assert.match(direct, /probeAutomationSourceAccess/);
  assert.match(direct, /probeAutomationSourceRobots/);
  assert.match(direct, /access\.status !== "ALLOWED"/);
  assert.match(direct, /robots\.status === "ALLOWED" \|\| robots\.status === "NOT_APPLICABLE"/);
  const probeIndex = direct.indexOf("probeAutomationSourceAccess");
  const fetchIndex = direct.indexOf("fetchAutomationSourceRecords(source");
  assert.ok(probeIndex >= 0 && fetchIndex > probeIndex);
});
