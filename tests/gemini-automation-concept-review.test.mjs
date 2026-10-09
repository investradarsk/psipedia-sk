import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  listPendingGeminiDirectoryConcepts,
  getLinkedGeminiConcept,
  safeGeminiReviewUrl,
} from "../lib/gemini-automation-concept-review.ts";
import {
  prepareGeminiCanonicalRejection,
  persistGeminiRejectionPlan,
  isGeminiCandidateRejected,
} from "../lib/gemini-automation-dedupe-store.ts";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(source("drizzle/0114_gemini_dedupe.sql"));
  sqlite.exec(source("drizzle/0115_gemini_notion_bridge.sql"));
  sqlite.exec("CREATE TABLE directory_profiles (" +
    "id INTEGER PRIMARY KEY, status TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, " +
    "city TEXT NOT NULL, district TEXT NOT NULL, region TEXT NOT NULL, description TEXT NOT NULL, " +
    "website_url TEXT, source_data_json TEXT NOT NULL)");
  const db = { prepare(sql) {
    return { bind(...values) {
      const statement = sqlite.prepare(sql);
      return {
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return statement.run(...values); },
      };
    } };
  } };
  function add(profileId, conceptId, { status = "draft", bridge = "NOTION_LINKED",
    entityType = "DIRECTORY", sources = ["https://example.sk"], sourceData = {} } = {}) {
    sqlite.prepare("INSERT INTO directory_profiles (id,status,name,category,city,district,region,description,website_url,source_data_json) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(profileId,status,"Psia škola " + profileId,"treneri","Nitra","Nitra","Nitriansky kraj","Popis profilu",
        "https://skola.example.sk",JSON.stringify(sourceData));
    sqlite.prepare("INSERT INTO gemini_automation_concepts (id,stable_key,discovery_key,canonical_entity_type,canonical_entity_id,notion_page_id,status,primary_source_url,source_urls_json,discovered_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(conceptId,"directory.treneri","key"+conceptId,entityType,profileId,"notion-page-"+conceptId,
        bridge,sources[0] ?? null,JSON.stringify(sources),
        "2026-10-09T10:00:00.000Z","2026-10-09T10:00:00.000Z","2026-10-09T10:00:00.000Z");
  }
  return { sqlite, db, add, close: () => sqlite.close() };
}

test("review queue includes ONLY linked DIRECTORY drafts; non-Gemini drafts never enter", async () => {
  const f = fixture();
  try {
    f.add(1, 1, { sourceData: { "Telefón": "0905123456", "E-mail": "test@example.sk", "Facebook": "https://facebook.com/profile" } });
    f.add(2, 2, { status: "published" });
    f.add(3, 3, { status: "archived" });
    f.add(4, 4, { bridge: "NOTION_UNCERTAIN" });
    f.add(5, 5, { entityType: "EVENT" });
    f.sqlite.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(6,"draft","Non-Gemini","treneri","Nitra","Nitra","Nitriansky kraj","","", "{}");
    const rows = await listPendingGeminiDirectoryConcepts(f.db);
    assert.deepEqual(rows.map(row => row.canonicalEntityId), [1]);
    assert.equal(rows[0].name, "Psia škola 1");
    assert.equal(rows[0].phone, "0905123456");
    assert.equal(rows[0].email, "test@example.sk");
    assert.equal(rows[0].notionPageId, "notion-page-1");
    assert.equal((await getLinkedGeminiConcept(f.db, 1)).canonical_entity_id, 1);
    assert.equal(await getLinkedGeminiConcept(f.db, 0), null);
  } finally { f.close(); }
});

test("review sources are bounded and rendered only as safe external http(s) URLs", async () => {
  const f = fixture();
  try {
    f.add(1, 1, { sources: [
      "javascript:alert(1)", "https://example.sk/path", "https://example.sk/path",
      "https://user:password@example.sk", "data:text/html,x", "http://example.org",
    ] });
    const [row] = await listPendingGeminiDirectoryConcepts(f.db);
    assert.equal(row.primarySourceUrl, null);
    assert.deepEqual(row.sourceUrls, ["https://example.sk/path", "http://example.org/"]);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.sk",
      "https://user:pass@example.sk", "not a URL", ""]) assert.equal(safeGeminiReviewUrl(bad), null);
  } finally { f.close(); }
});

test("review queue is server-bounded to at most 50 canonical joins", async () => {
  const f = fixture();
  try {
    for (let index = 1; index <= 60; index++) f.add(index,index);
    assert.equal((await listPendingGeminiDirectoryConcepts(f.db, 5000)).length, 50);
  } finally { f.close(); }
});

test("canonical rejection hashes identities; replay is idempotent and future discovery is blocked", async () => {
  const f = fixture();
  try {
    const profile = {
      name: "Psia škola Živý Pes", city: "Nitra", websiteUrl: "https://www.zivypes.sk/",
      importData: { "Telefón": "+421 905 123 456", "E-mail": "INFO@ZIVYPES.SK" },
    };
    const plan = await prepareGeminiCanonicalRejection({
      stableKey: "directory.treneri", profile,
      reasonCode: "ADMIN_REJECTED", at: "2026-10-09T12:00:00.000Z",
    });
    assert.ok(plan.ids.length > 0);
    assert.ok(plan.ids.every(item => /^[0-9a-f]{64}$/.test(item.hash)));
    await persistGeminiRejectionPlan(f.db, plan);
    await persistGeminiRejectionPlan(f.db, plan);
    const rows = f.sqlite.prepare("SELECT identity_kind,identity_hash,candidate_name,reason_code FROM gemini_automation_rejections").all();
    assert.equal(rows.length, plan.ids.length);
    assert.ok(rows.every(row => row.reason_code === "ADMIN_REJECTED"));
    assert.ok(rows.every(row => !JSON.stringify(row).includes("+421") &&
      !JSON.stringify(row).includes("zivypes.sk") && !JSON.stringify(row).includes("INFO@")));
    const candidate = {
      name: profile.name, primary_url: "https://external-directory.example.org/",
      location: { city: "Nitra" },
      contacts: { phone: "0905 123 456", email: "info@zivypes.sk", website: "https://zivypes.sk/" },
    };
    const rejected = await isGeminiCandidateRejected(f.db, { stableKey: "directory.treneri", candidate });
    assert.equal(rejected?.reasonCode, "ADMIN_REJECTED");
    const other = {
      ...candidate, name: "Iný poskytovateľ",
      contacts: { phone: "+421 999 555 444", email: "other@example.net", website: "https://other.example.net" },
    };
    assert.equal(await isGeminiCandidateRejected(f.db, { stableKey: "directory.treneri", candidate: other }), null);
  } finally { f.close(); }
});

test("rejection requires an identity BEFORE archival; existing candidate path is preserved", async () => {
  await assert.rejects(
    prepareGeminiCanonicalRejection({ stableKey: "directory.treneri",
      profile: { name: "", city: "", websiteUrl: null, importData: null } }),
    /NO_REJECTION_IDENTITY/,
  );
  const route = source("app/api/admin/gemini-automation/concepts/[id]/reject/route.ts");
  const directory = source("lib/directory-store.ts");
  const review = source("components/admin-gemini-concept-review.tsx");
  assert.match(route, /await requireAdminMutation\(request\)/);
  assert.match(route, /getLinkedGeminiConcept\(database, id\)/);
  assert.match(route, /concept\.canonical_entity_type !== "DIRECTORY"/);
  assert.match(route, /concept\.status !== "NOTION_LINKED"/);
  assert.match(route, /profile\.status !== "draft" && profile\.status !== "archived"/);
  assert.match(route, /archiveManagedDirectoryProfile\([\s\S]*?draftOnly: true/);
  assert.match(directory, /status IN \('draft','published'\) AND \(\?=0 OR status='draft'\)/);
  assert.ok(route.indexOf("prepareGeminiCanonicalRejection") < route.indexOf("archiveManagedDirectoryProfile("));
  assert.match(review, /AdminDestructiveConfirmDialog/);
  assert.match(review, /\/admin\/adresar\//);
  assert.doesNotMatch(route, /publishManaged|GeminiClient|generateContent|createCanonicalDraft|ensureDirectoryProfileInNotion/);
  assert.doesNotMatch(source("app/admin/automatizacie-gemini/koncepty/page.tsx"), /runGemini/);
});
