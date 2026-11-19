import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const migration = await read("drizzle/0171_partner_single_manager.sql");
const adminStore = await read("lib/partner-admin-store.ts");
const accountActions = await read("components/admin-partner-account-actions.tsx");
const claimAdmin = await read("lib/partner-claims-admin.ts");
const newProfileAdmin = await read("lib/partner-new-profile-admin.ts");
const eventsAdmin = await read("lib/partner-events-admin.ts");
const claimRoute = await read("app/api/admin/partners/claims/[id]/route.ts");
const newProfileRoute = await read("app/api/admin/partners/submissions/[id]/route.ts");
const eventRoute = await read("app/api/admin/partners/events/[id]/route.ts");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE partner_memberships (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER','MANAGER','EDITOR')),
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT
    );
    CREATE UNIQUE INDEX partner_memberships_active_unique
      ON partner_memberships (account_id,resource_id) WHERE revoked_at IS NULL;
    CREATE TABLE partner_audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('PARTNER','ADMIN','SYSTEM')),
      actor_ref TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  const add = (id, accountId, resourceId, role = "OWNER", revokedAt = null) =>
    db.prepare("INSERT INTO partner_memberships(id,account_id,resource_id,role,created_at,created_by,updated_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(id,accountId,resourceId,role,"2026-11-18T10:00:00Z","fixture","2026-11-18T10:00:00Z",revokedAt);
  return { db, add };
}

test("0171 keeps one active manager per resource and allows one account to manage many", async () => {
  const { db, add } = fixture();
  try {
    add("m1", "a1", "r1", "MANAGER");
    add("m2", "a1", "r2", "EDITOR");
    add("old", "a3", "r1", "EDITOR", "2026-11-17T10:00:00Z");
    db.exec(migration);
    assert.equal(db.prepare("SELECT role FROM partner_memberships WHERE id='m1'").get().role, "OWNER");
    assert.equal(db.prepare("SELECT role FROM partner_memberships WHERE id='m2'").get().role, "OWNER");
    assert.equal(db.prepare("SELECT role FROM partner_memberships WHERE id='old'").get().role, "EDITOR");
    const audit = db.prepare("SELECT action,metadata_json FROM partner_audit_events ORDER BY target_id").all();
    assert.equal(audit.length, 2);
    assert.ok(audit.every(row => row.action === "MEMBERSHIP_ROLE_CHANGED"));
    assert.deepEqual(audit.map(row => JSON.parse(row.metadata_json).fromRole).sort(), ["EDITOR", "MANAGER"]);

    assert.throws(() => add("blocked", "a2", "r1"), /UNIQUE constraint failed/);
    assert.throws(() => add("legacy", "a2", "r3", "EDITOR"), /partner_memberships_only_owner/);
    assert.throws(() => db.prepare("UPDATE partner_memberships SET role='MANAGER' WHERE id='m2'").run(), /partner_memberships_only_owner/);
    add("m3", "a1", "r3");
    db.prepare("UPDATE partner_memberships SET revoked_at=? WHERE id='m1'").run("2026-11-18T12:00:00Z");
    add("transferred", "a2", "r1");
    assert.equal(db.prepare("SELECT COUNT(*) count FROM partner_memberships WHERE resource_id='r1' AND revoked_at IS NULL").get().count, 1);

    const { assertSingleActivePartnerManager, PartnerSingleManagerConflictError } =
      await import(pathToFileURL(new URL("../lib/partner-single-manager.ts", import.meta.url).pathname).href);
    const adapter = {
      prepare(sql) {
        return { bind(...values) { return { first: async () => db.prepare(sql).get(...values) ?? null }; } };
      },
    };
    await assert.rejects(
      () => assertSingleActivePartnerManager({ database: adapter, accountId: "a1", resourceId: "r1" }),
      PartnerSingleManagerConflictError,
    );
    await assert.doesNotReject(() => assertSingleActivePartnerManager({ database: adapter, accountId: "a2", resourceId: "r1" }));
    await assert.doesNotReject(() => assertSingleActivePartnerManager({ database: adapter, accountId: "a1", resourceId: "r3" }));
  } finally { db.close(); }
});

test("0171 refuses existing duplicate active assignments without silently revoking either one", () => {
  const { db, add } = fixture();
  try {
    add("owner", "a1", "r1", "OWNER");
    add("other", "a2", "r1", "MANAGER");
    assert.throws(() => db.exec(migration), /UNIQUE constraint failed/);
    const rows = db.prepare("SELECT account_id,role,revoked_at FROM partner_memberships ORDER BY account_id").all();
    assert.deepEqual(rows.map(row => [row.account_id,row.role,row.revoked_at]), [
      ["a1","OWNER",null],["a2","MANAGER",null],
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM partner_audit_events").get().count, 0);
  } finally { db.close(); }
});

test("all assignment and linking paths enforce the single manager invariant", () => {
  assert.match(adminStore, /await assertSingleActivePartnerManager/);
  assert.match(adminStore, /account\.status!=="ACTIVE"/);
  assert.match(adminStore, /input\.role!=="OWNER"/);
  assert.match(claimAdmin, /ensurePartnerOwnerMembershipAdmin/);
  assert.match(claimAdmin, /om\.revoked_at IS NULL AND om\.account_id<>/);
  assert.match(newProfileAdmin, /if\(targetResource\)await assertSingleActivePartnerManager/);
  assert.match(eventsAdmin, /if\(targetResource\)await assertSingleActivePartnerManager/);
  for (const route of [claimRoute,newProfileRoute,eventRoute]) {
    assert.match(route, /PartnerSingleManagerConflictError/);
    assert.match(route, /409/);
  }
  assert.doesNotMatch(accountActions, /setRole|Partner rola|<select value=\{role\}/);
  assert.match(accountActions, /Jediný externý správca/);
});

test("0171 is prepared but cannot be applied by the generic production runner", async () => {
  const runner = await read("scripts/production-d1-migrate.mjs");
  const schema = await read("db/partner-schema.ts");
  assert.match(runner, /UNACTIVATED_PRODUCTION_TARGETS[\s\S]*"0171_partner_single_manager\.sql"/);
  assert.match(schema, /uniqueIndex\("partner_memberships_one_active_resource"\)/);
});
