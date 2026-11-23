import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { PARTNER_LOST_FOUND_RESOLVE_SQL } from "../lib/partner-lost-found-resolution-sql.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const BEFORE = "2026-11-22T20:00:00.000Z";
const NOW = "2026-11-23T10:00:00.000Z";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "PRAGMA foreign_keys=ON;",
    "CREATE TABLE partner_accounts(id TEXT PRIMARY KEY,status TEXT NOT NULL);",
    "CREATE TABLE partner_help_claims(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,entity_type TEXT NOT NULL,lost_found_report_id INTEGER,status TEXT NOT NULL);",
    "CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,type TEXT,status TEXT,slug TEXT,main_image TEXT,public_email TEXT,updated_at TEXT,published_at TEXT,resolved_at TEXT,expires_at TEXT,duplicate_of_id INTEGER);",
    "CREATE TABLE lost_found_dog_private_details(report_id INTEGER PRIMARY KEY,contact_email_encrypted TEXT);",
    "INSERT INTO partner_accounts VALUES('owner','ACTIVE'),('outsider','ACTIVE');",
    "INSERT INTO partner_help_claims VALUES('claim-owner','owner','LOST_FOUND_DOG',21,'APPROVED');",
    "INSERT INTO lost_found_dog_reports VALUES(21,'LOST','ACTIVE','mia','/media/mia.webp','',"+
      "'"+BEFORE+"','2026-11-01T12:00:00.000Z',NULL,'2099-01-01T00:00:00.000Z',NULL);",
    "INSERT INTO lost_found_dog_private_details VALUES(21,'encrypted-reporter-contact');",
  ].join("\n"));
  return db;
}
function apply(db, accountId="owner", expected=BEFORE) {
  return db.prepare(PARTNER_LOST_FOUND_RESOLVE_SQL)
    .run(NOW,21,expected,NOW,accountId).changes;
}
test("approved active owner resolves existing dog exactly once, retaining URL, image and encrypted contacts",()=>{
  const db=fixture();
  try {
    assert.equal(apply(db),1);
    const row=db.prepare("SELECT * FROM lost_found_dog_reports WHERE id=21").get();
    assert.equal(row.status,"RESOLVED");
    assert.equal(row.resolved_at,NOW);
    assert.equal(row.updated_at,NOW);
    assert.equal(row.slug,"mia");
    assert.equal(row.main_image,"/media/mia.webp");
    assert.equal(row.public_email,"");
    assert.equal(row.published_at,"2026-11-01T12:00:00.000Z");
    assert.equal(db.prepare("SELECT contact_email_encrypted value FROM lost_found_dog_private_details WHERE report_id=21").get().value,"encrypted-reporter-contact");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM lost_found_dog_reports").get().n,1);
    assert.equal(apply(db,"owner",BEFORE),0,"double click must not mark an already resolved report again");
  } finally {db.close();}
});

test("D1 update predicate rejects outsiders, revoked/pending owners, inactive accounts and stale revisions",()=>{
  const scenarios = [
    ["outsider", db=>{}, "outsider"],
    ["revoked", db=>db.exec("UPDATE partner_help_claims SET status='REVOKED' WHERE id='claim-owner'"), "owner"],
    ["pending", db=>db.exec("UPDATE partner_help_claims SET status='PENDING' WHERE id='claim-owner'"), "owner"],
    ["suspended", db=>db.exec("UPDATE partner_accounts SET status='SUSPENDED' WHERE id='owner'"), "owner"],
    ["deactivated", db=>db.exec("UPDATE partner_accounts SET status='DEACTIVATED' WHERE id='owner'"), "owner"],
    ["stale edit", db=>db.exec("UPDATE lost_found_dog_reports SET updated_at='2026-11-23T09:59:00.000Z' WHERE id=21"), "owner"],
    ["unpublished", db=>db.exec("UPDATE lost_found_dog_reports SET published_at=NULL WHERE id=21"), "owner"],
    ["duplicate", db=>db.exec("UPDATE lost_found_dog_reports SET duplicate_of_id=10 WHERE id=21"), "owner"],
    ["already resolved", db=>db.exec("UPDATE lost_found_dog_reports SET status='RESOLVED' WHERE id=21"), "owner"],
    ["expired status", db=>db.exec("UPDATE lost_found_dog_reports SET status='EXPIRED' WHERE id=21"), "owner"],
    ["expired clock", db=>db.exec("UPDATE lost_found_dog_reports SET expires_at='2026-11-23T09:00:00.000Z' WHERE id=21"), "owner"],
  ];
  for(const [name,setup,account] of scenarios) {
    const db=fixture();
    try {
      setup(db);
      assert.equal(apply(db,account),0,name);
      assert.equal(db.prepare("SELECT resolved_at value FROM lost_found_dog_reports WHERE id=21").get().value,null,name);
    } finally {db.close();}
  }
});

test("Partner resolution endpoint is authenticated, CSRF-protected and accepts no status/owner overrides",()=>{
  const api=read("app/api/partner/help-records/[resourceId]/resolve/route.ts");
  const service=read("lib/partner-lost-found-resolution.ts");
  assert.match(api,/assertPartnerJsonMutation\(request\)/);
  assert.match(api,/requirePartnerAccount/);
  assert.match(api,/identity.onboardingComplete/);
  assert.match(api,/key!=="baseRevision"/);
  assert.match(api,/resolvePartnerLostFoundReport/);
  assert.match(api,/Cache-Control":"private, no-store/);
  assert.match(service,/parseHelpResourceId/);
  assert.match(service,/parsed.entityType !== "LOST_FOUND_DOG"/);
  assert.match(service,/requirePartnerPermission\(input.accountId, input.resourceId, "HELP_EDIT_PUBLIC", db\)/);
  assert.match(service,/status:"RESOLVED" as const/);
  assert.match(service,/PARTNER_LOST_FOUND_RESOLVE_SQL/);
  assert.match(service,/PARTNER_LOST_FOUND_RESOLVE_CONFLICT/);
});

test("D1 commit records one audited transition and Admin notification; Notion is a separate mirrored result",()=>{
  const service=read("lib/partner-lost-found-resolution.ts");
  const helper=read("lib/notion-targeted-admin-save.ts");
  assert.match(service,/adminNotificationEventStatement\(db/);
  assert.match(service,/partner_lost_found_resolved/);
  assert.match(service,/PROFILE_CHANGE_APPROVED/);
  assert.match(service,/mode:"LOST_FOUND_RESOLVED"/);
  assert.match(service,/captureHelpNotionSnapshot/);
  assert.ok(service.indexOf("captureHelpNotionSnapshot") < service.indexOf("db.batch(["));
  assert.ok(service.indexOf("const notionFieldSync = await syncSavedNotionRecord") > service.indexOf("await db.batch(["));
  assert.match(service,/beforeHelpSnapshot/);
  assert.match(helper,/isAdminNotionSyncLocked/,"respect existing Notion reviewed lock");
  assert.match(service,/invalidateVersionedPublicHtmlCacheUrl/);
  assert.match(service,/\/pomoc-psom\/stratene-psy/);
  assert.match(service,/\/pomoc-psom\/najdene-psy/);
});

test("Owner editor offers safe one-click found/reunited action and preserves existing direct edit and moderation",()=>{
  const page=read("app/partner/pomoc/[resourceId]/upravit/page.tsx");
  const form=read("components/partner-help-public-editor-form.tsx");
  const editor=read("lib/partner-help-editor.ts");
  assert.match(page,/reportStatus=\{editor.status\}/);
  assert.match(page,/reportType=\{editor.reportType\}/);
  assert.match(form,/entityType==="LOST_FOUND_DOG"&&reportStatus==="ACTIVE"/);
  assert.match(form,/Označiť psa ako nájdeného/);
  assert.match(form,/Označiť ako vráteného majiteľovi/);
  assert.match(form,/dirty\|\|state==="sending"\|\|state==="success"/);
  assert.match(form,/window.confirm/);
  assert.match(form,/router.refresh\(\)/);
  assert.match(editor,/const reportType: "LOST" \| "FOUND" \| null = parsed.entityType === "LOST_FOUND_DOG"/);
  assert.match(editor,/raw\.type === "LOST" \|\| raw\.type === "FOUND"/);
  assert.match(editor,/\breportType,/);
  assert.match(form,/mediaAssetId/);
  assert.match(form,/galleryMediaIds/);
  const ownerList=read("lib/partner-help-claims.ts");
  const uiLabels=read("lib/partner-ui-labels.ts");
  assert.match(ownerList,/\["ACTIVE","RESOLVED"\]\.includes\(row.recordStatus\)/);
  assert.match(editor,/\["ACTIVE","RESOLVED"\]\.includes\(String\(raw.status\)\)/);
  assert.match(uiLabels,/RESOLVED: "Vyriešené"/);
  assert.match(page,/PartnerLifecycleRequest/,"existing hide/archive/release workflow remains");
  const publicDetail=read("components/lost-found-dog-detail.tsx");
  assert.match(publicDetail,/Pes sa našiel. Hlásenie je uzavreté./);
  assert.match(publicDetail,/Pes sa vrátil majiteľovi. Hlásenie je uzavreté./);
  assert.match(read("lib/lost-found-dog-store.ts"),/status IN \('ACTIVE','RESOLVED','EXPIRED','ARCHIVED'\)/);
  assert.match(read("lib/lost-found-lifecycle.js"),/return status === "ACTIVE"/);
});
