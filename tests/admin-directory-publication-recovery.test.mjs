import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  DirectoryPublicationConflictError,
  publishDirectoryDraftByCas,
} from "../lib/admin-directory-publication.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const now = "2026-11-11T13:00:00.000Z";
const stamp = "2026-11-11T12:30:00.000Z";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE directory_profiles (" +
    "id INTEGER PRIMARY KEY,slug TEXT NOT NULL,name TEXT NOT NULL," +
    "category TEXT NOT NULL,status TEXT NOT NULL,published_at TEXT," +
    "updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,description TEXT)");
  const insert = sql.prepare("INSERT INTO directory_profiles " +
    "(id,slug,name,category,status,updated_at,updated_by,description) VALUES (?,?,?,?,?,?,?,?)");
  insert.run(1862,"test-psipedia-lifecycle-0164-20261111",
    "TEST – Psipedia 0164 – skúšobná psia škola","treneri","draft",stamp,"notion","test");
  insert.run(565,"agipaws","AgiPaws","treneri","published",stamp,"editor","real");
  return {
    sql,
    db: { prepare(query) { return { bind(...args) { return {
      async first() { return sql.prepare(query).get(...args) ?? null; },
    }; } }; } },
    async publish(overrides={}) {
      return publishDirectoryDraftByCas({
        db: this.db, id:1862, expectedUpdatedAt:stamp,
        expectedSlug:"test-psipedia-lifecycle-0164-20261111",
        expectedCategory:"treneri",actor:"admin@example.test",now,...overrides,
      });
    },
  };
}

test("confirmed owner publication transitions only the requested D1 draft", async () => {
  const f=fixture();
  try {
    await f.publish();
    const p=f.sql.prepare("SELECT * FROM directory_profiles WHERE id=1862").get();
    assert.equal(p.status,"published");
    assert.equal(p.published_at,now);
    assert.equal(p.updated_at,now);
    assert.equal(p.updated_by,"admin@example.test");
    assert.equal(p.description,"test");
    const agi=f.sql.prepare("SELECT * FROM directory_profiles WHERE id=565").get();
    assert.equal(agi.status,"published");
    assert.equal(agi.name,"AgiPaws");
    assert.equal(agi.description,"real");
  } finally {f.sql.close();}
});

test("stale revision, mismatched slug/category, and replay cannot publish", async () => {
  const f=fixture();
  try {
    await assert.rejects(f.publish({expectedUpdatedAt:"2001-01-01"}),DirectoryPublicationConflictError);
    await assert.rejects(f.publish({expectedSlug:"agipaws"}),DirectoryPublicationConflictError);
    await assert.rejects(f.publish({expectedCategory:"veterinari"}),DirectoryPublicationConflictError);
    assert.equal(f.sql.prepare("SELECT status FROM directory_profiles WHERE id=1862").get().status,"draft");
    await f.publish();
    await assert.rejects(f.publish(),DirectoryPublicationConflictError);
  } finally {f.sql.close();}
});

test("0164 deletion tombstone blocks the status-only rescue just as it blocks normal publishing", async () => {
  const f=fixture();
  try {
    f.sql.exec("CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER,state TEXT)");
    f.sql.exec("INSERT INTO admin_record_tombstones VALUES ('directory',1862,'PENDING_NOTION')");
    f.sql.exec("CREATE TRIGGER admin_removing_directory_update BEFORE UPDATE OF status,slug " +
      "ON directory_profiles WHEN (NEW.status <> 'draft' OR NEW.slug <> OLD.slug) " +
      "AND EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='directory' " +
      "AND record_id=OLD.id AND state<>'COMPLETE') " +
      "BEGIN SELECT RAISE(ABORT,'RECORD_REMOVAL_PENDING'); END");
    await assert.rejects(f.publish(),/RECORD_REMOVAL_PENDING/);
    assert.equal(f.sql.prepare("SELECT status FROM directory_profiles WHERE id=1862").get().status,"draft");
  } finally {f.sql.close();}
});

test("publish fallback requires a D1 reread, exact identity, and a CAS PATCH", () => {
  const editor=read("components/admin-directory-editor.tsx");
  assert.match(editor,/nextStatus === "published" && confirmedProfile.status === "draft"/);
  assert.match(editor,/cache: "no-store"/);
  assert.match(editor,/fresh.id !== profile.id/);
  assert.match(editor,/fresh.slug !== slug/);
  assert.match(editor,/fresh.category !== category/);
  assert.match(editor,/fresh.name !== name/);
  assert.match(editor,/action: "publish-confirmed-draft"/);
  assert.match(editor,/expectedUpdatedAt: fresh.updatedAt/);
  assert.match(editor,/confirmedProfile.status !== nextStatus/);
  assert.doesNotMatch(editor,/Zmena stavu profilu sa nepotvrdila.*setStatus\("published"\)/);
});

test("server never mirrors a publication as ordinary breeder field changes", () => {
  const route=read("app/api/admin/directory/[id]/route.ts");
  const guard=read("lib/admin-directory-publication.ts");
  assert.match(route,/publishDirectoryDraftByCas\(\{/);
  assert.match(route,/return Response.json\(\{ error: error.message \}, \{ status: 409 \}\)/);
  assert.match(route,/await acknowledgeAdminPublication\(db, "directory", id, "published"\)/);
  assert.match(route,/targetProfileId: id,\s*\/\/ Intentionally NO breederAdminFields/);
  assert.match(route,/DIRECTORY_PUBLICATION_NOTION_WRITEBACK_FAILED/);
  assert.match(route,/const saved = await getManagedDirectoryProfileById\(id, db\)/);
  assert.match(guard,/WHERE id=\? AND status='draft' AND updated_at=\? AND slug=\? AND category=\?/);
  assert.doesNotMatch(guard,/source_data_json\s*=/);
});
