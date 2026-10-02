import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decideBidirectionalChange,
  matchCanonicalIdentity,
  stableSnapshotJson,
} from "../lib/notion-bidirectional-reconciliation.ts";
import {
  notionDataSourceMatchesCanonicalSchema,
  resolveNotionCanonicalTarget,
} from "../lib/notion-canonical-target.ts";
import {
  adoptionStatusFromNotion,
  eventStatusFromNotion,
  helpStatusFromNotion,
  lostFoundStatusFromNotion,
  organizationStatusFromNotion,
  readyForCreate,
} from "../lib/notion-events-help-adapters.ts";

const definition = {
  key: "lost-found",
  label: "Stratené / nájdené",
  targetTitle: "Stratené a nájdené",
  titleProperty: "Názov",
  createIfMissing: true,
  createSchema: {
    "Názov": { title: {} },
    "Psipedia ID": { rich_text: {} },
    "URL Psipedia": { url: {} },
  },
};

function schema(title = "Názov") {
  return {
    [title]: { id: "title", type: "title", title: {} },
    "Psipedia ID": { id: "id", type: "rich_text", rich_text: {} },
    "URL Psipedia": { id: "url", type: "url", url: {} },
  };
}

class TargetDb {
  constructor() {
    this.target = null;
  }
  prepare(sql) {
    const statement = {
      args: [],
      bind(...args) {
        statement.args = args;
        return statement;
      },
      first: async () => {
        if (sql.includes("sqlite_master")) return { ok: 1 };
        if (sql.includes("FROM notion_agenda_targets")) return this.target;
        return null;
      },
      run: async () => {
        if (sql.includes("INSERT INTO notion_agenda_targets")) {
          this.target = {
            agenda: statement.args[0],
            database_id: statement.args[1],
            data_source_id: statement.args[2],
          };
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("unchanged snapshot stays unchanged", () => {
  assert.equal(decideBidirectionalChange({
    baselineHash: "a",
    notionHash: "a",
    psipediaHash: "a",
  }).decision, "UNCHANGED");
});

test("Notion-only change pulls from Notion", () => {
  assert.equal(decideBidirectionalChange({
    baselineHash: "a",
    notionHash: "b",
    psipediaHash: "a",
  }).decision, "PULL_NOTION");
});

test("Psipedia-only change pushes to Notion", () => {
  assert.equal(decideBidirectionalChange({
    baselineHash: "a",
    notionHash: "a",
    psipediaHash: "b",
  }).decision, "PUSH_PSIPEDIA");
});

test("simultaneous change fails closed as CONFLICT", () => {
  const state = decideBidirectionalChange({
    baselineHash: "a",
    notionHash: "b",
    psipediaHash: "c",
  });
  assert.equal(state.decision, "CONFLICT");
  assert.equal(state.notionChanged, true);
  assert.equal(state.psipediaChanged, true);
});

test("identity bootstraps primarily by Psipedia ID", () => {
  const result = matchCanonicalIdentity("12", "https://psipedia.sk/x/12", [
    { id: "p1", psipediaId: "12", url: "https://psipedia.sk/other" },
  ]);
  assert.equal(result.kind, "MATCH");
  assert.equal(result.matchedBy, "id");
});

test("identity falls back to canonical URL when ID is missing", () => {
  const result = matchCanonicalIdentity("12", "https://psipedia.sk/x/12/", [
    { id: "p1", psipediaId: "", url: "https://psipedia.sk/x/12" },
  ]);
  assert.equal(result.kind, "MATCH");
  assert.equal(result.matchedBy, "url");
});

test("duplicate Psipedia ID is a conflict", () => {
  const result = matchCanonicalIdentity("12", "https://psipedia.sk/x/12", [
    { id: "p1", psipediaId: "12", url: "https://psipedia.sk/x/12" },
    { id: "p2", psipediaId: "12", url: "https://psipedia.sk/x/other" },
  ]);
  assert.deepEqual(result, {
    kind: "CONFLICT",
    pageIds: ["p1", "p2"],
    reason: "DUPLICATE_ID",
  });
});

test("duplicate canonical URL is a conflict", () => {
  const result = matchCanonicalIdentity("12", "https://psipedia.sk/x/12", [
    { id: "p1", psipediaId: "", url: "https://psipedia.sk/x/12" },
    { id: "p2", psipediaId: "", url: "https://psipedia.sk/x/12/" },
  ]);
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.reason, "DUPLICATE_URL");
});

test("ID and URL pointing at different pages is a conflict", () => {
  const result = matchCanonicalIdentity("12", "https://psipedia.sk/x/12", [
    { id: "p1", psipediaId: "12", url: "https://psipedia.sk/x/other" },
    { id: "p2", psipediaId: "", url: "https://psipedia.sk/x/12" },
  ]);
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.reason, "IDENTITY_MISMATCH");
});

test("same title is irrelevant to canonical identity", () => {
  const result = matchCanonicalIdentity("2", "https://psipedia.sk/x/2", [
    { id: "p1", psipediaId: "1", url: "https://psipedia.sk/x/1" },
  ]);
  assert.equal(result.kind, "NONE");
});

test("stable snapshot normalizes key order and line endings", () => {
  assert.equal(
    stableSnapshotJson({ z: "a\r\nb", a: " x " }),
    stableSnapshotJson({ a: "x", z: "a\nb" }),
  );
});

test("default Notion data source with only Name is not canonical", () => {
  assert.equal(notionDataSourceMatchesCanonicalSchema({
    properties: { Name: { type: "title", title: {} } },
  }, definition), false);
});

test("canonical Psipedia data source requires title, Psipedia ID and URL", () => {
  assert.equal(notionDataSourceMatchesCanonicalSchema({
    properties: schema("Názov"),
  }, definition), true);
});

test("schema-aware resolver ignores default Name data source", async () => {
  const db = new TargetDb();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith("/search")) {
      return response({
        results: [
          { id: "default-ds", object: "data_source", title: [{ plain_text: "Stratené a nájdené" }] },
          { id: "canonical-ds", object: "data_source", title: [{ plain_text: "Stratené a nájdené" }] },
        ],
      });
    }
    if (pathname.endsWith("/data_sources/default-ds")) {
      return response({ id: "default-ds", parent: { database_id: "db1" }, properties: { Name: { type: "title", title: {} } } });
    }
    if (pathname.endsWith("/data_sources/canonical-ds")) {
      return response({ id: "canonical-ds", parent: { database_id: "db1" }, properties: schema() });
    }
    throw new Error(`unexpected fetch ${pathname} ${init?.method ?? "GET"}`);
  };
  try {
    const target = await resolveNotionCanonicalTarget({
      database: db,
      bindings: { NOTION_API_TOKEN: "test" },
      definition,
      allowCreate: false,
      persist: false,
    });
    assert.equal(target.dataSourceId, "canonical-ds");
    assert.deepEqual(target.duplicateDataSourceIds, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("two canonical databases with same title select one and report the other, never delete", async () => {
  const db = new TargetDb();
  const originalFetch = globalThis.fetch;
  let deleteCalls = 0;
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    if (method === "DELETE") deleteCalls += 1;
    if (pathname.endsWith("/search")) {
      return response({
        results: [
          { id: "canonical-a", object: "data_source", title: [{ plain_text: "Stratené a nájdené" }] },
          { id: "canonical-b", object: "data_source", title: [{ plain_text: "Stratené a nájdené" }] },
        ],
      });
    }
    if (pathname.endsWith("/data_sources/canonical-a")) {
      return response({ id: "canonical-a", created_time: "2026-10-02T20:31:00.000Z", parent: { database_id: "db-a" }, properties: schema() });
    }
    if (pathname.endsWith("/data_sources/canonical-b")) {
      return response({ id: "canonical-b", created_time: "2026-10-02T20:32:00.000Z", parent: { database_id: "db-b" }, properties: schema() });
    }
    if (pathname.includes("/data_sources/canonical-") && pathname.endsWith("/query")) {
      return response({
        results: [{
          properties: {
            "Psipedia ID": { rich_text: [{ plain_text: "1" }] },
            "URL Psipedia": { url: "https://psipedia.sk/pomoc-psom/stratene-psy/test" },
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${pathname} ${method}`);
  };
  try {
    const target = await resolveNotionCanonicalTarget({
      database: db,
      bindings: { NOTION_API_TOKEN: "test" },
      definition,
      allowCreate: false,
      persist: false,
    });
    assert.equal(target.dataSourceId, "canonical-a");
    assert.deepEqual(target.duplicateDataSourceIds, ["canonical-b"]);
    assert.equal(deleteCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("create uses returned data-source ID during search indexing lag and repeated execute is idempotent", async () => {
  const db = new TargetDb();
  const originalFetch = globalThis.fetch;
  let databaseCreates = 0;
  let dataSourceCreates = 0;
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    if (pathname.endsWith("/search")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.filter?.value === "page") {
        return response({
          results: [{ id: "hub-page", object: "page", title: [{ plain_text: "Psipedia — Editorial Hub" }] }],
        });
      }
      // Simulate Notion Search API indexing lag forever.
      return response({ results: [] });
    }
    if (pathname.endsWith("/databases") && method === "POST") {
      databaseCreates += 1;
      return response({ id: "new-db" });
    }
    if (pathname.endsWith("/data_sources") && method === "POST") {
      dataSourceCreates += 1;
      return response({ id: "new-canonical-ds", parent: { database_id: "new-db" } });
    }
    if (pathname.endsWith("/data_sources/new-canonical-ds") && method === "GET") {
      return response({ id: "new-canonical-ds", parent: { database_id: "new-db" }, properties: schema() });
    }
    throw new Error(`unexpected fetch ${pathname} ${method}`);
  };

  try {
    const first = await resolveNotionCanonicalTarget({
      database: db,
      bindings: { NOTION_API_TOKEN: "test" },
      definition,
      allowCreate: true,
      persist: true,
    });
    const second = await resolveNotionCanonicalTarget({
      database: db,
      bindings: { NOTION_API_TOKEN: "test" },
      definition,
      allowCreate: true,
      persist: true,
    });
    assert.equal(first.dataSourceId, "new-canonical-ds");
    assert.equal(second.dataSourceId, "new-canonical-ds");
    assert.equal(databaseCreates, 1);
    assert.equal(dataSourceCreates, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("status mapping preserves agenda-specific lifecycle semantics", () => {
  assert.equal(eventStatusFromNotion("Publikované"), "published");
  assert.equal(eventStatusFromNotion("Ready"), "draft");
  assert.equal(organizationStatusFromNotion("Publikované"), "PUBLISHED");
  assert.equal(organizationStatusFromNotion("Archív"), "ARCHIVED");
  assert.equal(adoptionStatusFromNotion("Rezervované"), "RESERVED");
  assert.equal(adoptionStatusFromNotion("Archív", "ADOPTED"), "ADOPTED");
  assert.equal(helpStatusFromNotion("published"), "published");
  assert.equal(lostFoundStatusFromNotion("RESOLVED"), "RESOLVED");
  assert.equal(lostFoundStatusFromNotion("REJECTED"), "REJECTED");
});

test("create-from-Notion gate keeps event/org/adoption Ready and validates help/lost identity fields", () => {
  assert.equal(readyForCreate("events", { Stav: "Ready" }), true);
  assert.equal(readyForCreate("events", { Stav: "Publikované" }), false);
  assert.equal(readyForCreate("organizations", { Stav: "Ready" }), true);
  assert.equal(readyForCreate("adoptions", { Stav: "Ready" }), true);
  assert.equal(readyForCreate("help-cases", { Názov: "X", Slug: "x", Kategória: "zbierky" }), true);
  assert.equal(readyForCreate("lost-found", { Názov: "X", Slug: "x", Typ: "LOST" }), true);
});

test("migration is additive and persists agenda mapping plus target identity", async () => {
  const sql = await readFile(new URL("../drizzle/0108_notion_events_help_bidirectional_sync.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE event_notion_sync ADD COLUMN psipedia_updated_at TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notion_agenda_sync/);
  assert.match(sql, /UNIQUE \(agenda, entity_id\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notion_agenda_targets/);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b/i);
});

test("domain adapters use existing canonical write APIs instead of direct table mutation", async () => {
  const source = await readFile(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
  for (const expected of [
    "createManagedEvent",
    "updateManagedEvent",
    "createOrganizationFromAdmin",
    "updateOrganizationFromAdmin",
    "createOrganizationLocationFromAdmin",
    "updateOrganizationLocationFromAdmin",
    "createAdoptionFromAdmin",
    "updateAdoptionFromAdmin",
    "createManagedHelpCase",
    "updateManagedHelpCase",
    "createAdminDogReport",
    "updateAdminDogReport",
  ]) {
    assert.match(source, new RegExp(expected));
  }
  assert.doesNotMatch(source, /DELETE FROM/);
});

test("organization Notion snapshot resolves child primary location without making child organizations", async () => {
  const source = await readFile(new URL("../lib/notion-bulk-sources.ts", import.meta.url), "utf8");
  assert.match(source, /FROM organization_locations l WHERE l\.organization_id=o\.id/);
  assert.match(source, /ORDER BY l\.is_primary DESC,l\.sort_order ASC,l\.id ASC/);
  assert.doesNotMatch(source, /FROM organization_locations ORDER BY id ASC/);
});

test("worker reuses hourly scheduler and suppresses legacy event sync when bidirectional sync is enabled", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(source, /runNotionEventsHelpSyncSweep/);
  assert.match(source, /NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED/);
  assert.match(source, /notionEventsHelpEnabled[\s\S]*runNotionEventSyncSweep/);
  assert.equal((source.match(/const ADMIN_PUSH_CRON/g) ?? []).length, 1);
});

test("sync endpoint requires explicit confirmation for write modes", async () => {
  const source = await readFile(new URL("../app/api/admin/notion-events-help-sync/route.ts", import.meta.url), "utf8");
  assert.match(source, /NOTION_EVENTS_HELP_BOOTSTRAP/);
  assert.match(source, /NOTION_EVENTS_HELP_SYNC/);
  assert.match(source, /requireAdminMutation/);
});

test("Directory sync implementation is not rewritten by this workstream", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  assert.match(directory, /directory_notion_sync/);
  assert.match(directory, /content_hash/);
  assert.match(directory, /notion_last_edited_time/);
  assert.match(directory, /psipedia_updated_at/);
});
