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
        const key = sql.includes("FROM eshop_notion_sync m") ? "eshops-pending"
          : sql.includes("FROM directory_notion_sync") ? "directory"
          : sql.includes("FROM breed_notion_sync") ? "breeds"
            : sql.includes("FROM article_notion_sync") ? "articles"
              : sql.includes("FROM eshop_notion_sync") ? "eshops"
                : sql.includes("FROM article_notion_editorial_outbox") ? "articles-outbox"
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

test("overview covers all eleven sync areas and performs only bounded reads", async () => {
  const { db, statements } = mockDb(
    ["directory_notion_sync", "breed_notion_sync", "article_notion_sync",
      "eshop_notion_sync", "event_notion_sync", "notion_agenda_sync",
      "service_catalog_notion_auto_attempts", "facebook_image_posts"],
    {
      directory: { count: 21, last_at: "2026-10-25T12:00:00Z" },
      breeds: { count: 14, last_at: "2026-10-25T12:10:00Z" },
      articles: { count: 18, last_at: "2026-10-25T12:20:00Z" },
      eshops: { count: 6, last_at: "2026-10-25T12:30:00Z" },
      events: { count: 8, last_at: "2026-10-25T11:00:00Z" },
      organizations: { count: 2, last_at: null },
      adoptions: { count: 3, last_at: null },
      "help-cases": { count: 4, last_at: null },
      "lost-found": { count: 5, last_at: null },
      "service-catalog": { count: 1, last_at: "2026-10-25T13:00:00Z" },
      "facebook-images": { count: 7, last_at: null },
    },
  );
  assert.equal(NOTION_SYNC_OVERVIEW_AREAS.length, 11);
  const rows = await readNotionSyncOverview(db);
  assert.equal(rows.length, 11);
  assert.equal(rows.find(x => x.area === "directory").count, 21);
  assert.equal(rows.find(x => x.area === "directory").status, "RECORDED");
  assert.equal(rows.find(x => x.area === "breeds").count, 14);
  assert.equal(rows.find(x => x.area === "articles").count, 18);
  assert.equal(rows.find(x => x.area === "eshops").count, 6);
  assert.equal(rows.find(x => x.area === "help-cases").count, 4);
  assert.equal(rows.find(x => x.area === "service-catalog").evidence, "VERIFIED_ATTEMPTS");
  assert.equal(rows.find(x => x.area === "facebook-images").evidence, "LINKED_POSTS");
  assert.equal(rows.find(x => x.area === "facebook-images").lastMappingAt, null);
  assert.equal(rows.find(x => x.area === "breeds").pendingCount, null);
  assert.equal(rows.find(x => x.area === "breeds").pendingBasis, "NOT_RECORDED");
  assert.equal(statements.length, 12);
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

test("configuration preflight checks deployed flags, schema and token without exposing secrets", async () => {
  const { notionSyncConfigurationPreflight } = await import("../lib/notion-sync-preflight.ts");
  const rows = NOTION_SYNC_OVERVIEW_AREAS.map(item => ({
    area:item.key,label:item.label,evidence:item.evidence,count:0,lastMappingAt:null,status:"EMPTY",
    pendingCount:null,pendingBasis:"NOT_RECORDED",
  }));
  const config = {
    NOTION_API_TOKEN: "PRIVATE_SHOULD_NOT_LEAK",
    NOTION_DIRECTORY_SYNC_ENABLED: "true",
    NOTION_DIRECTORY_DATA_SOURCE_ID: "84e0664c-ca47-405f-9d54-31b20287bc8c",
    NOTION_BREED_SYNC_ENABLED: "true",
    NOTION_BREEDS_DATA_SOURCE_ID: "84e0664c-ca47-405f-9d54-31b20287bc8c",
    NOTION_ARTICLE_SYNC_ENABLED: "true",
    NOTION_ARTICLES_DATA_SOURCE_ID: "84e0664c-ca47-405f-9d54-31b20287bc8c",
    NOTION_ESHOP_SYNC_ENABLED: "true",
    NOTION_ESHOPS_DATA_SOURCE_ID: "84e0664c-ca47-405f-9d54-31b20287bc8c",
    NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED: "true",
    SERVICE_CATALOG_NOTION_AUTO_ENABLED: "true",
    SERVICE_CATALOG_ADMIN_WRITES_ENABLED: "true",
    SERVICE_CATALOG_NOTION_MIRROR_READY: "true",
    SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED: "true",
    NOTION_FACEBOOK_IMAGES_SYNC_ENABLED: "true",
    NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID: "2d945afe-0c79-467e-b9e6-6b0f62a27a49",
  };
  const good = notionSyncConfigurationPreflight(config, rows);
  assert.equal(good.length, 7);
  assert.ok(good.every(x => x.status === "CONFIGURED"));
  assert.doesNotMatch(JSON.stringify(good), /PRIVATE_SHOULD_NOT_LEAK/);
  const off = notionSyncConfigurationPreflight({ ...config, NOTION_DIRECTORY_SYNC_ENABLED: "false" }, rows);
  assert.equal(off[0].status, "DISABLED");
  const missingToken = notionSyncConfigurationPreflight({ ...config, NOTION_API_TOKEN: "" }, rows);
  assert.equal(missingToken.find(x => x.area === "breeds").status, "BLOCKED");
  assert.equal(missingToken.find(x => x.area === "breeds").details, "TOKEN_MISSING");
  const missingSchema = notionSyncConfigurationPreflight(config,
    rows.map(x => x.area === "adoptions" ? { ...x, status:"SCHEMA_UNAVAILABLE" } : x));
  assert.equal(missingSchema.find(x => x.area === "events-help").details, "SCHEMA_MISSING");
  const unavailableSchema = notionSyncConfigurationPreflight(config,
    rows.map(x => x.area === "directory" ? { ...x, status:"UNKNOWN" } : x));
  assert.equal(unavailableSchema[0].status, "UNKNOWN");
  assert.equal(notionSyncConfigurationPreflight({ ...config,
    NOTION_FACEBOOK_IMAGES_DATA_SOURCE_ID: "not-a-uuid" }, rows)
    .find(x => x.area === "facebook-images").details, "DATA_SOURCE_MISSING");
  assert.equal(notionSyncConfigurationPreflight({ ...config,
    SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED: "false" }, rows)
    .find(x => x.area === "service-catalog").details, "FEATURE_GATES_MISSING");
});

test("pending evidence is bounded, honest, and missing tables never become a zero", async () => {
  const names = [
    "directory_notion_sync", "breed_notion_sync", "article_notion_sync", "eshop_notion_sync",
    "event_notion_sync", "notion_agenda_sync", "service_catalog_notion_auto_attempts",
    "facebook_image_posts", "directory_profiles", "managed_eshops", "eshop_ratings",
    "article_notion_editorial_outbox",
  ];
  const { db, statements } = mockDb(names, {
    directory: { count: 5, last_at: "2026-10-25T10:00:00Z" },
    breeds: { count: 7, last_at: "2026-10-25T10:00:00Z" },
    articles: { count: 2, last_at: "2026-10-25T10:00:00Z" },
    eshops: { count: 6, last_at: "2026-10-25T10:00:00Z" },
    "articles-outbox": { count: 3, last_at: null },
  }, ["eshops-pending"]);
  const rows = await readNotionSyncOverview(db);
  assert.equal(rows.length, 11);
  assert.equal(rows.find(x => x.area === "directory").pendingBasis, "REVISION_GAP");
  assert.equal(rows.find(x => x.area === "articles").pendingCount, 3);
  assert.equal(rows.find(x => x.area === "articles").pendingBasis, "EDITORIAL_OUTBOX");
  assert.equal(rows.find(x => x.area === "eshops").pendingCount, null);
  assert.equal(rows.find(x => x.area === "eshops").pendingBasis, "NOT_RECORDED");
  assert.equal(rows.find(x => x.area === "breeds").pendingCount, null);
  assert.equal(rows.find(x => x.area === "events").pendingCount, null);
  assert.equal(statements.length, 15);
  assert.ok(statements.every(sql => /^SELECT\b/.test(sql)));
  assert.ok(statements.every(sql => !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|REPLACE)\b/i.test(sql)));
  assert.ok(statements.some(sql => sql.includes("FROM article_notion_editorial_outbox")));
});
