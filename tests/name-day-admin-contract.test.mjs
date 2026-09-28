import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canonical migration has date checks, publication status and duplicate protection", async () => {
  const sql = await read("../drizzle/0049_dog_name_days_canonical.sql");
  assert.match(sql, /CREATE TABLE dog_name_days/);
  assert.match(sql, /month = 2 AND day BETWEEN 1 AND 29/);
  assert.match(sql, /status IN \('draft', 'published', 'archived'\)/);
  assert.match(sql, /source TEXT NOT NULL/);
  assert.match(sql, /UNIQUE INDEX dog_name_days_month_day_name_unique/);
  assert.doesNotMatch(sql, /INSERT INTO dog_name_days/i, "foundation migration must not seed an invented dataset");
});

test("public lookup is canonical published-only and fail-closed", async () => {
  const store = await read("../lib/dog-name-day-store.ts");
  assert.match(store, /WHERE status = 'published' AND month = \? AND day = \?/);
  assert.match(store, /if \(!database \|\| !parts\) return \[\]/);
  assert.match(store, /dog_name_day_public_lookup_failed/);
  const route = await read("../app/api/name-days/today/route.ts");
  assert.match(route, /getPublishedDogNameDaysForDate/);
  assert.match(route, /cache-control.*no-store/);
});

test("admin exposes create edit archive and publication controls", async () => {
  const collection = await read("../app/api/admin/name-days/route.ts");
  const detail = await read("../app/api/admin/name-days/[id]/route.ts");
  const ui = await read("../components/admin-dog-name-day-dashboard.tsx");
  assert.match(collection, /export async function POST/);
  assert.match(detail, /export async function PUT/);
  assert.match(detail, /export async function DELETE/);
  assert.match(detail, /archiveDogNameDayRecord/);
  assert.match(ui, /option value="draft"/);
  assert.match(ui, /option value="published"/);
  assert.match(ui, /option value="archived"/);
  assert.match(ui, /Zdroj \/ proveniencia/);
});

test("controlled import reports four actions and applies only when error-free", async () => {
  const route = await read("../app/api/admin/name-days/import/route.ts");
  const store = await read("../lib/dog-name-day-store.ts");
  assert.match(route, /plan\.summary\.ERROR > 0/);
  assert.match(route, /Nič nebolo zmenené/);
  assert.match(store, /VALUES \(\?, \?, \?, \?, 'draft'/);
  assert.match(store, /database\.batch\(statements\)/);
});
