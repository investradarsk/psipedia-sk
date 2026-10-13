import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createReport, renderMarkdown } from "../scripts/d1-insights-report.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/d1-insights-sample.json", import.meta.url), "utf8"));

test("aggregates Wrangler JSON by category and SQL operation", () => {
  const report = createReport(fixture);
  assert.equal(report.summary.exported_records, 5);
  assert.equal(report.summary.normalized_queries, 4);
  assert.equal(report.by_category[0].executions, 10);
  assert.equal(report.by_category[0].duration_ms.total, 50);
  assert.equal(report.by_category[0].duration_ms.average, 5);
  assert.equal(report.by_category[0].rows_read.total, 1300);
  assert.equal(report.by_category[1].rows_written.total, 0);
  assert.equal(report.by_type.find((r) => r.operation === "SELECT").executions, null);
  assert.equal(report.top_by_rows_read[0].category, "adresár");
});

test("protects raw SQL, literals, comments and profile details", () => {
  const report = createReport(fixture);
  const output = JSON.stringify(report) + renderMarkdown(report);
  for (const forbidden of ["Some Patient Name", "TokenSECRET", "profile@email.test", "sensitive_name", "Jane"]) {
    assert.ok(!output.includes(forbidden), forbidden);
  }
  assert.match(output, /nezískané/);
  assert.equal(report.summary.rows_written.total, null);
  assert.equal(report.provenance.origin, "fixture");
});

test("missing values are null rather than zero, while reported zero remains zero", () => {
  const report = createReport([{ query: "SELECT * FROM managed_events", numberOfTimesRun: 5, totalRowsWritten: 0 }]);
  assert.equal(report.summary.duration_ms.total, null);
  assert.equal(report.summary.rows_read.total, null);
  assert.equal(report.summary.rows_written.total, 0);
  assert.equal(report.summary.rows_written.average, 0);
  assert.equal(report.by_category[0].executions, null);
  assert.equal(report.by_category[0].rows_read.total, null);
});

test("derives when only average and count are available and marks its provenance", () => {
  const report = createReport([{ query: "SELECT * FROM managed_events WHERE id = 52", avgDurationMs: 3, avgRowsRead: 8, numberOfTimesRun: 4 }]);
  assert.equal(report.summary.duration_ms.total, 12);
  assert.equal(report.summary.duration_ms.basis, "includes_derived_from_average");
  assert.equal(report.summary.rows_read.total, 32);
  assert.equal(report.summary.rows_written.total, null);
});

test("deduplicates literal variants without exposing SQL text", () => {
  const report = createReport([
    { query: "SELECT * FROM directory_profiles WHERE id=10", numberOfTimesRun: 2, totalDurationMs: 4 },
    { query: "SELECT * FROM directory_profiles WHERE id=20", numberOfTimesRun: 3, totalDurationMs: 6 },
  ]);
  assert.equal(report.summary.normalized_queries, 1);
  assert.equal(report.queries[0].duration_ms.total, 10);
  assert.equal(report.queries[0].executions, 5);
});

test("supports GraphQL nested group wrapper without invented zero metrics", () => {
  const report = createReport({ data: { viewer: { accounts: [{ d1QueriesAdaptiveGroups: [{
    dimensions: { query: "SELECT * FROM managed_events" },
    count: 2, sum: { rowsRead: 100 },
  }] }] } } }, { origin: "production", period: "7d" });
  assert.equal(report.summary.rows_read.total, 100);
  assert.equal(report.summary.duration_ms.total, null);
  assert.equal(report.provenance.period, "7d");
});

test("rejects unsafe or malformed imports and prevents leaking error data", () => {
  assert.throws(() => createReport({ unexpected: [] }));
  assert.throws(() => createReport([{ query: "SELECT 1", numberOfTimesRun: -2 }]), /Invalid|missing|report/i);
});

test("CLI writes only sanitized JSON and prints aggregate Markdown", () => {
  const dir = mkdtempSync(join(tmpdir(), "d1-report-"));
  const input = join(dir, "raw.json");
  const output = join(dir, "safe.json");
  writeFileSync(input, JSON.stringify(fixture));
  const result = spawnSync(process.execPath, ["scripts/d1-insights-report.mjs", "--input", input, "--period", "7d", "--origin", "production", "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(output));
  assert.equal(JSON.parse(readFileSync(output, "utf8")).provenance.origin, "production");
  assert.match(result.stdout, /Najviac čítaných riadkov/);
  assert.ok(!readFileSync(output, "utf8").includes("Some Patient Name"));
  assert.ok(!result.stdout.includes("Some Patient Name"));
});
