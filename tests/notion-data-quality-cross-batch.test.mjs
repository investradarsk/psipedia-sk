import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { analyzeNotionCrossBatch } from "../lib/notion-data-quality-cross-batch.ts";

const key = (n) => n.toString(16).padStart(64, "0");
const RUN = key(901);
const CHECKPOINT = key(902);
const SOURCE = key(903);
const CURSORS = [null, key(904), key(905)];

function page(n, ps = n) {
  return { notionKey: key(10_000 + n), psipediaKey: ps === null ? null : key(20_000 + ps) };
}
function batch({
  records, agenda = "directory", sourceKey = SOURCE, runKey = RUN,
  checkpointKey = CHECKPOINT, pass = 1, batchNumber = 1,
  requestCursorKey = null, nextCursorKey = null, hasMore = false,
} = {}) {
  return {
    agenda, sourceKey, runKey, checkpointKey, pass, batchNumber,
    requestCursorKey, nextCursorKey, hasMore, records: records ?? [page(1)],
  };
}
function multipass(total = 230) {
  const records = Array.from({ length: total }, (_, i) => page(i + 1));
  const parts = [records.slice(0, 100), records.slice(100, 200), records.slice(200)];
  return [1, 2].flatMap((pass) => parts.map((rows, i) => batch({
    pass, batchNumber: i + 1, records: rows.map((entry) => ({ ...entry })),
    requestCursorKey: CURSORS[i], nextCursorKey: i < 2 ? CURSORS[i + 1] : null,
    hasMore: i < 2,
  })));
}

test("230 synthetic identities, 2 passes and 6 batches: no false cross-pass duplicates", () => {
  const result = analyzeNotionCrossBatch(multipass());
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.evidence.examinedRecords, 460);
  assert.equal(result.evidence.firstPassRecords, 230);
  assert.equal(result.evidence.secondPassRecords, 230);
  assert.equal(result.evidence.expectedSecondPassReappearances, 230);
  assert.equal(result.evidence.distinctPageAppearancesWithinPasses, 460);
  assert.equal(result.evidence.repeatedPageAcrossBatches, 0);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 0);
  assert.equal(result.evidence.completeCursorChains, 2);
  assert.equal(result.evidence.incompletePasses, 0);
  assert.ok(result.unknown.includes("GLOBAL_ORPHAN_MAPPINGS_UNPROVEN"));
  assert.ok(result.unknown.includes("IMMUTABLE_NOTION_SNAPSHOT_UNPROVEN"));
});

test("same Notion page appearing in two 100-row batches is REVIEW, not definitive proof of a source duplicate", () => {
  const batches = multipass();
  batches[1].records[20] = { ...batches[0].records[17] };
  const result = analyzeNotionCrossBatch(batches);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.evidence.repeatedPageAcrossBatches, 1);
  assert.equal(result.reasonCounts.NOTION_PAGE_REAPPEARED_ACROSS_BATCHES, 1);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 0);
});

test("two different Notion pages claiming same Psipedia identity across batches is CONFLICT", () => {
  const batches = multipass();
  batches[1].records[20].psipediaKey = batches[0].records[17].psipediaKey;
  const result = analyzeNotionCrossBatch(batches);
  assert.equal(result.verdict, "CONFLICT");
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 1);
  assert.equal(result.reasonCounts.PSIPEDIA_ID_CLAIMED_BY_DISTINCT_PAGES, 1);
});

test("two different pages claiming one Psipedia identity within a batch is independently counted", () => {
  const result = analyzeNotionCrossBatch([batch({
    records: [page(1), page(2, 1)],
  })]);
  assert.equal(result.verdict, "CONFLICT");
  assert.equal(result.evidence.repeatedPsipediaIdWithinBatch, 1);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 0);
});

test("six agendas, separate runs and separate Notion sources never cross-pollinate identity collisions", () => {
  const agendas = ["directory", "events", "organizations", "adoptions", "help-cases", "lost-found"];
  const batches = agendas.map((agenda, index) => batch({
    agenda, runKey: key(100 + index), sourceKey: key(200 + index),
    records: [page(1)],  // Deliberately identical tokens across scopes.
  }));
  batches.push(batch({ runKey: key(999), sourceKey: key(888), records: [page(1)] }));
  const result = analyzeNotionCrossBatch(batches);
  assert.equal(result.verdict, "UNKNOWN");
  assert.equal(result.evidence.auditRuns, 7);
  assert.equal(result.evidence.isolatedSources, 7);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 0);
  assert.equal(result.evidence.repeatedPageAcrossBatches, 0);
});

test("source swap inside the same run is REVIEW and prevents cross-source ID matching", () => {
  const result = analyzeNotionCrossBatch([
    batch({ sourceKey: key(111), records: [page(1)], hasMore: true, nextCursorKey: key(112) }),
    batch({ sourceKey: key(113), batchNumber: 2, records: [page(2, 1)],
      requestCursorKey: key(112) }),
  ]);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.evidence.sourceChanges, 1);
  assert.equal(result.evidence.isolatedSources, 2);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 0);
  assert.equal(result.reasonCounts.SOURCE_CHANGED_WITHIN_RUN, 1);
});

test("changed checkpoint downgrades a repeated canonical claim to REVIEW", () => {
  const result = analyzeNotionCrossBatch([
    batch({ records: [page(1)], hasMore: true, nextCursorKey: key(112) }),
    batch({ checkpointKey: key(2000), batchNumber: 2, records: [page(2, 1)],
      requestCursorKey: key(112) }),
  ]);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.evidence.checkpointChanges, 1);
  assert.equal(result.evidence.repeatedPsipediaIdAcrossBatches, 1);
  assert.equal(result.reasonCounts.CHECKPOINT_CHANGED_WITHIN_RUN, 1);
});

test("second-pass identity changes are REVIEW; repeated page identities themselves are expected", () => {
  const batches = multipass();
  batches[4].records[0].psipediaKey = key(90_000);
  const result = analyzeNotionCrossBatch(batches);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.evidence.expectedSecondPassReappearances, 230);
  assert.equal(result.evidence.differingMappingsBetweenPasses, 1);
  assert.equal(result.evidence.repeatedPageAcrossBatches, 0);
  assert.equal(result.reasonCounts.CROSS_PASS_MAPPING_CHANGED, 1);
});

test("a changed identity set between complete passes is REVIEW, not a claimed deletion", () => {
  const batches = multipass();
  batches[5].records[0] = page(9011);
  const result = analyzeNotionCrossBatch(batches);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.reasonCounts.CROSS_PASS_IDENTITY_SET_CHANGED, 1);
  assert.ok(result.unknown.includes("IMMUTABLE_NOTION_SNAPSHOT_UNPROVEN"));
});

test("missing start, missing continuation, duplicate index and nonterminal end all mark cursor coverage incomplete", () => {
  const cases = [
    [batch({ requestCursorKey: key(1) })],
    [batch({ hasMore: true, nextCursorKey: null })],
    [batch({ hasMore: true, nextCursorKey: key(2) })],
    [
      batch({ hasMore: true, nextCursorKey: key(2) }),
      batch({ batchNumber: 2, requestCursorKey: key(3), records: [page(2)] }),
    ],
    [
      batch({ hasMore: true, nextCursorKey: key(2) }),
      batch({ batchNumber: 1, requestCursorKey: key(2), records: [page(2)] }),
    ],
  ];
  for (const pages of cases) {
    const result = analyzeNotionCrossBatch(pages);
    assert.notEqual(result.verdict, "CONFLICT");
    assert.equal(result.evidence.incompletePasses > 0, true);
    assert.equal(result.evidence.cursorProblems > 0 || result.reasonCounts.PASS_COVERAGE_UNKNOWN > 0, true);
  }
});

test("no batches and single-pass clean runs remain UNKNOWN rather than CLEAN or globally verified", () => {
  const empty = analyzeNotionCrossBatch([]);
  assert.equal(empty.verdict, "UNKNOWN");
  assert.equal(empty.evidence.examinedRecords, 0);
  const one = analyzeNotionCrossBatch([batch({ records: [page(1), page(2, null)] })]);
  assert.equal(one.verdict, "UNKNOWN");
  assert.equal(one.evidence.missingPsipediaIdentities, 1);
  assert.equal(one.evidence.incompletePasses, 1);
  assert.ok(one.reasonCounts.PASS_NOT_PROVIDED);
});

test("input boundary rejects raw IDs, private fields, emails, URLs, contacts, overlong batches and invalid pseudonyms", () => {
  const invalid = [
    [batch({ records: [{ notionKey: key(1), psipediaKey: key(2), contactEmail: "private@invalid.test" }] })],
    [batch({ records: [{ notionPageId: "raw-notion-page", psipediaId: "123" }] })],
    [{ ...batch(), address: "private street 5" }],
    [batch({ records: [{ notionKey: key(1), psipediaKey: "123" }] })],
    [batch({ records: [{ notionKey: key(1), psipediaKey: null, phone: "+421900000000" }] })],
    [batch({ records: Array.from({ length: 101 }, (_, i) => page(i)) })],
    [{ ...batch(), requestCursorKey: undefined }],
    [batch({ hasMore: "true" })],
    Array.from({ length: 501 }, () => batch()),
    null,
  ];
  for (const input of invalid) {
    assert.throws(() => analyzeNotionCrossBatch(input), (error) => {
      assert.equal(error.message, "INVALID_ANONYMIZED_CROSS_BATCH_INPUT");
      assert.doesNotMatch(error.message, /private|421|address|contact|@/i);
      return true;
    });
  }
});

test("output contains counts and reason codes, never the input's identity or cursor tokens", () => {
  const input = multipass();
  const output = JSON.stringify(analyzeNotionCrossBatch(input));
  assert.equal(output.includes(key(10_001)), false);
  assert.equal(output.includes(key(20_001)), false);
  assert.equal(output.includes(RUN), false);
  assert.equal(output.includes(CHECKPOINT), false);
  assert.equal(output.includes(SOURCE), false);
  assert.equal(output.includes(CURSORS[1]), false);
  assert.equal(output.includes("notionKey"), false);
  assert.equal(output.includes("psipediaKey"), false);
  assert.equal(output.includes("requestCursorKey"), false);
});

test("offline helper has no Notion/D1 write, network, storage, or side-effect imports", async () => {
  const source = await readFile(new URL("../lib/notion-data-quality-cross-batch.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["'](?:node:fs|node:http|node:https|cloudflare:workers)["']/);
  assert.doesNotMatch(source, /\b(?:fetch|notionRequest|console\.log|localStorage)\s*\(/);
  assert.doesNotMatch(source, /\.(?:run|exec)\s*\(/);
  assert.match(source, /import type \{ NotionAuditAgenda \}/);
  assert.match(source, /records\.length > 100/);
  assert.match(source, /input\.length > 500/);
});
