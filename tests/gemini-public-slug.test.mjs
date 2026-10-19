import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  geminiNeedsPublicSlug, geminiPublicSlug, normalizeGeminiPublicSlug, resolveGeminiPublicSlug,
} from "../lib/gemini-public-slug.ts";

const one = "01234567-89ab-cdef-0123-456789abcdef";
const two = "fedcba98-7654-3210-fedc-ba9876543210";
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function mockDatabase(existing) {
  const reads = [];
  return { reads, prepare(sql) {
    assert.match(sql, /^SELECT 1 AS found FROM (?:directory_profiles|managed_events|help_organizations|adoption_dogs|help_cases|lost_found_dog_reports) WHERE slug=\? LIMIT 1$/);
    return { bind(slug) { reads.push({ sql, slug }); return {
      async first() { return existing.has(slug) ? { found: 1 } : null; },
    }; } };
  } };
}

test("Slovak names, accents, cities and deterministic identity create clean public slugs", () => {
  assert.equal(normalizeGeminiPublicSlug("  Veterinárna klinika Žilina  "), "veterinarna-klinika-zilina");
  assert.equal(geminiPublicSlug("Psí salón Ľubica", "Nové Zámky", one),
    "psi-salon-lubica-nove-zamky-0123456789ab");
  assert.ok(!geminiPublicSlug("Útulok", "Nitra", one).startsWith("gemini-"));
  assert.notEqual(geminiPublicSlug("Útulok", "Nitra", one),
    geminiPublicSlug("Útulok", "Nitra", two));
  assert.equal(geminiPublicSlug("Útulok", "Nitra", one),
    geminiPublicSlug("Útulok", "Nitra", one));
  assert.ok(geminiPublicSlug("a".repeat(140), "Nitra", one).length <= 90);
  assert.throws(() => geminiPublicSlug("Test", "Nitra", "untrusted"), /INVALID_PROVENANCE/);
});

test("only missing and legacy gemini- slugs are regenerated", () => {
  for (const slug of ["", " ", "gemini-123", "GEMINI-old"]) assert.equal(geminiNeedsPublicSlug(slug), true);
  assert.equal(geminiNeedsPublicSlug("utulok-nitra"), false);
});

test("collision moves to full stable Notion ID; second collision fails closed", async () => {
  const short = geminiPublicSlug("Útulok", "Nitra", one);
  const long = geminiPublicSlug("Útulok", "Nitra", one, true);
  const args = { requestedSlug: "gemini-legacy", name: "Útulok", city: "Nitra", notionPageId: one };
  const db = mockDatabase(new Set([short]));
  assert.equal(await resolveGeminiPublicSlug(db, "organizations", args), long);
  assert.equal(db.reads.length, 2);
  await assert.rejects(resolveGeminiPublicSlug(mockDatabase(new Set([short, long])), "organizations", args),
    /GEMINI_PUBLIC_SLUG_CONFLICT/);
  assert.equal(await resolveGeminiPublicSlug(mockDatabase(new Set()), "events", { ...args, requestedSlug: "vlastny-slug" }),
    "vlastny-slug");
});

test("all 6 canonical agenda tables and directory use safe read-only collision checks", async () => {
  for (const agenda of ["directory", "events", "organizations", "adoptions", "help-cases", "lost-found"]) {
    const db = mockDatabase(new Set());
    const slug = await resolveGeminiPublicSlug(db, agenda, {
      requestedSlug: "", name: "Psia pomoc", city: "Žilina", notionPageId: one,
    });
    assert.ok(slug.startsWith("psia-pomoc-zilina-"), agenda);
    assert.equal(db.reads.length, 1, agenda);
  }
});

test("verified Notion import boundaries do not regenerate technical slugs, canonical updates preserve public URLs", () => {
  const directory = source("lib/notion-directory-sync.ts");
  const agenda = source("lib/notion-events-help-sync.ts");
  const adapter = source("lib/notion-events-help-adapters.ts");
  assert.match(directory, /desired\.slug = await resolveGeminiPublicSlug/);
  assert.match(directory, /status: current\.status, slug: current\.slug/);
  assert.match(agenda, /await resolveGeminiPublicSlug\(input\.database/);
  assert.match(adapter, /values = \{ \.\.\.values, "Slug": row\.slug \}/);
  assert.doesNotMatch(directory, /desired\.slug = "gemini-" \+/);
  assert.doesNotMatch(agenda, /"Slug": "gemini-" \+/);
});
