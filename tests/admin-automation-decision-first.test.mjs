import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("automation hub stays source-focused", async () => {
  const page = await read("app/admin/automatizacie/page.tsx");
  assert.match(page, /nové zdroje/);
  assert.match(page, /problémy zdrojov/);
  assert.doesNotMatch(page, /pripravené návrhy/i);
});

test("category page is discovery and source management, not a content inbox", async () => {
  const page = await read("app/admin/automatizacie/[category]/page.tsx");
  assert.match(page, /Našli sa nové zdroje/);
  assert.match(page, />Nový zdroj</);
  assert.match(page, />Skontrolovať</);
  assert.match(page, />Zdroje</);
  assert.match(page, />História</);
  assert.match(page, />Pokročilé</);
  assert.doesNotMatch(page, /Pripravené návrhy/);
  assert.doesNotMatch(page, /Koncepty a nálezy/);
});

test("source decision is yes or no in the primary flow", async () => {
  const candidate = await read("components/admin-automation-candidate-review.tsx");
  assert.match(candidate, /ÁNO — používať/);
  assert.match(candidate, /NIE — nepoužívať/);
  assert.match(candidate, /Ďalšie možnosti/);
});

test("source approval orchestration reuses existing safety guards", async () => {
  const route = await read("app/api/admin/automation-source-candidates/[id]/route.ts");
  assert.match(route, /reviewAutomationSource/);
  assert.match(route, /previewAutomationSource/);
  assert.match(route, /setAutomationSourceEnabled/);
  assert.match(route, /blockedReason/);
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

test("possible duplicate drafts use a distinct slug and remain unpublished", async () => {
  const apply = await read("lib/data-automation-apply.ts");
  assert.match(apply, /"-koncept-" \+ finding\.id/);
  assert.match(apply, /published_at: null/);
  assert.match(apply, /status: "DRAFT"|status: "draft"/);
});

test("automation only fills parsed fields while draft constructors keep missing optional fields empty", async () => {
  const apply = await read("lib/data-automation-apply.ts");
  assert.match(apply, /textValue\(p\.description\)/);
  assert.match(apply, /nullableText\(p\.websiteUrl/);
  assert.match(apply, /textValue\(p\.city\)/);
});

test("possible duplicate warning is shown in normal entity editors", async () => {
  const warning = await read("components/admin-automation-draft-warning.tsx");
  assert.match(warning, /⚠️ Možná duplicita/);
  assert.match(warning, /Zobraziť podobný záznam/);

  for (const path of [
    "app/admin/podujatia/[id]/page.tsx",
    "app/admin/adopcie/[id]/page.tsx",
    "app/admin/stratene-najdene/[id]/page.tsx",
    "app/admin/organizacie/[id]/page.tsx",
    "app/admin/adresar/[id]/page.tsx",
    "app/admin/pomoc/[id]/page.tsx",
  ]) {
    const page = await read(path);
    assert.match(page, /AdminAutomationDraftWarning/);
  }
});

test("duplicate warning links are derived from existing automation provenance", async () => {
  const store = await read("lib/data-automation-store.ts");
  assert.match(store, /getAutomationDraftDuplicateWarning/);
  assert.match(store, /finding_type='DUPLICATE_CANDIDATE'/);
  assert.match(store, /automationCanonicalAdminHref/);
  assert.match(store, /automation_entity_clusters/);
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

test("technical automation internals remain advanced", async () => {
  const [candidate, source, category] = await Promise.all([
    read("components/admin-automation-candidate-review.tsx"),
    read("components/admin-automation-source-detail.tsx"),
    read("app/admin/automatizacie/[category]/page.tsx"),
  ]);
  assert.match(candidate, /Pokročilé \/ technické údaje/);
  assert.match(source, /Pokročilé — bezpečnostné pravidlá/);
  assert.match(category, /Automatické hľadanie zdrojov/);
  assert.match(category, /Otvoriť technické nastavenia/);
});

test("Notion is not part of the automation content flow", async () => {
  const files = await Promise.all([
    read("app/admin/automatizacie/page.tsx"),
    read("app/admin/automatizacie/[category]/page.tsx"),
    read("lib/data-automation-runner.ts"),
  ]);
  assert.equal(files.some((value) => /notion/i.test(value)), false);
});
