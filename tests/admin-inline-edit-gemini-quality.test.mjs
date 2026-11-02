import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Gemini inline settings reuse the canonical allowlisted settings API without paid dispatch or STOP mutation", () => {
  const quick = read("components/admin-gemini-quick-settings.tsx");
  const detail = read("components/admin-gemini-automation-settings.tsx");
  const api = read("app/api/admin/gemini-automation/route.ts");
  const validation = read("lib/gemini-automation-admin-settings.ts");
  const css = read("components/admin-gemini-quick-settings.module.css");
  assert.match(quick, /method: "PUT"/);
  assert.match(quick, /\/api\/admin\/gemini-automation"/);
  assert.match(quick, /stable_key: item\.stableKey/);
  assert.match(quick, /cadence_minutes: cadence/);
  assert.match(quick, /max_new_concepts: maximum/);
  assert.match(quick, /onSaved\(result\.setting\)/);
  assert.match(quick, /Schváliť|Uložiť/);
  assert.match(quick, /hasUnsavedCategory/);
  assert.doesNotMatch(quick, /\/run"|\/control"|onPilotClick|manual-background/);
  assert.match(api, /requireAdminMutation\(request\)/);
  assert.match(api, /parseGeminiSettingsInput/);
  assert.match(validation, /Možno upraviť iba zapnutie, frekvenciu a počet konceptov/);
  assert.match(detail, /<AdminGeminiQuickSettings/);
  assert.match(detail, /key=\{selected\.stableKey \+ ":" \+ cardRevision\}/);
  assert.match(css, /max-width: 899px/);
  assert.match(css, /display: none/);
});

test("Quality direct correction is limited to reviewed public link and contact fields, with profile CAS", () => {
  const ui = read("components/admin-missing-quality-dashboard.tsx");
  const route = read("app/api/admin/data-quality/missing/[id]/route.ts");
  const store = read("lib/data-quality-missing-hourly.ts");
  const css = read("components/admin-missing-quality-dashboard.module.css");
  assert.match(ui, /\["web","social","phone","email"\]\.includes\(p\.field_group\)/);
  assert.match(ui, /editingProposalId===p\.id/);
  assert.match(ui, /Schváliť upravený údaj/);
  assert.match(ui, /Upraviť v tabuľke/);
  assert.match(ui, /body:JSON\.stringify\(\{action,\.\.\.\(action==="accept"/);
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /key!=="action"&&key!=="value"/);
  assert.match(route, /reviewMissingQualityProposal\(getQualityMissingDatabase\(\),Number\(id\),body\.action,auth\.user\.email,body\.value\)/);
  assert.match(store, /\["web","social","phone","email"\]\.includes\(f\.group\)/);
  assert.match(store, /approvedValue=corrected/);
  assert.match(store, /source_url=\?/);
  assert.match(store, /approvedValue===p\.value\?p\.source_url:null/);
  assert.match(store, /AND updated_at=\?/);
  assert.match(store, /status='OPEN'/);
  assert.match(store, /qualityMissingCandidateKey\(p\.value\)/);
  assert.match(css, /max-width:899px/);
  assert.match(css, /display:none!important/);
});

test("Profile reviews allow approval directly on desktop but preserve mandatory reason workflow for negative actions", () => {
  const ui = read("components/admin-profile-review-inline-approval.tsx");
  const page = read("app/admin/recenzie-profilov/page.tsx");
  const full = read("components/admin-profile-review-actions.tsx");
  const route = read("app/api/admin/profile-reviews/[id]/route.ts");
  const css = read("components/admin-profile-review-inline-approval.module.css");
  assert.match(ui, /currentStatus !== "PENDING_REVIEW"/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /action: "APPROVE"/);
  assert.match(ui, /expectedStatus: "PENDING_REVIEW"/);
  assert.match(ui, /router\.refresh\(\)/);
  assert.doesNotMatch(ui, /action: "(?:REJECT|REMOVE|HIDE|RESTORE)"/);
  assert.match(page, /<AdminProfileReviewInlineApproval/);
  assert.match(full, /requiresReason\(action\)/);
  assert.match(route, /moderateProfileReviewAdmin/);
  assert.match(css, /max-width: 899px/);
  assert.match(css, /display: none/);
});

test("e-shop inline API is a narrow CAS mutation; slug, Lexical description, status and media survive", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const store = read("lib/eshop-ratings.ts");
  const route = read("app/api/admin/eshops/[id]/route.ts");
  const ui = read("components/admin-eshop-list-inline.tsx");
  const page = read("app/admin/recenzie/eshopy/page.tsx");
  const css = read("components/admin-eshop-list-inline.module.css");
  const sql = store.match(/UPDATE managed_eshops\s+SET name=\?,website_url=\?,updated_at=\?,updated_by=\?\s+WHERE id=\? AND updated_at=\?/);
  assert.ok(sql, "inline mutation must update only two public fields and compare exact timestamp");
  assert.match(store, /export async function updateManagedEshopInline/);
  assert.match(store, /normalizedText\(input\.name, "Názov", 160\)/);
  assert.match(store, /normalizedUrl\(input\.websiteUrl, "Web e-shopu"\)/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /requireAdminMutation\(request\)/);
  assert.match(route, /keys\.join\(","\) !== "expectedUpdatedAt,name,websiteUrl"/);
  assert.match(route, /updateManagedEshopInline\(id,/);
  assert.match(route, /syncSavedNotionRecord/);
  assert.doesNotMatch(route.slice(route.indexOf("export async function PATCH")), /updateManagedEshop\(id,/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /method: "PATCH"/);
  assert.match(ui, /expectedUpdatedAt: saved\.updatedAt/);
  assert.match(page, /<AdminEshopListInline shop=\{shop\} \/>/);
  assert.match(css, /max-width:899px/);

  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`CREATE TABLE managed_eshops (
      id INTEGER PRIMARY KEY,slug TEXT,name TEXT,website_url TEXT,description TEXT,
      status TEXT,logo_key TEXT,updated_at TEXT,updated_by TEXT)`);
    const oldVersion = "2026-11-02T08:30:00.000Z";
    sqlite.prepare("INSERT INTO managed_eshops VALUES (1,?,?,?,?,?,?,?,?)")
      .run("zoo-shop","Pôvodný e-shop","https://old.example","{\"lexical\":true}",
        "published","images/old.webp",oldVersion,"admin");
    const mutation = sqlite.prepare(sql[0]);
    const update = mutation.run("Opravený e-shop","https://new.example","2026-11-02T08:31:00.000Z","admin-2",1,oldVersion);
    assert.equal(update.changes, 1);
    const stale = mutation.run("Stará zmena","https://stale.example","2026-11-02T08:32:00.000Z","admin-3",1,oldVersion);
    assert.equal(stale.changes, 0, "concurrent stale editor must be rejected");
    const row = sqlite.prepare("SELECT * FROM managed_eshops WHERE id=1").get();
    assert.equal(row.name,"Opravený e-shop");
    assert.equal(row.website_url,"https://new.example");
    assert.equal(row.slug,"zoo-shop");
    assert.equal(row.description,'{"lexical":true}');
    assert.equal(row.logo_key,"images/old.webp");
    assert.equal(row.status,"published");
  } finally {
    sqlite.close();
  }
});
