import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  geminiActiveReviewState, geminiActiveReviewCount, geminiCanonicalPublished,
  preserveGeminiPublished,
} from "../lib/gemini-notion-review-state.ts";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("approved and imported still need review; only confirmed publication leaves active count", () => {
  const rows = ["NEW", "IN_PROGRESS", "APPROVED", "IMPORTED", "PUBLISHED", "REJECTED"]
    .map((reviewState, i) => ({ id: String(i), reviewState }));
  assert.deepEqual(rows.filter(r => geminiActiveReviewState(r.reviewState)).map(r => r.reviewState),
    ["NEW", "IN_PROGRESS", "APPROVED", "IMPORTED"]);
  assert.equal(geminiActiveReviewCount(rows), 4);
});

test("only truly public canonical statuses qualify as published across agendas", () => {
  for (const [agenda, accepted, rejected] of [
    ["events", "published", "draft"],
    ["organizations", "PUBLISHED", "DRAFT"],
    ["adoptions", "ACTIVE", "DRAFT"],
    ["help-cases", "published", "draft"],
    ["lost-found", "ACTIVE", "PENDING"],
  ]) {
    assert.equal(geminiCanonicalPublished(agenda, accepted), true, agenda);
    assert.equal(geminiCanonicalPublished(agenda, rejected), false, agenda);
  }
  assert.equal(geminiCanonicalPublished("lost-found", "RESOLVED"), true);
});

test("an older API response cannot demote confirmed published to imported", () => {
  const confirmed = [{ id: "a", reviewState: "PUBLISHED", syncError: "" }];
  const old = [{ id: "a", reviewState: "IMPORTED", syncError: "" }, { id: "b", reviewState: "APPROVED", syncError: "Sync chyba" }];
  const next = preserveGeminiPublished(confirmed, old);
  assert.equal(next[0].reviewState, "PUBLISHED");
  assert.equal(next[1].reviewState, "APPROVED");
  assert.equal(next[1].syncError, "Sync chyba");
  assert.equal(geminiActiveReviewCount(next), 1);
});

test("central and category lists hide published by default and preserve history/filter", () => {
  const center = source("components/admin-gemini-all-concepts.tsx");
  const category = source("components/admin-gemini-notion-drafts.tsx");
  const agenda = source("lib/gemini-notion-agenda-review.ts");
  assert.match(center, /useState<GeminiReviewState \| "ACTIVE" \| "ALL">\("ACTIVE"\)/);
  assert.match(center, /geminiActiveReviewState\(draft\.reviewState\)/);
  assert.match(category, /geminiActiveReviewState\(draft\.reviewState\)/);
  assert.match(category, /geminiActiveReviewCount\(currentDrafts\)/);
  assert.match(center, /<option value="ALL">Všetky stavy<\/option>/);
  assert.match(category, /<option value="ALL">Všetky stavy<\/option>/);
  assert.match(center, /preserveGeminiPublished/);
  assert.match(category, /preserveGeminiPublished/);
  assert.match(category, /\{draft\.syncError &&/);
  assert.match(agenda, /JOIN managed_events d/);
  assert.match(agenda, /JOIN \$\{table\} d/);
});
