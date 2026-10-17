import test from "node:test";
import assert from "node:assert/strict";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiAgendaForKey } from "../lib/gemini-notion-agenda-review.ts";
import {
  geminiCanonicalEditorUrl, geminiCanRejectConcept,
  geminiSupportsRejectionReason, geminiConceptDate,
} from "../lib/gemini-concept-manager.ts";

const canonicalAdminRoute = {
  events: "podujatia", organizations: "organizacie", adoptions: "adopcie",
  "help-cases": "pomoc", "lost-found": "stratene-najdene",
};

test("all 22 Gemini categories open the correct existing canonical D1 editor", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  const coverage = { directory: 0, events: 0, help: 0 };
  for (const item of geminiAutomationCatalog) {
    coverage[item.section]++;
    const agenda = item.section === "directory" ? undefined : geminiAgendaForKey(item.stableKey);
    const section = agenda ? canonicalAdminRoute[agenda] : "adresar";
    assert.ok(section, item.stableKey);
    assert.equal(geminiCanonicalEditorUrl({
      psipediaId: "123", canonicalVerified: true, ...(agenda ? { agenda } : {}),
    }), "/admin/" + section + "/123", item.stableKey);
    assert.equal(geminiCanonicalEditorUrl({ psipediaId: "", canonicalVerified: false,
      ...(agenda ? { agenda } : {}) }), null, item.stableKey);
  }
  assert.deepEqual(coverage, { directory: 10, events: 6, help: 6 });
});

test("Notion-only, unverified ID, titles, leading zeroes and unsafe numbers never become admin links", () => {
  for (const psipediaId of ["", "0", "-5", "12x", "../123", "01", "9007199254740992"]) {
    assert.equal(geminiCanonicalEditorUrl({ psipediaId, canonicalVerified: true }), null, psipediaId);
  }
  assert.equal(geminiCanonicalEditorUrl({ psipediaId: "123", canonicalVerified: false }), null);
  assert.equal(geminiCanonicalEditorUrl({ psipediaId: "123" }), null);
  assert.equal(geminiCanonicalEditorUrl({
    psipediaId: "123", canonicalVerified: true, agenda: "lost-found",
  }), "/admin/stratene-najdene/123");
});

test("rejection is blocked for imported/published, with reason support limited to existing audit schema", () => {
  for (const reviewState of ["NEW", "IN_PROGRESS", "APPROVED"]) {
    assert.equal(geminiCanRejectConcept({ psipediaId: "", reviewState }), true);
  }
  for (const reviewState of ["IMPORTED", "PUBLISHED", "REJECTED"]) {
    assert.equal(geminiCanRejectConcept({ psipediaId: "", reviewState }), false);
  }
  assert.equal(geminiCanRejectConcept({ psipediaId: "456", reviewState: "NEW" }), false);
  assert.equal(geminiSupportsRejectionReason({ psipediaId: "" }), true);
  assert.equal(geminiSupportsRejectionReason({ psipediaId: "", agenda: "help-cases" }), true);
  for (const agenda of ["events", "adoptions", "organizations", "lost-found"]) {
    assert.equal(geminiSupportsRejectionReason({ psipediaId: "", agenda }), false);
  }
});

test("concept date displays missing/invalid values without crashing", () => {
  assert.equal(geminiConceptDate(""), "—");
  assert.equal(geminiConceptDate("not-a-date"), "—");
  assert.match(geminiConceptDate("2026-10-17T10:51:00.000Z"), /2026/);
});
