import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const { searchPartnerClaimableRecords } = await import(
  pathToFileURL(new URL("../lib/partner-claim-search.ts", import.meta.url).pathname).href
);
const { getClaimablePartnerResourcePreview } = await import(
  pathToFileURL(new URL("../lib/partner-claims.ts", import.meta.url).pathname).href
);

function databaseFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,category TEXT,city TEXT,status TEXT);
    CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,name TEXT,slug TEXT,city TEXT,status TEXT,published_at TEXT,archived_at TEXT);
    CREATE TABLE managed_events(id INTEGER PRIMARY KEY,title TEXT,slug TEXT,event_type TEXT,city TEXT,status TEXT,published_at TEXT,start_date TEXT);
  `);
  const database = {
    prepare(sql) {
      return {
        bind(...parameters) {
          return {
            all: async () => ({ results: db.prepare(sql).all(...parameters) }),
            first: async () => db.prepare(sql).get(...parameters) ?? null,
          };
        },
      };
    },
  };
  return { db, database };
}

test("claim discovery only returns public canonical records and proper claim destinations", async () => {
  const { db, database } = databaseFixture();
  try {
    db.prepare("INSERT INTO directory_profiles VALUES(1,'Veterina Alfa','veterina-alfa','veterinari','Nitra','published')").run();
    db.prepare("INSERT INTO directory_profiles VALUES(2,'Veterina Alfa draft','veterina-draft','veterinari','Nitra','draft')").run();
    db.prepare("INSERT INTO help_organizations VALUES(3,'Alfa útulok','alfa-utulok','Nitra','PUBLISHED','2026-11-17',NULL)").run();
    db.prepare("INSERT INTO help_organizations VALUES(4,'Alfa skryté','alfa-skryte','Nitra','PUBLISHED','2026-11-17','2026-11-18')").run();
    db.prepare("INSERT INTO managed_events VALUES(5,'Alfa preteky','alfa-preteky','preteky','Nitra','published','2026-11-17','2026-12-01')").run();
    db.prepare("INSERT INTO managed_events VALUES(6,'Alfa privátne','alfa-privatne','preteky','Nitra','draft',NULL,'2026-12-02')").run();
    const directory = await searchPartnerClaimableRecords({ entityType: "DIRECTORY_PROFILE", query: "Alfa", database });
    assert.equal(directory.length, 1);
    assert.equal(directory[0].canonicalId, 1);
    assert.equal(directory[0].publicHref, "/adresar/veterinari/veterina-alfa");
    assert.equal(directory[0].claimHref, "/partner/prevziat-profil/DIRECTORY_PROFILE/1");
    const organizations = await searchPartnerClaimableRecords({ entityType: "HELP_ORGANIZATION", query: "Alfa", database });
    assert.deepEqual(organizations.map((item) => item.canonicalId), [3]);
    const events = await searchPartnerClaimableRecords({ entityType: "MANAGED_EVENT", query: "Alfa", database });
    assert.deepEqual(events.map((item) => item.canonicalId), [5]);
    assert.equal(events[0].publicHref, "/podujatia/alfa-preteky");
    const eventPreview = await getClaimablePartnerResourcePreview("MANAGED_EVENT", 5, database);
    assert.equal(eventPreview?.publicHref, "/podujatia/alfa-preteky");
    assert.equal(await getClaimablePartnerResourcePreview("MANAGED_EVENT", 6, database), null);
    assert.equal(await getClaimablePartnerResourcePreview("UNSUPPORTED", 5, database), null);
  } finally { db.close(); }
});

test("claim discovery requires a valid category and bounded query", async () => {
  const { db, database } = databaseFixture();
  try {
    db.prepare("INSERT INTO directory_profiles VALUES(1,'Veterina Alfa','veterina-alfa','veterinari','Nitra','published')").run();
    assert.deepEqual(await searchPartnerClaimableRecords({ entityType: "UNSUPPORTED", query: "Alfa", database }), []);
    assert.deepEqual(await searchPartnerClaimableRecords({ entityType: "DIRECTORY_PROFILE", query: "x", database }), []);
    assert.deepEqual(await searchPartnerClaimableRecords({ entityType: "DIRECTORY_PROFILE", query: "%_", database }), []);
    assert.equal((await searchPartnerClaimableRecords({ entityType: "DIRECTORY_PROFILE", query: "Nitra", database })).length, 1);
    assert.equal((await searchPartnerClaimableRecords({ entityType: "DIRECTORY_PROFILE", query: "Alfa".repeat(50), database })).length, 0);
  } finally { db.close(); }
});

test("claim discovery caps broad search result to 15", async () => {
  const { db, database } = databaseFixture();
  try {
    const insert = db.prepare("INSERT INTO managed_events VALUES(?,?,?,?,?,?,?,?)");
    for(let i=1;i<=21;i++) insert.run(i,"Test preteky "+i,"preteky-"+i,"preteky","Nitra","published","2026-11-17","2026-12-01");
    const rows = await searchPartnerClaimableRecords({ entityType: "MANAGED_EVENT", query: "preteky", database });
    assert.equal(rows.length, 15);
  } finally { db.close(); }
});

test("claim discovery is linked from dashboard, Partner shell, resource listings and admin queue", async () => {
  const files = await Promise.all([
    "app/partner/prevziat/page.tsx",
    "app/partner/page.tsx",
    "components/partner-shell.tsx",
    "app/partner/profily/page.tsx",
    "app/partner/podujatia/page.tsx",
    "app/admin/partners/claims/page.tsx",
    "lib/partner-claims-admin.ts",
    "lib/partner-claims.ts",
  ].map(read));
  const [page, dashboard, shell, profiles, events, adminPage, admin, claims] = files;
  assert.match(page, /requirePartnerPageIdentity/);
  assert.match(page, /searchPartnerClaimableRecords/);
  assert.match(page, /role="search"/);
  assert.match(page, /Požiadať o správu/);
  assert.match(dashboard, /\/partner\/prevziat/);
  assert.match(shell, /\/partner\/prevziat/);
  assert.match(profiles, /\/partner\/prevziat/);
  assert.match(events, /\/partner\/prevziat\?type=MANAGED_EVENT/);
  assert.match(adminPage, /value="MANAGED_EVENT"/);
  assert.match(admin, /LEFT JOIN managed_events e/);
  assert.match(admin, /claim\.entityType !== "MANAGED_EVENT"/);
  assert.match(claims, /queuePartnerLifecycleNotification/);
  assert.match(claims, /enqueueAdminNotificationEvent/);
  assert.match(claims, /COUNT\(\*\) count FROM partner_claims WHERE account_id/);
  assert.match(claims, /partner_claims WHERE account_id=\?1 AND resource_id=\?2 AND status='PENDING'/);
});
