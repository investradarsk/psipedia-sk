import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("field-review ledger is additive and value-bound", async () => {
  const migration = await read("drizzle/0093_automation_update_field_reviews.sql");
  assert.match(migration, /CREATE TABLE `automation_update_field_reviews`/);
  assert.match(migration, /origin_type/);
  assert.match(migration, /suggestion_id/);
  assert.match(migration, /field_key/);
  assert.match(migration, /proposed_value_hash/);
  assert.match(migration, /decision.*ACCEPTED.*REJECTED/s);
  assert.match(migration, /UNIQUE INDEX `automation_update_field_reviews_value_unique`/);
  assert.match(migration, /origin_type`,`suggestion_id`,`field_key`,`proposed_value_hash/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM/i);
});

test("review service is explicit-field only and blocks lifecycle/private/system mutation", async () => {
  const source = await read("lib/data-automation-update-review.ts");
  assert.match(source, /row\.suggestion_type !== "POSSIBLE_UPDATE"/);
  assert.match(source, /Zmenu lifecycle stavu nemožno prevziať/);
  assert.match(source, /config\.fields\[field\]/);
  assert.match(source, /config\.manualFields\?\.has\(field\)/);
  assert.match(source, /if \(!spec \|\| config\.manualFields/);
  assert.match(source, /updated_by=\?/);
  assert.doesNotMatch(source, /\$\{input\.field\}/);
  assert.doesNotMatch(source, /internalNote|internal_email|contactPhone.*LOST_FOUND|payment|partner/i);
});

test("field decisions carry across suggestion versions for the same canonical field and value", async () => {
  const source = await read("lib/data-automation-update-review.ts");
  assert.match(source, /WHERE entity_type=\? AND canonical_entity_id=\?/);
  assert.match(source, /field_key=\? AND proposed_value_hash=\?/);
  assert.match(source, /SAME_VALUE_ALREADY_REJECTED/);
  assert.match(source, /SAME_VALUE_ALREADY_ACCEPTED/);
  const reviewMap = source.match(/const reviewMap = new Map\(([\s\S]*?)\n  \);/)?.[1] ?? "";
  assert.match(reviewMap, /review\.entity_type === row\.entity_type/);
  assert.match(reviewMap, /review\.canonical_entity_id/);
  assert.doesNotMatch(reviewMap, /suggestion_id.*row\.id/);
});

test("accept is stale-safe, value-versioned and idempotent while reject never needs a canonical write", async () => {
  const source = await read("lib/data-automation-update-review.ts");
  assert.match(source, /proposedHash\(field, spec, change\.after\)/);
  assert.match(source, /expectedProposedValueHash/);
  assert.match(source, /valuesEqual\(spec, current, change\.before\)/);
  assert.match(source, /String\(canonical\.updated_at \?\? ""\) !== input\.expectedUpdatedAt/);
  assert.match(source, /WHERE id=\? AND updated_at=\?/);
  assert.match(source, /db\.batch\(\[updateStatement, decisionStatement\]\)/);
  assert.match(source, /WHERE EXISTS/);
  assert.match(source, /CANONICAL_ALREADY_MATCHES/);
  assert.match(source, /existingDecision/);
  const reject = source.match(/if \(input\.action === "reject"\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(reject, /recordDecision/);
  assert.doesNotMatch(reject, /writeCanonicalField/);
});

test("DIRECT_ENTITY keeps stable lineage, preserves same-value resolution and reopens only changed payload", async () => {
  const store = await read("lib/data-automation-product-store.ts");
  const fingerprint = store.match(/const fingerprint = await sha256Hex\(\{([\s\S]*?)\}\);/)?.[1] ?? "";
  assert.match(fingerprint, /entityType/);
  assert.match(fingerprint, /canonicalEntityId/);
  assert.match(fingerprint, /externalRecordId/);
  assert.match(fingerprint, /suggestionType/);
  assert.doesNotMatch(fingerprint, /proposalHash/);
  assert.match(store, /const proposedJson = stableJson\(input\.proposed\)/);
  assert.match(store, /const diffJson = stableJson\(input\.diff\)/);
  assert.match(store, /status=CASE[\s\S]*proposed_json=excluded\.proposed_json[\s\S]*diff_json=excluded\.diff_json[\s\S]*THEN automation_update_suggestions\.status[\s\S]*ELSE 'OPEN'/);
});

test("admin API is authenticated, same-origin JSON only and has explicit error contracts", async () => {
  const api = await read("app/api/admin/automation-update-suggestions/[origin]/[id]/fields/[field]/route.ts");
  assert.match(api, /requireAdminMutation\(request\)/);
  assert.match(api, /auth\.response/);
  assert.match(api, /auth\.user/);
  assert.match(api, /contentType\.startsWith\("application\/json"\)/);
  assert.match(api, /AutomationUpdateReviewConflictError/);
  assert.match(api, /status: 409/);
  assert.match(api, /AutomationUpdateReviewValidationError/);
  assert.match(api, /status: 422/);
  assert.match(api, /origin !== "DIRECT_ENTITY" && origin !== "FEED_SOURCE"/);
});

test("canonical editors receive suggestions server-side and keep local dirty state synchronized", async () => {
  const pages = [
    ["app/admin/adresar/[id]/page.tsx", "DIRECTORY"],
    ["app/admin/organizacie/[id]/page.tsx", "ORGANIZATION"],
    ["app/admin/podujatia/[id]/page.tsx", "EVENT"],
    ["app/admin/adopcie/[id]/page.tsx", "ADOPTION"],
    ["app/admin/pomoc/[id]/page.tsx", "listCanonicalAutomationUpdateSuggestions"],
    ["app/admin/stratene-najdene/[id]/page.tsx", "LOST_FOUND"],
  ];
  for (const [path, marker] of pages) {
    const page = await read(path);
    assert.match(page, /listCanonicalAutomationUpdateSuggestions/);
    assert.match(page, /automationSuggestions=/);
    assert.match(page, new RegExp(marker));
  }

  const [organization, adoption, directory] = await Promise.all([
    read("components/admin-organization-editor.tsx"),
    read("components/admin-adoption-editor.tsx"),
    read("components/admin-directory-editor.tsx"),
  ]);
  assert.match(organization, /setExpectedUpdatedAt\(updatedAt\)/);
  assert.match(organization, /setDraft\(\(current\) => \(\{ \.\.\.current, \.\.\.values \}/);
  assert.match(adoption, /formRef\.current\?\.elements\.namedItem\(field\)/);
  assert.match(adoption, /setVersion\(updatedAt\)/);
  assert.match(directory, /onAccepted=\{applyAutomationUpdate\}/);
});

test("category summaries are normalized to genuinely active reviewable fields", async () => {
  const [service, page] = await Promise.all([
    read("lib/data-automation-update-review.ts"),
    read("app/admin/automatizacie/[category]/page.tsx"),
  ]);
  assert.match(service, /normalizeAutomationUpdateSuggestionSummaries/);
  assert.match(service, /suggestion\.fields\.find\(\(candidate\) => candidate\.reviewable\)/);
  assert.match(service, /loadCanonicalRows\(rows, db\)/);
  assert.match(page, /normalizeAutomationUpdateSuggestionSummaries\(rawUpdateSuggestions\)/);
});

test("review validation enforces domain enums, numeric ranges and coupled invariants", async () => {
  const source = await read("lib/data-automation-update-review.ts");
  assert.match(source, /eventTypes/);
  assert.match(source, /adoptionSexes/);
  assert.match(source, /adoptionSizes/);
  assert.match(source, /organizationPublicationTypes/);
  assert.match(source, /dogSexes/);
  assert.match(source, /dogSizes/);
  assert.match(source, /spec\.allowed/);
  assert.match(source, /spec\.minNumber/);
  assert.match(source, /spec\.maxNumber/);
  assert.match(source, /Dátum konca nemôže byť pred dátumom začiatku/);
  assert.match(source, /Adopčný profil už používa približný vek/);
});

test("review card exposes current/proposed source-aware field decisions without accept-all", async () => {
  const component = await read("components/admin-automation-update-suggestions.tsx");
  assert.match(component, /Doplnenia a zmeny/);
  assert.match(component, />Teraz</);
  assert.match(component, />Nájdené</);
  assert.match(component, /Prevziať/);
  assert.match(component, /Zamietnuť/);
  assert.match(component, /Zdroje sa nezhodujú/);
  assert.match(component, /Europe\/Bratislava/);
  assert.match(component, /aria-label/);
  assert.match(component, /auto-fit,minmax\(220px,1fr\)/);
  assert.doesNotMatch(component, /Prevziať všetko/);
});

test("ambiguous/coupled address and lifecycle fields are never one-click review fields", async () => {
  const source = await read("lib/data-automation-update-review.ts");
  for (const field of ["address", "city", "district", "region", "postalCode", "street", "houseNumber", "addressFormat", "serviceAddressConfirmation"]) {
    assert.match(source, new RegExp(`"${field}"`));
  }
  assert.match(source, /addressManualFields/);
  assert.match(source, /manualFields: new Set\(\["cancelled"\]\)/);
  assert.match(source, /manualFields: new Set\(\["urgent", "resolved"\]\)/);
  assert.match(source, /manualFields: new Set\(\["type", "status"\]\)/);
});
