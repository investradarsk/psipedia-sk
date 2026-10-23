import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const engine = readFileSync(new URL("../lib/data-quality-missing-hourly.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../components/admin-missing-quality-dashboard.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/0141_quality_missing_hourly.sql", import.meta.url), "utf8");

test("missing-data sweep covers exactly the three existing portal areas", () => {
  assert.match(engine, /services:\["DIRECTORY"\]/);
  assert.match(engine, /events:\["EVENT"\]/);
  assert.match(engine, /help:\["ORGANIZATION","ADOPTION","FOSTER","HELP_ITEM","LOST_FOUND"\]/);
  assert.match(engine, /profile\.missing=profile\.missing\.filter/);
  assert.match(engine, /if\(profile\.missing\.length\) return profile/);
});
test("no generated descriptions or copy-pasted SEO text enter the field allowlist", () => {
  assert.doesNotMatch(engine, /field\("description"/);
  assert.doesNotMatch(engine, /field\("excerpt"/);
  assert.match(engine, /if\(!profile\)\{/);
});
test("one scan claim per area and hour, without an extra credit budget", () => {
  assert.match(schema, /PRIMARY KEY\(area,hour\)/);
  assert.match(engine, /INSERT OR IGNORE INTO quality_missing_scans\(area,hour,scanned_at\)/);
  assert.match(engine, /for\(const area of \["services","events","help"\] as const\)/);
  assert.match(worker, /isFullHourlyScheduledSweep\(controller\)/);
  assert.doesNotMatch(engine, /creditsPerDay|creditLimit|queriesPerRun/);
});
test("decisions are manual, rejecting cannot change canonical data", () => {
  assert.match(engine, /if\(action==="reject"\)/);
  assert.match(engine, /status='REJECTED'/);
  assert.match(engine, /AND EXISTS \(SELECT 1 FROM quality_missing_proposals/);
  assert.match(page, /router\.refresh\(\)/);
  assert.match(page, /Zamietnuť všetky zobrazené/);
});
