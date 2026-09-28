import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("automation hub stays source-focused", async () => {
  const page = await read("app/admin/automatizacie/page.tsx");
  assert.match(page, /nových/);
  assert.match(page, /schválených/);
  assert.match(page, /zamietnutých/);
  assert.doesNotMatch(page, /pripravené návrhy/i);
});

test("category page is discovery and source management, not a content inbox", async () => {
  const component = await read("components/admin-automation-category-sources.tsx");
  assert.match(component, />Hľadať nové zdroje</);
  assert.match(component, />Nové zdroje</);
  assert.match(component, />Schválené zdroje</);
  assert.match(component, />Zamietnuté zdroje</);
  assert.doesNotMatch(component, /História|Pokročilé|Pripravené návrhy|Koncepty a nálezy/);
});

test("source decision is approve or reject in the primary flow", async () => {
  const category = await read("components/admin-automation-category-sources.tsx");
  assert.match(category, /"Schváliť"/);
  assert.match(category, /"Zamietnuť"/);
  assert.doesNotMatch(category, /suppress|Odložiť|Pokročilé/);
});

test("source approval keeps monitoring off until the user enables it", async () => {
  const route = await read("app/api/admin/automation-source-candidates/[id]/route.ts");
  assert.match(route, /reviewAutomationSource/);
  assert.doesNotMatch(route, /previewAutomationSource/);
  assert.doesNotMatch(route, /setAutomationSourceEnabled/);
  assert.doesNotMatch(route, /activation/);
});

test("new and possible-duplicate content is converted to canonical draft", async () => {
  const [runner, apply] = await Promise.all([
    read("lib/data-automation-runner.ts"),
    read("lib/data-automation-apply.ts"),
  ]);
  assert.match(runner, /findingType !== "NEW_ENTITY" && findingType !== "DUPLICATE_CANDIDATE"/);
  assert.match(runner, /applyAutomationFinding/);
  assert.match(apply, /"DUPLICATE_CANDIDATE"/);
  assert.match(apply, /finding\.findingType === "NEW_ENTITY" \|\| finding\.findingType === "DUPLICATE_CANDIDATE"/);
  assert.match(apply, /CREATE_DRAFT/);
});

test("possible duplicate drafts use a detached slug suffix and remain unpublished", async () => {
  const [mapper, service] = await Promise.all([
    read("lib/data-automation-draft-mapper.ts"),
    read("lib/canonical-draft-service.ts"),
  ]);
  assert.match(mapper, /duplicateSlugSuffix/);
  assert.doesNotMatch(mapper, /finding\.id/);
  assert.match(service, /published_at: null/);
  assert.match(service, /status: "DRAFT"|status: "draft"/);
});

test("uncertain canonical match becomes warning provenance, not the duplicate draft target", async () => {
  const runner = await read("lib/data-automation-runner.ts");
  assert.match(runner, /findingCanonicalEntityId = classified\.findingType === "DUPLICATE_CANDIDATE" \? null : match\.entityId/);
  assert.match(runner, /duplicateCandidates/);
  assert.match(runner, /match\.entityKey/);
  assert.match(runner, /type === "NEW_ENTITY" \|\| type === "DUPLICATE_CANDIDATE"\) return/);
});

test("automation only maps structured payload while canonical draft service owns field defaults", async () => {
  const [mapper, service] = await Promise.all([
    read("lib/data-automation-draft-mapper.ts"),
    read("lib/canonical-draft-service.ts"),
  ]);
  assert.match(mapper, /data: finding\.proposed/);
  assert.doesNotMatch(mapper, /Admin|React|route|page|className/);
  assert.match(service, /textValue\(p\.description\)/);
  assert.match(service, /nullableText\(p\.websiteUrl/);
  assert.match(service, /textValue\(p\.city\)/);
});

test("possible duplicate warning is shown in normal entity editors from canonical-local metadata", async () => {
  const warning = await read("components/admin-canonical-draft-warning.tsx");
  assert.match(warning, /⚠️ Možná duplicita/);
  assert.doesNotMatch(warning, /data-automation|automation_findings|automation_entity_clusters/);

  for (const path of [
    "app/admin/podujatia/[id]/page.tsx",
    "app/admin/adopcie/[id]/page.tsx",
    "app/admin/stratene-najdene/[id]/page.tsx",
    "app/admin/organizacie/[id]/page.tsx",
    "app/admin/adresar/[id]/page.tsx",
    "app/admin/pomoc/[id]/page.tsx",
  ]) {
    const page = await read(path);
    assert.match(page, /AdminCanonicalDraftWarning/);
    assert.match(page, /getCanonicalDraftDuplicateWarning/);
    assert.doesNotMatch(page, /getAutomationDraftDuplicateWarning/);
  }
});

test("duplicate warning is canonical-local and independent of automation provenance", async () => {
  const flags = await read("lib/canonical-draft-flags.ts");
  assert.match(flags, /canonical_draft_flags/);
  assert.match(flags, /POSSIBLE_DUPLICATE/);
  assert.doesNotMatch(flags, /automation_findings|automation_entity_clusters|finding_id|cluster_id|source_id|observation_id/);
});

test("publication remains an explicit entity-editor decision", async () => {
  const [runner, runRoute, eventPage, organizationPage] = await Promise.all([
    read("lib/data-automation-runner.ts"),
    read("app/api/admin/automation-sources/[id]/run/route.ts"),
    read("app/admin/podujatia/[id]/page.tsx"),
    read("app/admin/organizacie/[id]/page.tsx"),
  ]);
  assert.doesNotMatch(runner, /publishAutomation|publication.*true/);
  assert.match(runRoute, /publication: false/);
  assert.match(eventPage, /rovno publikuj/);
  assert.match(organizationPage, /Publication lifecycle zostáva explicitná samostatná akcia/);
});

test("technical automation internals are absent from normal UX", async () => {
  const [category, source] = await Promise.all([
    read("components/admin-automation-category-sources.tsx"),
    read("components/admin-automation-source-settings.tsx"),
  ]);
  for (const value of [category, source]) {
    assert.doesNotMatch(value, /adapter|readiness|governance|finding|observation|cluster|receipt|run ID|Pokročilé/i);
  }
});

test("Notion is not part of the automation content flow", async () => {
  const files = await Promise.all([
    read("app/admin/automatizacie/page.tsx"),
    read("app/admin/automatizacie/[category]/page.tsx"),
    read("lib/data-automation-runner.ts"),
  ]);
  assert.equal(files.some((value) => /notion/i.test(value)), false);
});
