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

test("DIRECT_ENTITY same value keeps resolution and changed proposal receives a new version fingerprint", async () => {
  const store = await read("lib/data-automation-product-store.ts");
  assert.match(store, /const proposalHash = await sha256Hex\(input\.proposed\)/);
  assert.match(store, /proposalHash,/);
  assert.match(store, /status='RESOLVED'/);
  const conflict = store.match(/ON CONFLICT\(fingerprint\) DO UPDATE SET([\s\S]*?)\.bind\(/)?.[1] ?? "";
  assert.doesNotMatch(conflict, /status='OPEN'/);
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
