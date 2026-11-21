import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  CLEANUP_SQL, SCHEMA_SQL, AGGREGATE_SQL, verifyCleanup,
} from "../scripts/production-help-org-contact-json-cleanup.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("one idempotent UPDATE removes only the two top-level historic contact keys", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE help_organizations (
      id INTEGER PRIMARY KEY,
      public_email TEXT,
      public_phone TEXT,
      source_data_json TEXT
    )`);
    const records = [
      [1, "sql@example.sk", "+421900000001", JSON.stringify({
        publicEmailsRaw: "historical@example.sk",
        publicPhonesRaw: "historical-phone",
        operatorName: "Zachovať", _psipedia_profile_gallery_urls: ["/media/test.jpg"],
        nested: { publicEmailsRaw: "nested-is-not-a-top-level-alias" },
      })],
      [2, null, null, JSON.stringify({
        publicEmailsRaw: "do-not-backfill@example.sk", publicPhonesRaw: "+421123",
        sourceActivity: "Zachovať aj pri NULL SQL",
      })],
      [3, "", "", '{"publicEmailsRaw":null,"publicPhonesRaw":null,"other":42}'],
      [4, null, "sql-phone", "{invalid-json"],
      [5, "unchanged@example.sk", null, '{"other":"unchanged"}'],
    ];
    const insert = db.prepare(
      "INSERT INTO help_organizations(id,public_email,public_phone,source_data_json) VALUES(?,?,?,?)",
    );
    for (const row of records) insert.run(...row);
    const before = db.prepare(AGGREGATE_SQL).get();
    const sqlBefore = db.prepare("SELECT id,public_email,public_phone FROM help_organizations ORDER BY id").all();
    const jsonBefore = db.prepare("SELECT id,source_data_json FROM help_organizations ORDER BY id").all();

    assert.deepEqual(new Set(db.prepare(SCHEMA_SQL).all().map(row => row.name)),
      new Set(["id", "source_data_json", "public_email", "public_phone"]));
    assert.equal(before.rows_with_legacy_contacts, 3);
    db.exec(CLEANUP_SQL);
    const after = db.prepare(AGGREGATE_SQL).get();
    assert.equal(after.rows_with_legacy_contacts, 0);
    assert.equal(verifyCleanup(before, after), true);
    assert.deepEqual(db.prepare("SELECT id,public_email,public_phone FROM help_organizations ORDER BY id").all(), sqlBefore);

    const jsonAfter = db.prepare("SELECT id,source_data_json FROM help_organizations ORDER BY id").all();
    assert.deepEqual(JSON.parse(jsonAfter[0].source_data_json), {
      operatorName: "Zachovať",
      _psipedia_profile_gallery_urls: ["/media/test.jpg"],
      nested: { publicEmailsRaw: "nested-is-not-a-top-level-alias" },
    });
    assert.deepEqual(JSON.parse(jsonAfter[1].source_data_json),
      { sourceActivity: "Zachovať aj pri NULL SQL" });
    assert.deepEqual(JSON.parse(jsonAfter[2].source_data_json), { other: 42 });
    assert.equal(jsonAfter[3].source_data_json, jsonBefore[3].source_data_json);
    assert.equal(jsonAfter[4].source_data_json, jsonBefore[4].source_data_json);

    db.exec(CLEANUP_SQL);
    assert.deepEqual(db.prepare("SELECT id,source_data_json FROM help_organizations ORDER BY id").all(), jsonAfter);
    assert.deepEqual(db.prepare("SELECT id,public_email,public_phone FROM help_organizations ORDER BY id").all(), sqlBefore);
  } finally {
    db.close();
  }
});

test("cleanup cannot mutate SQL contacts, profiles, identifiers, or other sections", () => {
  assert.equal((CLEANUP_SQL.match(/\\bUPDATE\\b/g) ?? []).length, 1);
  assert.match(CLEANUP_SQL, /^UPDATE help_organizations\\s+SET source_data_json = json_remove\\(/);
  assert.match(CLEANUP_SQL, /json_valid\\(source_data_json\\)/);
  assert.match(CLEANUP_SQL, /'\\$\\.publicEmailsRaw'/);
  assert.match(CLEANUP_SQL, /'\\$\\.publicPhonesRaw'/);
  assert.doesNotMatch(CLEANUP_SQL, /\\b(?:DROP|ALTER|INSERT|DELETE|REPLACE|JOIN)\\b/i);
  assert.doesNotMatch(CLEANUP_SQL, /\\b(?:public_email|public_phone|updated_at|image_url|seo_json)\\b/i);
});

test("public, Admin, partner, automation and Notion organization contacts stay SQL-authoritative", () => {
  const publicRead = read("lib/help-organization-store.ts");
  const adminRead = read("lib/help-organization-admin-store.ts");
  const adminWrite = read("lib/help-organization-admin-write.ts");
  const partner = read("lib/partner-profile-changes.ts");
  const automation = read("lib/data-automation-apply.ts");
  const notion = read("lib/notion-events-help-adapters.ts");

  assert.match(publicRead, /publicEmail: row\\.public_email/);
  assert.match(publicRead, /publicPhone: row\\.public_phone/);
  assert.match(adminRead, /publicEmail: row\\.public_email/);
  assert.match(adminRead, /publicPhone: row\\.public_phone/);
  assert.match(adminWrite, /public_email = \\?, public_phone = \\?/);
  assert.match(partner, /publicEmail:"public_email"/);
  assert.match(partner, /publicPhone:"public_phone"/);
  assert.match(automation, /publicEmail: field\\("public_email"\\)/);
  assert.match(automation, /publicPhone: field\\("public_phone"\\)/);
  // The existing Notion import preserves contact columns, and never imports
  // either value from legacy JSON. Other Notion agenda fields remain unchanged.
  assert.match(notion, /publicEmail: existing\\?\\.publicEmail \\?\\? null/);
  assert.match(notion, /publicPhone: existing\\?\\.publicPhone \\?\\? null/);
  assert.match(partner, /delete source\\.publicEmailsRaw;\\s*delete source\\.publicPhonesRaw;/);

  // There are no active JSON contact aliases in read/write paths.
  for (const file of [publicRead, adminRead, adminWrite, automation, notion]) {
    assert.doesNotMatch(file, /publicEmailsRaw|publicPhonesRaw/);
  }
});

test("production operation is manual, on main, protected and separate from the merge", () => {
  const workflow = read(".github/workflows/production-help-org-contact-json-cleanup.yml");
  const script = read("scripts/production-help-org-contact-json-cleanup.mjs");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /secrets\\.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow, /if: github\\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /git rev-parse origin\\/main/);
  assert.match(script, /GITHUB_REF !== "refs\\/heads\\/main"/);
  assert.match(script, /CLOUDFLARE_ACCOUNT_ID !== ACCOUNT/);
  assert.match(script, /DEPLOYED-SQL-HELP-ORGANIZATIONS-CLEANUP-psipedia-sk-db/);
  assert.doesNotMatch(workflow, /\\bpush:/);
  assert.doesNotMatch(script, /notionRequest|fetch\\(|backfill|INSERT INTO help_organizations/);
});
