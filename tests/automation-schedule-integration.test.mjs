import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("migration adds backward-compatible calendar columns to every scheduling table", async () => {
  const migration = await read("drizzle/0093_automation_calendar_schedule.sql");
  for (const table of ["automation_discovery_roots", "automation_sources", "automation_direct_refresh_settings"]) {
    assert.match(migration, new RegExp("ALTER TABLE " + table + " ADD COLUMN schedule_mode"));
    assert.match(migration, new RegExp("ALTER TABLE " + table + " ADD COLUMN schedule_days_json"));
    assert.match(migration, new RegExp("ALTER TABLE " + table + " ADD COLUMN schedule_local_time"));
    assert.match(migration, new RegExp("ALTER TABLE " + table + " ADD COLUMN schedule_timezone"));
  }
  assert.doesNotMatch(migration, /UPDATE\s+automation_/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
});

test("discovery roots persist the shared schedule and finish on a calendar occurrence", async () => {
  const store = await read("lib/data-automation-discovery-store.ts");
  assert.match(store, /automationScheduleFromStorage/);
  assert.match(store, /automationScheduleStorage/);
  assert.match(store, /setAutomationDiscoveryRootSchedule/);
  assert.match(store, /nextAutomationScheduledAt\(root\.schedule, completedAt\)/);
  assert.match(store, /root\.schedule\.mode === "CALENDAR"/);
});

test("approved sources use one normalized schedule contract and preserve interval enable semantics", async () => {
  const store = await read("lib/data-automation-source-store.ts");
  const runtime = await read("lib/data-automation-store.ts");
  assert.match(store, /schedule\?: AutomationSchedule/);
  assert.match(store, /effectiveAutomationCadenceMinutes/);
  assert.match(store, /schedule\.mode === "CALENDAR"/);
  assert.match(store, /else if \(!existing\.enabled\) \{\s*nextCheckAt = at;/);
  assert.match(runtime, /nextAutomationScheduledAt/);
  assert.match(runtime, /input\.source\.schedule \?\?/);
});

test("direct refresh keeps hourly continuation batches but calendar-schedules completed cycles", async () => {
  const store = await read("lib/data-automation-product-store.ts");
  assert.match(store, /input\.batchWasFull\s*\?\s*new Date\(now\.getTime\(\) \+ 60 \* 60_000\)/);
  assert.match(store, /: nextAutomationScheduledAt\(input\.setting\.schedule, now\)/);
  assert.match(store, /cursor_entity_id=\?/);
});

test("category and source APIs accept explicit schedules while retaining legacy cadence callers", async () => {
  const [categoryRoute, sourceRoute] = await Promise.all([
    read("app/api/admin/automation-categories/[category]/route.ts"),
    read("app/api/admin/automation-sources/[id]/route.ts"),
  ]);
  for (const route of [categoryRoute, sourceRoute]) {
    assert.match(route, /body\?\.schedule/);
    assert.match(route, /parseAutomationSchedule/);
    assert.match(route, /body\?\.cadenceMinutes/);
    assert.match(route, /schedule\.mode === "INTERVAL"/);
  }
  assert.match(categoryRoute, /assertAutomationScheduleMinimumCadence/);
  assert.match(categoryRoute, /schedule\.mode === "INTERVAL"[\s\S]*immediateRun|immediateRun[\s\S]*schedule\.mode === "INTERVAL"/);
  assert.match(sourceRoute, /!before\.enabled && schedule\.mode === "INTERVAL"/);
});

test("admin UX exposes interval/calendar, weekdays, HH:mm timezone and next run", async () => {
  const [fields, category, source] = await Promise.all([
    read("components/admin-automation-schedule-fields.tsx"),
    read("components/admin-automation-category-sources.tsx"),
    read("components/admin-automation-source-settings.tsx"),
  ]);
  assert.match(fields, /Interval/);
  assert.match(fields, /Presný rozvrh/);
  assert.match(fields, /aria-pressed/);
  assert.match(fields, /type="time"/);
  assert.match(fields, /Europe\/Bratislava|AUTOMATION_TIMEZONE/);
  assert.match(category, /AdminAutomationScheduleFields/);
  assert.match(category, /discoverySchedule/);
  assert.match(category, /refreshSchedule/);
  assert.match(source, /AdminAutomationScheduleFields/);
  assert.match(source, /Ďalšie spustenie/);
  assert.match(source, /formatAutomationNextRun/);
});
