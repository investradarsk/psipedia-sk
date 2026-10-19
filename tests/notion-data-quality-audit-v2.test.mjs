import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  analyzeAuditEvidence,
  auditFieldNames,
  classifyAuditHashes,
  loadAuditD1Evidence,
} from "../lib/notion-data-quality-audit-v2.ts";
import { classifyDirectorySyncError } from "../lib/notion-data-quality-recovery.ts";

const rich = (value) => ({ rich_text: [{ plain_text: String(value) }] });
const page = (pid, id, extra = {}) => ({
  id: pid,
  properties: { "Psipedia ID": rich(id), ...extra },
});
const hash = (char) => char.repeat(64);

test("two-sided current hash divergence is CONFLICT, not UPDATE", () => {
  const result = classifyAuditHashes({ baseline: hash("a"), notion: hash("b"), canonical: hash("c") }, false);
  assert.equal(result.decision, "CONFLICT");
  assert.equal(result.reason, "BIDIRECTIONAL_CONFLICT");
  assert.equal(result.notionChanged, true);
  assert.equal(result.d1Changed, true);
});

test("stale/legacy baselines stay REVIEW unless three valid comparable hashes exist", () => {
  assert.equal(classifyAuditHashes({ baseline: null, notion: hash("a"), canonical: hash("a") }, false).reason,
    "LEGACY_BASELINE_MISMATCH");
  assert.equal(classifyAuditHashes({ baseline: hash("a"), notion: null, canonical: hash("a") }, false).decision,
    "REVIEW");
  assert.equal(classifyAuditHashes({ baseline: hash("a"), notion: hash("a"), canonical: hash("a") }, false).decision,
    "UNCHANGED");
  assert.equal(classifyAuditHashes({ baseline: hash("a"), notion: hash("a"), canonical: hash("b") }, false).decision,
    "UPDATE");
  assert.equal(classifyAuditHashes({ baseline: hash("a"), notion: hash("b"), canonical: hash("a") }, true).decision,
    "REVIEW");
});

test("independent duplicate identity, orphan and absent mapping checks never force writes", () => {
  const sample = [page("p1", 9), page("p2", 9), page("p3", 10), page("p4", 11)];
  const evidence = {
    coverage: "VERIFIED",
    canonicalIds: [9, 11],
    mappings: [
      { notion_page_id: "p1", entity_id: 9, content_hash: hash("a") },
      { notion_page_id: "p3", entity_id: 10, content_hash: hash("a") },
    ],
  };
  const result = analyzeAuditEvidence("events", sample, evidence);
  assert.equal(result.items[0].reason, "DUPLICATE_IDENTITY");
  assert.equal(result.items[1].decision, "CONFLICT");
  assert.equal(result.items[2].reason, "ORPHAN_MAPPING");
  assert.equal(result.items[3].reason, "MISSING_MAPPING");
  assert.equal(result.totals.UPDATE, 0);
});

test("confirmed Google place, NOT_REQUIRED and GEO privacy guard proposed changes", () => {
  const sample = [
    page("confirmed", 1, { "Potvrdená prevádzka": { checkbox: true } }),
    page("not-required", 2, { "Google Maps netreba": { checkbox: true } }),
    page("private", 3, {
      "Latitude": { number: 48.5 }, "Longitude": { number: 18.2 },
      "Presnosť lokality": { select: { name: "APPROXIMATE" } },
    }),
  ];
  const mappings = sample.map((p, i) => ({ notion_page_id: p.id, entity_id: i + 1, content_hash: hash("a") }));
  const proof = Object.fromEntries(sample.map((p) => [p.id, { notion: hash("b"), canonical: hash("a") }]));
  const d1 = { coverage: "VERIFIED", canonicalIds: [1, 2, 3], mappings };
  const dir = analyzeAuditEvidence("directory", sample.slice(0, 2), d1, proof);
  assert.equal(dir.items[0].decision, "REVIEW");
  assert.equal(dir.items[0].reason, "CONFIRMED_SITE_REVIEW_REQUIRED");
  assert.equal(dir.items[1].reason, "NOT_REQUIRED");
  const help = analyzeAuditEvidence("help-cases", sample.slice(2), d1, proof);
  assert.equal(help.items[0].decision, "REVIEW");
  assert.equal(help.items[0].reason, "PRIVACY_REVIEW_REQUIRED");
});

test("event 187 field-level differences list field names but never values", () => {
  const result = auditFieldNames("events",
    { Názov: "Notion secret", Miesto: "venue" },
    { Názov: "Psipedia private", Miesto: "venue" });
  assert.deepEqual(result, ["Názov"]);
  assert.equal(JSON.stringify(result).includes("Notion secret"), false);
  assert.equal(auditFieldNames("events", null, { Názov: "abc" }), null);
});

test("all six operational agendas query bounded IDs and proper isolated table only", async () => {
  const table = {
    directory: "directory_notion_sync", events: "event_notion_sync",
    organizations: "notion_agenda_sync", adoptions: "notion_agenda_sync",
    "help-cases": "notion_agenda_sync", "lost-found": "notion_agenda_sync",
  };
  for (const agenda of Object.keys(table)) {
    const statements = [];
    const db = {
      prepare(sql) {
        statements.push(sql);
        return { bind(...args) {
          assert.ok(args.length <= 200 + 1);
          return { async all() {
            if (sql.includes("SELECT id FROM")) return { results: [{ id: 7 }] };
            return { results: [{ notion_page_id: "p7", entity_id: 7, content_hash: hash("a") }] };
          } };
        } };
      },
    };
    const evidence = await loadAuditD1Evidence(db, agenda, [page("p7", 7)]);
    assert.equal(evidence.coverage, "VERIFIED");
    assert.deepEqual(evidence.canonicalIds, [7]);
    assert.ok(statements[0].includes(table[agenda]));
    assert.ok(!statements.join(" ").match(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/));
    const analysis = analyzeAuditEvidence(agenda, [page("p7", 7)], evidence);
    assert.equal(analysis.items[0].mapping, "MATCH");
    assert.equal(analysis.items[0].baseline, "PRESENT");
    assert.equal(analysis.items[0].decision, "REVIEW");
  }
});

test("Notion unavailable / D1 unavailable never implies missing identity or automatic UPDATE", async () => {
  const unavailable = { prepare() { throw Error("PRIVATE_ADDRESS_AND_CONTACT_SHOULD_NOT_LEAK"); } };
  const evidence = await loadAuditD1Evidence(unavailable, "directory", [page("p3", 3)]);
  assert.equal(evidence.coverage, "UNKNOWN");
  const report = analyzeAuditEvidence("directory", [page("p3", 3, {
    Adresa: rich("Súkromná 99"),
    "Latitude": { number: 48.9 },
  })], evidence);
  assert.equal(report.items[0].decision, "REVIEW");
  assert.equal(report.items[0].reason, "UNKNOWN_SOURCE");
  assert.ok(!JSON.stringify(report).includes("Súkromná 99"));
  assert.ok(!JSON.stringify(report).includes("PRIVATE_ADDRESS"));
  assert.equal(report.unknown.includes("D1_MAPPING_AND_CANONICAL_COVERAGE"), true);
});

test("pagination 100, pass 1/2 checkpoint and one source isolation are part of read-only API contract", async () => {
  const route = await readFile(new URL("../app/api/admin/notion-data-quality-audit/route.ts", import.meta.url), "utf8");
  assert.match(route, /page_size: 100/);
  assert.match(route, /body\.pass === 2/);
  assert.match(route, /body\.sourceId && body\.sourceId !== dataSourceId/);
  assert.match(route, /sorts: \[\{ timestamp: "created_time"/);
  assert.match(route, /nextPass: !hasMore && pass === 1 \? 2 : null/);
  assert.match(route, /passesComplete: !hasMore && pass === 2/);
  assert.match(route, /MULTIPLE_NOTION_SOURCES_REQUIRE_REVIEW/);
  assert.match(route, /NOTION_AUDIT_UNAVAILABLE/);
  assert.match(route, /allowCreate: false/);
  assert.match(route, /persist: false/);
  assert.doesNotMatch(route, /method: "PATCH"|\b\.run\(\)|\bINSERT INTO\b/);
  assert.throws(() => analyzeAuditEvidence("events", Array.from({ length: 101 }, (_, i) => page(String(i), i+1)),
    { coverage: "VERIFIED", mappings: [], canonicalIds: [] }), /AUDIT_BATCH_LIMIT/);
});

test("distinct error taxonomy preserves 403 vs 522 and never repairs Illegal invocation", () => {
  const cases = [
    ["Illegal invocation: function called with incorrect this reference", "ILLEGAL_INVOCATION"],
    ["Hlavný obrázok sa nepodarilo stiahnuť (HTTP 403)", "REMOTE_IMAGE_HTTP_403"],
    ["Hlavný obrázok sa nepodarilo stiahnuť (HTTP 522)", "REMOTE_IMAGE_HTTP_522"],
    ["Neplatný formát obrázka", "INVALID_IMAGE_FORMAT"],
    ["Doplň číslo domu", "MISSING_HOUSE_NUMBER"],
    ["Najprv vyber platný kraj, okres a obec", "INVALID_LOCALITY"],
  ];
  for (const [message, type] of cases) assert.equal(classifyDirectorySyncError(message), type);
});
