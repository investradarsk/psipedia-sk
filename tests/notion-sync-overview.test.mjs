import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { NOTION_SYNC_OVERVIEW_AREAS, readNotionSyncOverview } from "../lib/notion-sync-overview.ts";

function mockDb(names, values = {}, failures = []) {
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      function lookup(agenda) {
        const key = sql.includes("FROM directory_notion_sync") ? "directory"
          : sql.includes("FROM event_notion_sync") ? "events"
            : sql.includes("FROM facebook_image_posts") ? "facebook-images"
              : sql.includes("FROM service_catalog_notion_auto_attempts") ? "service-catalog"
                : agenda;
        if (failures.includes(key)) throw Error("PRIVATE_PROVIDER_ERROR");
        return values[key] ?? { count: 0, last_at: null };
      }
      return {
        all: async () => ({ results: names.map((name) => ({ name })) }),
        first: async () => lookup(),
        bind: (agenda) => ({ first: async () => lookup(agenda) }),
      };
    },
  };
  return { db, statements };
}

test("overview covers all existing eight sync areas and performs only bounded reads", async () => {
  const { db, statements } = mockDb(
    ["directory_notion_sync", "event_notion_sync", "notion_agenda_sync",
      "service_catalog_notion_auto_attempts", "facebook_image_posts"],
    {
      directory: { count: 21, last_at: "2026-10-25T12:00:00Z" },
      events: { count: 8, last_at: "2026-10-25T11:00:00Z" },
      organizations: { count: 2, last_at: null },
      adoptions: { count: 3, last_at: null },
      "help-cases": { count: 4, last_at: null },
      "lost-found": { count: 5, last_at: null },
      "service-catalog": { count: 1, last_at: "2026-10-25T13:00:00Z" },
      "facebook-images": { count: 7, last_at: null },
    },
  );
  assert.equal(NOTION_SYNC_OVERVIEW_AREAS.length, 8);
  const rows = await readNotionSyncOverview(db);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].count, 21);
  assert.equal(rows[0].status, "RECORDED");
  assert.equal(rows[4].count, 4);
  assert.equal(rows[6].evidence, "VERIFIED_ATTEMPTS");
  assert.equal(rows[7].evidence, "LINKED_POSTS");
  assert.equal(rows[7].lastMappingAt, null);
  assert.equal(statements.length, 9);
  for (const sql of statements) {
    assert.match(sql, /^SELECT\b/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|REPLACE)\b/i);
  }
  assert.ok(statements.some((sql) => /WHERE agenda=\?/.test(sql)));
});

test("missing schema and failed query remain UNKNOWN, never success or false zero", async () => {
  const { db } = mockDb(["directory_notion_sync", "notion_agenda_sync"], {
    directory: { count: 0, last_at: null },
    organizations: { count: 2, last_at: "INVALID_DATE" },
  }, ["adoptions"]);
  const rows = await readNotionSyncOverview(db);
  assert.equal(rows.find((item) => item.area === "events").status, "SCHEMA_UNAVAILABLE");
  assert.equal(rows.find((item) => item.area === "directory").status, "EMPTY");
  assert.equal(rows.find((item) => item.area === "adoptions").status, "UNKNOWN");
  assert.equal(rows.find((item) => item.area === "adoptions").count, null);
  assert.equal(rows.find((item) => item.area === "organizations").lastMappingAt, null);
});

test("overview endpoint is admin-only, no-store and never launches Notion writes", async () => {
  const source = await readFile(new URL("../app/api/admin/notion-sync-overview/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAdminApiUser\(\)/);
  assert.match(source, /unauthorizedAdminResponse\(\)/);
  assert.match(source, /"Cache-Control": "no-store"/);
  assert.match(source, /"EXISTING_D1_MAPPING_HISTORY"/);
  assert.doesNotMatch(source, /notionRequest|runNotionEventsHelpSyncSweep|runNotionDirectorySyncSweep/);
});

test("run receipts read only existing persisted Automation Run transitions", async () => {
  const { readNotionRunReceipts, parseNotionRunReceipt } = await import("../lib/notion-sync-run-receipts.ts");
  const recordedAt = "2026-10-25T16:00:05Z";
  const runId = String(Date.parse("2026-10-25T16:00:00Z"));
  const receipt = (event_type, body = "Automatická kontrola dokončená. chýb: 0, konfliktov na kontrolu: 2.") => ({
    event_type, resource_ref: runId, created_at: recordedAt, body,
  });
  const now = new Date("2026-10-25T16:05:00Z");
  const db = {
    prepare(sql) {
      assert.match(sql, /^SELECT /);
      assert.match(sql, /source_type='AUTOMATION_RUN'/);
      assert.match(sql, /actor_ref=\?/);
      assert.match(sql, /ORDER BY id DESC LIMIT 1/);
      return { bind(scope, ...events) {
        assert.ok(events.includes("automation_run_failed"));
        return { first: async () => scope === "notion/directory"
          ? receipt("automation_run_success") : receipt("automation_run_partial_success") };
      } };
    },
  };
  const rows = await readNotionRunReceipts(db, now);
  assert.equal(rows.directory.status, "SUCCESS");
  assert.equal(rows["events-help"].status, "PARTIAL_SUCCESS");
  assert.equal(rows["events-help"].conflicts, 2);
  assert.equal(rows["events-help"].errors, 0);
  assert.equal(rows.directory.runId, runId);
  assert.equal(parseNotionRunReceipt("directory", receipt("automation_run_started"), now).status, "STARTED");
  assert.equal(parseNotionRunReceipt("directory", receipt("automation_run_started"), new Date("2026-10-25T19:00:00Z")).status, "STALE");
  assert.equal(parseNotionRunReceipt("directory", receipt("automation_run_failed"), now).status, "FAILED");
  assert.equal(parseNotionRunReceipt("directory", receipt("automation_run_success", "Safe"), now).conflicts, null);
  assert.equal(parseNotionRunReceipt("directory", { ...receipt("automation_run_success"), resource_ref:"FAKE_ID" }, now).status, "UNKNOWN");
  assert.equal(parseNotionRunReceipt("directory", { ...receipt("automation_run_success"), event_type: "untrusted_status" }, now).status, "UNKNOWN");
  const noSchema = { prepare() { throw Error("no such table"); } };
  const unknown = await readNotionRunReceipts(noSchema, now);
  assert.equal(unknown.directory.status, "UNKNOWN");
  assert.equal(unknown["events-help"].status, "UNKNOWN");
});
