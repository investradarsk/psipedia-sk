import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const engine = readFileSync(new URL("../lib/data-quality-missing-hourly.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/admin-missing-quality-dashboard.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0142_quality_missing_scan_outcomes.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const observer = readFileSync(new URL("../lib/admin-scheduled-observer.ts", import.meta.url), "utf8");
const events = readFileSync(new URL("../lib/admin-automation-events.ts", import.meta.url), "utf8");

test("hourly scan persists an outcome while preserving original per-hour claims", () => {
  assert.match(migration, /ALTER TABLE quality_missing_scans[\s\S]*ADD COLUMN status/);
  assert.match(migration, /DEFAULT 'UNKNOWN'/);
  assert.match(migration, /ADD COLUMN error_code TEXT/);
  assert.match(engine, /INSERT OR IGNORE INTO quality_missing_scans\(area,hour,scanned_at,status\)/);
  assert.match(engine, /if \(!claimed\.meta\.changes\) continue/);
  assert.match(engine, /if \(!\(await hasScanStatusColumns\(db\)\)\)/);
  assert.match(engine, /schemaReady: false/);
});

test("failed Tavily requests remain on the same profile until a successful persistence", () => {
  const search = engine.indexOf("const search = await provider.searchWithImages");
  const success = engine.indexOf("UPDATE quality_missing_scans SET status='SUCCESS'", search);
  const moveCursor = engine.indexOf("UPDATE quality_missing_cursors SET type_index=?", search);
  const failure = engine.indexOf("} catch (error) {", search);
  const failedStatus = engine.indexOf("UPDATE quality_missing_scans SET status='FAILED'", failure);
  const afterFailure = engine.slice(failure, engine.indexOf("return { enabled: true, schemaReady: true", failure));
  assert.ok(search !== -1 && success > search && moveCursor > success && failure > moveCursor);
  assert.ok(failedStatus > failure);
  assert.doesNotMatch(afterFailure, /UPDATE quality_missing_cursors/);
  assert.match(engine, /error instanceof AutomationSearchProviderError \? error\.code : "INTERNAL_ERROR"/);
});

test("notifier emits a new incident only after recovery or a different reason", () => {
  assert.match(engine, /previous\?\.status !== "FAILED" \|\| previous\.error_code !== errorCode/);
  assert.match(engine, /eventType: "quality_missing_failed"/);
  assert.match(engine, /QUALITY_ERROR_LABELS\[errorCode\]/);
  assert.match(engine, /WHERE area=\? AND status IN \('SUCCESS','FAILED'\)/);
});

test("dashboard distinguishes real successes from failures and legacy unknown attempts", () => {
  assert.match(engine, /GROUP BY area,status/);
  assert.match(engine, /row\.status === "SUCCESS"/);
  assert.match(engine, /row\.status === "FAILED"/);
  assert.match(engine, /stats\.unknown/);
  assert.match(dashboard, /Úspešné: \{stats\.successful\}/);
  assert.match(dashboard, /Zlyhané: \{stats\.failed\}/);
  assert.match(dashboard, /Staršie\/neznáme:/);
  assert.match(dashboard, /migráciu 0142/);
});

test("Notion conflicts are reported but do not masquerade as technical failures", () => {
  assert.match(worker, /errors: r\.totals\.failed, conflicts: r\.totals\.conflicts/);
  assert.doesNotMatch(worker, /errors: r\.totals\.failed \+ r\.totals\.conflicts/);
  assert.match(worker, /errors: r\.failed \+ r\.publication\.failed/);
  assert.match(observer, /conflicts: counts\.conflicts/);
  assert.match(events, /konfliktov na kontrolu/);
});
