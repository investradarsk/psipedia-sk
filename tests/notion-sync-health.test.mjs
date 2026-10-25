import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { notionSyncHealth, notionAgendaHealth } from "../lib/notion-sync-health.ts";

const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("catalog states never confuse blocked, quarantined and successful claims", () => {
  assert.equal(notionSyncHealth("service-catalog", { state: "BLOCKED" }).state, "BLOCKED");
  assert.equal(notionSyncHealth("service-catalog", { state: "DISABLED" }).state, "DISABLED");
  assert.equal(notionSyncHealth("service-catalog", { state: "QUARANTINED", reason: "RETRY" }).state, "CONFLICT");
  assert.deepEqual(
    notionSyncHealth("service-catalog", { state: "VERIFIED", optionId: "private-test-id" }),
    { event: "notion_sync_health", area: "service-catalog", state: "SYNCED", checked: 0, created: 0, updated: 1, conflicts: 0, failed: 0 },
  );
  assert.equal(notionSyncHealth("service-catalog", { state: "PAGE_READY" }).created, 1);
  assert.equal(notionSyncHealth("service-catalog", { state: "UNKNOWN" }).state, "ERROR");
});

test("events and help distinguish conflicts from failures and report partial writes", () => {
  const base = { enabled: true, schemaReady: true, totals: {
    scanned: 14, createdFromNotion: 0, createdInNotion: 0,
    pulledFromNotion: 0, pushedToNotion: 0, conflicts: 2, failed: 0,
  }};
  const conflict = notionSyncHealth("events-help", base);
  assert.equal(conflict.state, "CONFLICT");
  assert.equal(conflict.checked, 14);
  assert.equal(conflict.conflicts, 2);
  assert.equal(conflict.failed, 0);
  assert.equal(notionSyncHealth("events-help", {
    ...base, totals: { ...base.totals, pushedToNotion: 1 },
  }).state, "PARTIAL");
  assert.equal(notionSyncHealth("events-help", {
    ...base, schemaReady: false,
  }).state, "BLOCKED");
  assert.equal(notionSyncHealth("events-help", {
    ...base, totals: { ...base.totals, failed: 2, conflicts: 0 },
  }).state, "ERROR");
});

test("directory distinguishes enabled empty, updated, invalid and disabled", () => {
  const base = { enabled: true, schemaReady: true, notionScanned: 7,
    createdFromNotion: 0, bootstrapped: 0, pulledFromNotion: 0,
    pushedToNotion: 0, failed: 0 };
  assert.equal(notionSyncHealth("directory", base).state, "IDLE");
  assert.equal(notionSyncHealth("directory", { ...base, enabled: false }).state, "DISABLED");
  assert.equal(notionSyncHealth("directory", { ...base, schemaReady: false }).state, "BLOCKED");
  assert.equal(notionSyncHealth("directory", { ...base, pulledFromNotion: 2 }).state, "SYNCED");
  assert.equal(notionSyncHealth("directory", { ...base, failed: 1 }).state, "ERROR");
  assert.equal(notionSyncHealth("directory", { ...base, failed: 1, pushedToNotion: 1 }).state, "PARTIAL");
});

test("Facebook images report counts without post bodies or page identifiers", () => {
  const result = notionSyncHealth("facebook-images", {
    enabled: true, scanned: 12, created: 1, updated: 0, writtenBack: 2,
    conflicts: 0, failed: 0, invalid: 0,
    caption: "PRIVATE_TEXT", imageUrl: "SIGNED_URL",
  });
  assert.equal(result.state, "SYNCED");
  assert.equal(result.updated, 2);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TEXT|SIGNED_URL/);
  assert.equal(notionSyncHealth("facebook-images", {
    enabled: true, scanned: 1, invalid: 1,
  }).state, "ERROR");
});

test("existing scheduled Worker logs shared health for all four areas without extra cron", () => {
  const expected = [
    /notionSyncHealth\("service-catalog",\s*summary\)/,
    /notionSyncHealth\("facebook-images",\s*summary\)/,
    /notionSyncHealth\("events-help",\s*notionEventsHelp\)/,
    /notionSyncHealth\("directory",\s*notionDirectory\)/,
  ];
  for (const pattern of expected) assert.match(worker, pattern);
  assert.match(worker, /replacedByBidirectionalSync: true/);
  assert.doesNotMatch(worker, /runSimpleServiceCatalogSync/);
});

test("all five Events/Help agendas have bounded, value-free per-agenda health", () => {
  const names = ["events", "organizations", "adoptions", "help-cases", "lost-found"];
  const sample = notionAgendaHealth({
    enabled: true, schemaReady: true,
    agendas: names.map((agenda, index) => ({
      agenda, enabled: true, schemaReady: true, targetMissing: index === 3,
      scanned: 2, createdFromNotion: 0, createdInNotion: 0,
      pulledFromNotion: 0, pushedToNotion: index === 1 ? 1 : 0,
      conflicts: index === 2 ? 1 : 0, failed: index === 4 ? 1 : 0,
      entityId: 99, notionPageId: "PRIVATE", errors: ["PRIVATE_ERROR"],
    })),
  });
  assert.deepEqual(sample.map(s => s.agenda), names);
  assert.deepEqual(sample.map(s => s.state), ["IDLE","SYNCED","CONFLICT","BLOCKED","ERROR"]);
  assert.ok(sample.every(s => s.area === "events-help" && s.event === "notion_sync_agenda_health"));
  assert.doesNotMatch(JSON.stringify(sample), /PRIVATE|entityId|notionPageId|errors/);
  assert.equal(notionAgendaHealth({ enabled:false, schemaReady:true, agendas:[
    {agenda:"events", enabled:true, schemaReady:true}, {agenda:"events"}, {agenda:"private-agenda"},
  ]}).length, 1);
  assert.equal(notionAgendaHealth({ enabled:false, schemaReady:true, agendas:[{agenda:"events"}]})[0].state, "DISABLED");
  assert.match(worker, /for \(const record of notionAgendaHealth\(notionEventsHelp\)\)/);
  assert.doesNotMatch(worker, /NOTION_AGENDA_SEPARATE_CRON/);
});
