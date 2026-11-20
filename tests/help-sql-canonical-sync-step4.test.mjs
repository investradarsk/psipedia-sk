import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
function exportedFunction(source, functionName, context) {
  const at = source.indexOf("export async function " + functionName + "(");
  assert.ok(at >= 0, "missing " + functionName);
  const compiled = ts.transpileModule(source.slice(at), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const scope = { exports: {}, ...context };
  runInNewContext(compiled, scope);
  assert.equal(typeof scope.exports[functionName], "function");
  return scope.exports[functionName];
}

test("Help targeted Notion save refuses a missing BEFORE snapshot instead of full-profile replay", async () => {
  const source = await read("lib/notion-targeted-admin-save.ts");
  let called = 0;
  const sync = exportedFunction(source, "syncSavedNotionRecord", {
    isHelpFieldEventAgenda: agenda => ["organizations", "adoptions", "help-cases", "lost-found"].includes(agenda),
    currentHelpSnapshot: async () => { called++; return { Meno: "Max" }; },
    changedAdminHelpFields: () => ["Meno"],
    syncOneAdminHelpRecord: async () => { throw Error("unsafe whole-profile replay"); },
  });
  const input = {
    bindings: { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED: "true", DB: {} },
    agenda: "adoptions", entityId: 123, beforeHelpSnapshot: null,
  };
  assert.equal(await sync(input), "pending");
  assert.equal(called, 0, "without BEFORE, no broader after-query should run");
});

test("Help targeted Notion save refuses a missing AFTER snapshot rather than treating BEFORE as AFTER", async () => {
  const source = await read("lib/notion-targeted-admin-save.ts");
  let pushes = 0;
  const sync = exportedFunction(source, "syncSavedNotionRecord", {
    isHelpFieldEventAgenda: () => true,
    currentHelpSnapshot: async () => null,
    changedAdminHelpFields: () => { throw Error("missing AFTER must not be accepted"); },
    syncOneAdminHelpRecord: async () => { pushes++; return "synced"; },
  });
  const input = {
    bindings: { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED: "true", DB: {} },
    agenda: "organizations", entityId: 42, beforeHelpSnapshot: { Názov: "Shelter" },
  };
  assert.equal(await sync(input), "pending");
  assert.equal(pushes, 0);
});

test("Help targeted Notion save queues ONLY actual SQL before/after field deltas and triggers immediate retry", async () => {
  const source = await read("lib/notion-targeted-admin-save.ts");
  const queued = [], retried = [];
  const sync = exportedFunction(source, "syncSavedNotionRecord", {
    isHelpFieldEventAgenda: () => true,
    isAdminNotionSyncLocked: async () => false,
    currentHelpSnapshot: async () => ({ Meno: "Luna", Popis: "Bez zmeny" }),
    changedAdminHelpFields: (_agenda, before, after) =>
      Object.keys(after).filter(key => before[key] !== after[key]),
    queueHelpNotionAdminChange: async payload => {
      queued.push(payload);
      return "pending";
    },
    retryOneHelpNotionWriteback: async payload => {
      retried.push(payload);
      return "synced";
    },
    syncOneAdminHelpRecord: async () => {
      throw Error("must not bypass the durable queue");
    },
  });
  const beforeHelpSnapshot = { Meno: "Luna staré", Popis: "Bez zmeny" };
  const response = await sync({
    bindings: { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED: "true", DB: {} },
    agenda: "adoptions", entityId: 72, beforeHelpSnapshot,
  });
  assert.equal(response, "synced");
  assert.equal(queued.length, 1);
  assert.deepEqual(Array.from(queued[0].fields), ["Meno"]);
  assert.equal(queued[0].before.Meno, "Luna staré");
  assert.equal(queued[0].after.Meno, "Luna");
  assert.equal(queued[0].agenda, "adoptions");
  assert.equal(queued[0].entityId, 72);
  assert.equal(retried.length, 1);
  assert.equal(retried[0].agenda, "adoptions");
  assert.equal(retried[0].entityId, 72);
});

test("Help targeted Notion runner refuses a FALSE synced result when a partner takes ownership during sweep", async () => {
  const source = await read("lib/notion-targeted-admin-help.ts");
  let locks = 0, sweeps = 0;
  const run = exportedFunction(source, "syncOneAdminHelpRecord", {
    isAdminNotionSyncLocked: async () => ++locks >= 2,
    runNotionEventsHelpSyncSweep: async () => {
      sweeps++;
      return {
        enabled: true, schemaReady: true,
        agendas: [{
          agenda: "organizations", enabled: true, schemaReady: true,
          targetMissing: false, dataSourceId: "verified", scanned: 1,
          unchanged: 1, pulledFromNotion: 0, pushedToNotion: 0, bootstrapped: 0,
        }],
        totals: { failed: 0, conflicts: 0, reviewRequired: 0 },
      };
    },
  });
  const database = {
    prepare: () => ({ bind: () => ({ first: async () => ({ notion_page_id: "page-1" }) }) }),
  };
  assert.equal(await run({
    database, bindings: { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED: "true" },
    agenda: "organizations", entityId: 7, changedHelpFields: ["Popis"],
  }), "disabled");
  assert.equal(locks, 2);
  assert.equal(sweeps, 1);
});

test("all Help public, Admin, partner and Notion paths use the same four D1 owners", async () => {
  const sources = await Promise.all([
    read("lib/help-landing-store.ts"),
    read("lib/help-store.ts"),
    read("lib/help-organization-store.ts"),
    read("lib/adoption-store.ts"),
    read("lib/lost-found-dog-store.ts"),
    read("lib/notion-bulk-sources.ts"),
    read("lib/notion-events-help-adapters.ts"),
    read("lib/partner-help-editor.ts"),
    read("lib/partner-profile-changes.ts"),
    read("lib/admin-notion-review-lock.ts"),
  ]);
  const [landing, help, organizations, adoptions, reports, notion, adapter, partner, partnerProfiles, locks] = sources;
  const owners = ["help_cases", "help_organizations", "adoption_dogs", "lost_found_dog_reports"];
  for (const name of owners) {
    assert.ok(landing.includes(name), "landing must read D1 " + name);
    assert.ok(notion.includes("FROM " + name) || notion.includes("FROM " + name + " "),
      "Notion must mirror D1 " + name);
  }
  assert.match(help, /FROM help_cases/);
  assert.match(organizations, /FROM help_organizations/);
  assert.match(adoptions, /FROM adoption_dogs/);
  assert.match(reports, /FROM lost_found_dog_reports/);
  assert.match(adapter, /updateManagedHelpCase\(/);
  assert.match(adapter, /updateAdoptionFromAdmin\(/);
  assert.match(adapter, /updateAdminDogReport\(/);
  assert.match(adapter, /updateOrganizationFromAdmin\(/);
  for (const owner of ["help_cases", "adoption_dogs", "lost_found_dog_reports"])
    assert.ok(partner.includes('table: "' + owner + '"'), "partner must edit canonical " + owner);
  assert.ok(partnerProfiles.includes("FROM help_organizations"));
  assert.match(partner, /c\.status='APPROVED' AND a\.status='ACTIVE'/);
  assert.match(partner, /WHERE id=\? AND updated_at=\?/);
  assert.match(locks, /admin_entity_reviews/);
  assert.match(locks, /partner_help_claims/);
  assert.match(locks, /partner_memberships/);
});

test("all four Admin Help write handlers persist to D1 before targeted Notion, never from GET/DELETE", async () => {
  const cases = [
    ["app/api/admin/organizations/[id]/route.ts","updateOrganizationFromAdmin(","organizations"],
    ["app/api/admin/adoptions/[id]/route.ts","updateAdoptionFromAdmin(","adoptions"],
    ["app/api/admin/help/[id]/route.ts","updateManagedHelpCase(","help-cases"],
    ["app/api/admin/lost-found/[id]/route.ts","updateAdminDogReport(","lost-found"],
  ];
  for (const [path, writer, agenda] of cases) {
    const source = await read(path);
    const put = source.slice(source.indexOf("export async function PUT("));
    assert.ok(put.includes(writer),path+" must use its SQL editor");
    assert.ok(put.indexOf("syncSavedNotionRecord({")>put.indexOf(writer),
      path+" must mirror only after successful D1 save");
    assert.ok(put.includes('agenda: "'+agenda+'"'),path+" must use its own Notion agenda");
    const get = source.slice(source.indexOf("export async function GET("),
      source.indexOf("export async function PUT("));
    assert.ok(!get.includes("syncSavedNotionRecord({"),path+" GET must be read-only");
  }
});
