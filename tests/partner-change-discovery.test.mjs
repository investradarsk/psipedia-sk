import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const adminStore = read("lib/partner-profile-changes-admin.ts");
const partnersPage = read("app/admin/partners/page.tsx");
const partnerChangePage = read("app/admin/partners/changes/[id]/page.tsx");
const publicSuggestions = read("components/admin-directory-change-requests.tsx");

function templateLiteralAfter(source, marker) {
  const anchor = source.indexOf(marker);
  assert.ok(anchor >= 0, "Missing source SQL marker: " + marker);
  const quote = String.fromCharCode(96);
  const start = source.indexOf(quote, anchor) + 1;
  const end = source.indexOf(quote, start);
  assert.ok(start > 0 && end > start, "Missing template SQL body: " + marker);
  return source.slice(start, end);
}

test("Admin exposes both profile-change queues, including historical items", () => {
  assert.match(partnersPage, /href="\/admin\/partners\/changes\?status=all"/);
  assert.match(partnersPage, /href="\/admin\/adresar\/navrhy"/);
  assert.match(partnersPage, /data-admin-partner-change-requests/);
  assert.match(partnerChangePage, /Aktuálna hodnota/);
  assert.match(partnerChangePage, /Navrhovaná hodnota/);
});

test("legacy directory requests can be searched by profile name without changing their status", () => {
  assert.match(publicSuggestions, /const \[query, setQuery\] = useState\(""\)/);
  assert.match(publicSuggestions, /item\.profileName, item\.requesterName, item\.note, item\.profileSlug/);
  assert.match(publicSuggestions, /setQuery\(event\.target\.value\); setPage\(1\)/);
  assert.match(publicSuggestions, /status === "all" \|\| item\.status === status/);
});

test("old MyJoy-style request is found even beyond 300 more recent proposals", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec([
      "CREATE TABLE moderation_submissions (id TEXT PRIMARY KEY, resource_type TEXT, subject_id TEXT, operation TEXT, status TEXT, submitter_ref TEXT, proposed_patch_json TEXT, risk_flags_json TEXT, media_asset_id TEXT, rejection_reason_code TEXT, created_at TEXT, updated_at TEXT, reviewed_at TEXT, reviewed_by TEXT);",
      "CREATE TABLE partner_profile_change_metadata (submission_id TEXT, partner_resource_id TEXT, partner_account_id TEXT, base_updated_at TEXT, base_snapshot_json TEXT);",
      "CREATE TABLE partner_resources (id TEXT PRIMARY KEY, directory_profile_id INTEGER, help_organization_id INTEGER);",
      "CREATE TABLE partner_accounts (id TEXT PRIMARY KEY, email_ciphertext TEXT);",
      "CREATE TABLE media_assets (id TEXT PRIMARY KEY, original_mime TEXT, size_bytes INTEGER, width INTEGER, height INTEGER);",
      "CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, category TEXT, updated_at TEXT);",
      "CREATE TABLE help_organizations (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, updated_at TEXT);",
      "INSERT INTO partner_accounts VALUES ('account-1','fixture-encrypted-address');",
    ].join("\n"));

    const insertProfile = sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?)");
    const insertResource = sqlite.prepare("INSERT INTO partner_resources VALUES (?,?,NULL)");
    const insertChange = sqlite.prepare("INSERT INTO moderation_submissions (id,resource_type,subject_id,operation,status,submitter_ref,proposed_patch_json,risk_flags_json,created_at,updated_at) VALUES (?,'DIRECTORY_PROFILE',?,'UPDATE','APPROVED','account-1','{}','[]',?,?)");
    const insertMeta = sqlite.prepare("INSERT INTO partner_profile_change_metadata VALUES (?,?,'account-1',?,'{}')");
    for (let i = 0; i < 325; i += 1) {
      const when = new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString();
      const name = i === 0 ? "MyJoy" : i === 110 ? "A%Z Vet" : "Iná služba " + i;
      insertProfile.run(i + 1, name, "profile-" + i, "veterinari", when);
      insertResource.run("resource-" + i, i + 1);
      insertChange.run("request-" + i, String(i + 1), when, when);
      insertMeta.run("request-" + i, "resource-" + i, when);
    }

    // Derive the actual production query fragments from the source, rather
    // than copying SQL into the test and accidentally testing different SQL.
    const base = templateLiteralAfter(adminStore, "const BASE_SELECT=");
    const order = templateLiteralAfter(adminStore, "const order=");
    const nameWhere = templateLiteralAfter(adminStore, "const matched=(await database.prepare(BASE_SELECT+");
    const recent = sqlite.prepare(base + order).all();
    assert.equal(recent.length, 300);
    assert.equal(recent.some((item) => item.resourceName === "MyJoy"), false);

    const myjoy = sqlite.prepare(base + nameWhere + order).all("%myjoy%");
    assert.equal(myjoy.length, 1);
    assert.equal(myjoy[0].resourceName, "MyJoy");
    assert.equal(myjoy[0].id, "request-0");

    // LIKE metacharacters in a search term must be treated as literals.
    assert.match(adminStore, /q\.replace\(\/\[!%_\]\/g/);
    const special = sqlite.prepare(base + nameWhere + order).all("%a!%z%");
    assert.equal(special.length, 1);
    assert.equal(special[0].resourceName, "A%Z Vet");
  } finally {
    sqlite.close();
  }
});
