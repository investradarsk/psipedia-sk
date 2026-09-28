import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KOSICE_FOUND_DOG_DETAIL_ADAPTER,
  kosiceFoundDogDetailAdapter,
} from "../lib/data-automation-lost-found-adapters.ts";
import { unsupportedAutomationApplyFields } from "../lib/data-automation-apply.ts";

function source(sourceUrl) {
  return {
    id: 903,
    entityType: "LOST_FOUND",
    connectorType: "CONTROLLED_HTML",
    sourceUrl,
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: KOSICE_FOUND_DOG_DETAIL_ADAPTER,
      expectedMinRecords: 1,
    },
    maxRecordsPerRun: 10,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };
}

const fixture = readFileSync(
  new URL("./fixtures/data-automation/kosice-found-dog-detail.html", import.meta.url),
  "utf8",
);

function parse(html = fixture, url = "https://www.kosice.sk/clanok/opusteny-pes-225") {
  return kosiceFoundDogDetailAdapter({ html, source: source(url) });
}

test("Košice FOUND detail parses one deterministic canonical-safe LOST_FOUND record", () => {
  const first = parse();
  const second = parse();

  assert.equal(first.length, 1);
  assert.deepEqual(second, first);
  assert.equal(first[0].sourceRecordId, "https://kosice.sk/clanok/opusteny-pes-225");
  assert.equal(first[0].sourceUrl, "https://kosice.sk/clanok/opusteny-pes-225");
  assert.equal(first[0].sourceTimestamp, null);
  assert.equal(first[0].rawRecord.title, "Opustený pes");
  assert.equal(first[0].rawRecord.eventDate, "2026-09-09");
  assert.equal(first[0].rawRecord.resolvedSignal, false);
  assert.deepEqual(first[0].proposed, {
    type: "FOUND",
    description: "Dňa 9.9.2026 na ul. Rybárska 18 v Košiciach bol nájdený opustený pes bez majiteľa.",
    eventDate: "2026-09-09",
    city: "Košice",
    source: "Mesto Košice — Mestská polícia",
    sourceUrl: "https://kosice.sk/clanok/opusteny-pes-225",
    locationDescription: "Rybárska 18",
  });
});

test("FOUND type requires explicit found semantics and ambiguous or LOST pages fail closed", () => {
  assert.deepEqual(parse(fixture.replace("bol nájdený", "sa pohyboval")), []);
  assert.deepEqual(parse(
    fixture
      .replace("<h1>Opustený pes</h1>", "<h1>Stratený pes</h1>")
      .replace("bol nájdený opustený pes", "bol nájdený túlavý pes"),
    "https://www.kosice.sk/clanok/najdeny-pes-999",
  ), []);
});

test("foreign hosts and unsupported paths fail closed", () => {
  assert.deepEqual(parse(fixture, "https://example.sk/clanok/opusteny-pes-225"), []);
  assert.deepEqual(parse(fixture, "https://www.kosice.sk/clanky/archiv/1"), []);
  assert.deepEqual(parse(fixture.replace("<h1>Opustený pes</h1>", "<h1>Nájdená mačka</h1>"), "https://www.kosice.sk/clanok/najdena-macka"), []);
});

test("malformed HTML and missing explicit event date fail closed without inventing eventDate", () => {
  assert.deepEqual(parse("<html><body>Dňa 9.9.2026 bol nájdený pes v Košiciach.</body></html>"), []);
  assert.deepEqual(parse(fixture.replace("Dňa 9.9.2026", "V septembri 2026")), []);
  assert.deepEqual(parse(fixture.replace("Dňa 9.9.2026", "Publikované 10.09.2026")), []);
});

test("raw provenance and proposed payload do not leak contact details", () => {
  const [record] = parse();
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /0948\s*433\s*058/);
  assert.doesNotMatch(serialized, /uvplp\.ke@gmail\.com/i);
  assert.doesNotMatch(serialized, /msp@kosice\.sk/i);
  assert.doesNotMatch(serialized, /Kysucká\s+16/i);
});

test("resolution signal remains provenance-only", () => {
  const [record] = parse(
    fixture.replace(
      "Pes nebol označený čipom",
      "Majiteľ bol dohľadaný. Pes nebol označený čipom",
    ),
  );
  assert.equal(record.rawRecord.resolvedSignal, true);
  assert.equal(record.lifecycleSignals?.[0]?.signalType, "LOST_FOUND_RESOLVED");
  assert.equal(record.lifecycleSignals?.[0]?.targetState, "RESOLVED");
  assert.match(record.lifecycleSignals?.[0]?.evidenceText ?? "", /Majiteľ bol dohľadaný/i);
  assert.equal(Object.hasOwn(record.proposed, "status"), false);
  assert.equal(Object.hasOwn(record.proposed, "resolved"), false);
  assert.equal(Object.hasOwn(record.proposed, "resolvedAt"), false);
});

test("item disappearance has no lifecycle side effect because the adapter is stateless", () => {
  assert.deepEqual(kosiceFoundDogDetailAdapter({
    html: "",
    source: source("https://www.kosice.sk/clanok/opusteny-pes-225"),
  }), []);
});

test("LOST_FOUND proposal fields are accepted by the canonical apply allowlist", () => {
  const [record] = parse();
  const diff = Object.fromEntries(Object.keys(record.proposed).map((key) => [key, { before: null, after: record.proposed[key] }]));
  assert.deepEqual(unsupportedAutomationApplyFields("LOST_FOUND", diff), []);
});

test("stable identity uses the concrete detail URL, never array position, mutable title, city/date, or parser time", () => {
  const [record] = parse();
  assert.equal(record.sourceRecordId, record.sourceUrl);
  assert.notEqual(record.sourceRecordId, "0");
  assert.doesNotMatch(record.sourceRecordId, /Opustený pes|Košice|2026-09-09/);
});

test("LOST_FOUND canonical apply keeps CREATE_DRAFT lifecycle fail-closed", () => {
  const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
  const lostFoundDraft = applySource.match(/if \(finding\.entityType === "LOST_FOUND"\)[\s\S]*?\n  const isFoster/)?.[0] ?? "";
  assert.match(lostFoundDraft, /status:\s*"DRAFT"/);
  assert.match(lostFoundDraft, /published_at:\s*null/);
});
