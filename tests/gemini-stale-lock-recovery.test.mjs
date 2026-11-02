import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { recoverOwnerConfirmedLegacyLocks } from "../lib/gemini-stale-lock-recovery.ts";

const agendas = ["directory", "events", "organizations", "adoptions", "help-cases", "lost-found"];
const tables = {
  directory: ["directory_profiles", "directory_notion_sync", "directory_profile_id"],
  events: ["managed_events", "event_notion_sync", "event_id"],
  organizations: ["help_organizations", "notion_agenda_sync", "entity_id"],
  adoptions: ["adoption_dogs", "notion_agenda_sync", "entity_id"],
  "help-cases": ["help_cases", "notion_agenda_sync", "entity_id"],
  "lost-found": ["lost_found_dog_reports", "notion_agenda_sync", "entity_id"],
};
const pageId = "11111111-1111-4111-8111-111111111111";
const old = "2026-01-01T00:00:00.000Z";
const recent = new Date().toISOString();

function harness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE gemini_notion_review_locks (
      notion_page_id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE managed_events (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE adoption_dogs (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE help_cases (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE directory_notion_sync (notion_page_id TEXT, directory_profile_id INTEGER);
    CREATE TABLE event_notion_sync (notion_page_id TEXT, event_id INTEGER);
    CREATE TABLE notion_agenda_sync (agenda TEXT, notion_page_id TEXT, entity_id INTEGER);
  `);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          first: async () => statement.get(...params) ?? null,
          run: async () => ({meta: {changes: statement.run(...params).changes}}),
        };
      } };
    },
  };
  const keyFor = agenda => (agenda === "directory"
    ? "directory-import" : "gemini-canonical-import-" + agenda).replaceAll("-", "").toLowerCase();
  const insertLock = (id, stamp = old, owner = "worker-old") =>
    sqlite.prepare("INSERT INTO gemini_notion_review_locks VALUES (?,?,?)").run(id, owner, stamp);
  const countLocks = () =>
    sqlite.prepare("SELECT count(*) AS n FROM gemini_notion_review_locks").get().n;
  return {db, sqlite, keyFor, insertLock, countLocks, close:()=>sqlite.close()};
}

test("no locks means no writes for each of the six native agendas", async () => {
  const h = harness();
  try {
    for (const agenda of agendas) {
      assert.deepEqual(await recoverOwnerConfirmedLegacyLocks(h.db, agenda, pageId),
        {state:"CLEAR",recovered:0});
    }
  } finally { h.close(); }
});

test("recent or malformed lock is never removed", async () => {
  const h = harness();
  try {
    h.insertLock(h.keyFor("directory"), recent);
    assert.equal((await recoverOwnerConfirmedLegacyLocks(h.db,"directory",pageId)).state,"ACTIVE_LOCK");
    assert.equal(h.countLocks(),1);
  } finally { h.close(); }
});

test("stale page and category locks are reclaimed only when no unlinked D1 create exists", async () => {
  for(const agenda of agendas){
    const h = harness();
    try {
      h.insertLock(h.keyFor(agenda));
      h.insertLock(pageId.replaceAll("-",""));
      const result = await recoverOwnerConfirmedLegacyLocks(h.db, agenda, pageId);
      assert.deepEqual(result,{state:"RECOVERED",recovered:2},agenda);
      assert.equal(h.countLocks(),0);
      assert.deepEqual(await recoverOwnerConfirmedLegacyLocks(h.db,agenda,pageId),
        {state:"CLEAR",recovered:0});
    } finally { h.close(); }
  }
});

test("any unmapped D1 entity created after lock is a hard stop, even if unrelated", async () => {
  for(const agenda of agendas){
    const h = harness();
    try {
      h.insertLock(h.keyFor(agenda));
      const [table] = tables[agenda];
      h.sqlite.prepare(`INSERT INTO ${table}(id,created_at) VALUES (?,?)`)
        .run(77, "2026-06-01T00:00:00.000Z");
      const result = await recoverOwnerConfirmedLegacyLocks(h.db,agenda,pageId);
      assert.deepEqual(result,{state:"UNMAPPED_CANONICAL",recovered:0},agenda);
      assert.equal(h.countLocks(),1);
    } finally { h.close(); }
  }
});

test("mapped canonical entities are not mistaken for orphaned creates",async()=>{
  for(const agenda of agendas){
    const h=harness();
    try{
      h.insertLock(h.keyFor(agenda));
      const [table,mapping,key]=tables[agenda];
      h.sqlite.prepare(`INSERT INTO ${table}(id,created_at) VALUES (?,?)`)
        .run(77,"2026-06-01T00:00:00.000Z");
      if(agenda==="directory"||agenda==="events")
        h.sqlite.prepare(`INSERT INTO ${mapping}(notion_page_id,${key}) VALUES (?,?)`)
          .run(pageId,77);
      else h.sqlite.prepare(
        "INSERT INTO notion_agenda_sync(agenda,notion_page_id,entity_id) VALUES (?,?,?)"
      ).run(agenda,pageId,77);
      assert.deepEqual(await recoverOwnerConfirmedLegacyLocks(h.db,agenda,pageId),
        {state:"RECOVERED",recovered:1},agenda);
    }finally{h.close();}
  }
});

test("unknown canonical timestamps also block a potentially unsafe retry",async()=>{
  const h=harness();
  try{
    h.insertLock(h.keyFor("adoptions"));
    h.sqlite.prepare("INSERT INTO adoption_dogs(id,created_at) VALUES (?,?)")
      .run(78,"not-a-date");
    assert.deepEqual(await recoverOwnerConfirmedLegacyLocks(h.db,"adoptions",pageId),
      {state:"UNMAPPED_CANONICAL",recovered:0});
    assert.equal(h.countLocks(),1);
  }finally{h.close();}
});

test("failed D1 checks leave every lock untouched",async()=>{
  const h=harness();
  try{
    h.insertLock(h.keyFor("events"));
    h.sqlite.exec("DROP TABLE managed_events");
    assert.deepEqual(await recoverOwnerConfirmedLegacyLocks(h.db,"events",pageId),
      {state:"LOCK_CHECK_FAILED",recovered:0});
    assert.equal(h.countLocks(),1);
  }finally{h.close();}
});
