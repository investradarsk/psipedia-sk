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

test("public name-day D1 reads retry transient connection errors only, without modifying admin writes", async () => {
  const store = await read("../lib/dog-name-day-store.ts");
  const retries = store.match(/retryTransientPublicRead\(\(\) => database\.prepare\(/g) ?? [];
  assert.equal(retries.length, 3, "public month, today and search each retry only the read-only SELECT");
  const sections = [
    store.split("export async function searchPublishedDogNameDays")[1].split("export async function getPublishedDogNameDaysForDate")[0],
    store.split("export async function getPublishedDogNameDaysForDate")[1].split("export async function listDogNameDayRecords")[0],
    store.split("export async function getPublishedDogNameDaysForMonth")[1],
  ];
  for (const section of sections) {
    assert.match(section, /retryTransientPublicRead\(\(\) => database\.prepare\(/);
    assert.match(section, /WHERE status = 'published'/);
    assert.match(section, /catch \(error\)/, "persistent failures retain the existing fail-closed fallback");
  }
  const admin = store.split("export async function listDogNameDayRecords")[1].split("/** Read-only public month lookup")[0];
  assert.doesNotMatch(admin, /retryTransientPublicRead/, "admin reads and all writes must not retry");
});

test("name-day browser E2E initializes the isolated Directory presentation tables used by homepage SSR", async () => {
  const workflow = await read("../.github/workflows/homepage-name-days-ci.yml");
  const migration = await read("../db/isolated/directory_admin_sql_completion.sql");
  assert.match(migration, /CREATE TABLE directory_profile_image_display_settings/);
  assert.match(workflow, /Finish local D1 migrations[\s\S]*?Apply isolated Directory SQL presentation schema[\s\S]*?Start app locally/);
  assert.match(workflow, /d1 execute DB --local --config dist\/server\/wrangler\.json --persist-to \.wrangler\/state --file db\/isolated\/directory_admin_sql_completion\.sql/);
  assert.doesNotMatch(workflow, /d1 execute DB --remote.*directory_admin_sql_completion/);
});
