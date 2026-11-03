import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ownerDecisionPairKey,
  validateOwnerDecisionDraft,
  isMergeRequest,
  ownerDecisionLabel,
  orientSavedDecision,
} from "../lib/visual-library-owner-decision-queue.ts";

const read = (name) => readFileSync(name, "utf8");
const draft = {
  leftId: "magazine",
  rightId: "unified-section-hero",
  leftTitle: "Banner Veterinári",
  rightTitle: "Spoločná hero sekcia",
  leftVariantId: "clanky:veterinari",
  rightVariantId: "hero:plemena",
  decision: "use-left",
  notes: "Zachovať banner A.\nMobil bez zásahu.",
};

test("one canonical key per pair prevents duplicate review tasks", () => {
  const a = ownerDecisionPairKey(draft.leftId, draft.rightId);
  const b = ownerDecisionPairKey(draft.rightId, draft.leftId);
  assert.equal(a, b);
  assert.match(a, /^owner-decision:/);
  assert.ok(a.includes("magazine"));
  assert.throws(() => ownerDecisionPairKey("magazine", "magazine"), /rozdielne/);
  assert.throws(() => ownerDecisionPairKey("x/../../foo", "magazine"), /identifikátor/);
});

test("owner review validator accepts only deliberate A/B decisions and limited text", () => {
  assert.deepEqual(validateOwnerDecisionDraft(draft), draft);
  assert.equal(validateOwnerDecisionDraft({ ...draft, notes: "  text  " }).notes, "text");
  for (const invalid of [
    { ...draft, decision: "publish" },
    { ...draft, leftId: draft.rightId },
    { ...draft, leftTitle: "" },
    { ...draft, leftId: "a".repeat(121) },
    { ...draft, notes: "a".repeat(1201) },
    { ...draft, notes: "bad\u0000control" },
    { ...draft, published: true },
  ]) {
    assert.throws(() => validateOwnerDecisionDraft(invalid));
  }
  assert.equal(validateOwnerDecisionDraft({ ...draft, notes: "" }).notes, "");
});

test("reverse A/B ordering reverses the winner, never the intended visual", () => {
  const record = { key: ownerDecisionPairKey(draft.leftId,draft.rightId), draft, revision:1, updatedAt:"2026-11-03T09:00:00Z", updatedBy:"admin" };
  const forward = orientSavedDecision(record, draft.leftId, draft.rightId);
  const flipped = orientSavedDecision(record, draft.rightId, draft.leftId);
  assert.equal(forward.decision, "use-left");
  assert.equal(flipped.decision, "use-right");
  assert.equal(flipped.leftVariantId, draft.rightVariantId);
  assert.equal(flipped.rightVariantId, draft.leftVariantId);
  assert.equal(flipped.notes, draft.notes);
  const other = { ...record, draft: { ...draft, decision: "already-shared" } };
  assert.equal(orientSavedDecision(other, draft.rightId, draft.leftId).decision, "already-shared");
  assert.equal(isMergeRequest("use-left"), true);
  assert.equal(isMergeRequest("new-shared"), true);
  assert.equal(isMergeRequest("keep-separate"), false);
  assert.equal(ownerDecisionLabel("use-right"), "Zjednotiť podľa B");
});

test("storage reuses D1 0152 with isolated namespace, optimistic revisions and no publish", () => {
  const store = read("lib/visual-library-owner-decision-store.ts");
  const sql = read("drizzle/0152_visual_library_banner_edits.sql");
  assert.match(sql, /CREATE TABLE visual_library_banner_edits/);
  assert.match(store, /owner-decision:/);
  assert.match(store, /visual_library_banner_edits/);
  assert.match(store, /published_json IS NULL/);
  assert.match(store, /ON CONFLICT\(banner_id,variant_index\) DO NOTHING/);
  assert.match(store, /revision=revision\+1/);
  assert.match(store, /revision=\?/);
  assert.match(store, /ORDER BY updated_at DESC/);
  assert.match(store, /LIMIT \? OFFSET \?/);
  assert.doesNotMatch(store, /publishVisualDraft|DELETE FROM|published_json=\?/);
});

test("owner decision API is admin-only, strict-origin, read-only for public pages", () => {
  const api = read("app/api/admin/visual-library/owner-decisions/route.ts");
  const ui = read("components/admin-visual-library-owner-compare.tsx");
  assert.match(api, /getAdminApiUser\(\)/);
  assert.match(api, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function PUT/);
  assert.doesNotMatch(api, /export async function (POST|PATCH|DELETE)|publishVisualDraft|invalidateVersionedPublicHtmlCache/);
  assert.match(api, /private, no-store/);
  assert.match(ui, /method: "PUT"/);
  assert.match(ui, /loadingPair/);
  assert.match(ui, /stored\?\.revision \?\? 0/);
  assert.match(ui, /Uložiť rozhodnutie do administrácie/);
  assert.match(ui, /Uložené rozhodnutia/);
  assert.match(ui, /orientSavedDecision/);
  assert.doesNotMatch(ui, /localStorage|indexedDB|DB\.prepare|cloudflare:workers/);
});
