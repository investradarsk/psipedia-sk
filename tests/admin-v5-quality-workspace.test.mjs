import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { overviewSqlSource, parseOverviewFilters, overviewHref, loadMissingDataOverview } from "../lib/admin-quality-missing-overview.ts";
import { qualityTabs } from "../lib/admin-quality-workspace.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5-05 renders the same compact tabs on all quality routes", () => {
  const nav = read("components/admin-quality-workspace-tabs.tsx");
  const registry = read("lib/admin-quality-workspace.ts");
  for (const href of [
    "/admin/kvalita", "/admin/kvalita/prehlad", "/admin/kvalita/seo", "/admin/kontrola-odkazov",
  ]) assert.ok(registry.includes('"' + href + '"'), href);
  assert.ok(nav.includes('aria-current={active === section.id ? "page" : undefined}'));
  assert.ok(nav.includes("prefetch={false}"));
  for (const [path, active] of [
    ["app/admin/kvalita/page.tsx", "findings"],
    ["app/admin/kvalita/prehlad/page.tsx", "missing"],
    ["app/admin/kvalita/seo/page.tsx", "seo"],
    ["app/admin/kontrola-odkazov/page.tsx", "links"],
  ]) {
    const page = read(path);
    assert.ok(page.includes('<AdminQualityWorkspaceTabs active="' + active + '" />'), path);
    assert.ok(page.includes("requireAdminPageUser("), path);
  }
  const css = read("components/admin-quality-workspace-tabs.module.css");
  assert.ok(css.includes("min-height: 44px"));
  assert.ok(css.includes("flex-wrap: wrap"));
});

test("V5-05 keeps proposals, manual review, history and cursor pagination intact", () => {
  const page = read("app/admin/kvalita/page.tsx");
  const dashboard = read("components/admin-missing-quality-dashboard.tsx");
  assert.ok(page.includes("loadMissingQualityDashboard(getQualityMissingDatabase(), { before })"));
  for (const fragment of [
    "data.manualHistory", "data.nextBefore", 'decide(p,"accept")', 'decide(p,"reject")',
    "runManualSearch()", 'method:"POST"',
  ]) assert.ok(dashboard.includes(fragment), fragment);
});

test("V5-05 preserves missing-data and SEO query filters and pagination", () => {
  const missing = read("app/admin/kvalita/prehlad/page.tsx");
  const seo = read("app/admin/kvalita/seo/page.tsx");
  assert.ok(missing.includes("loadMissingDataOverview(getQualityMissingDatabase(),filters)"));
  assert.ok(missing.includes('action="/admin/kvalita/prehlad"'));
  for (const key of ["area", "category", "field", "state", "q"]) {
    assert.ok(missing.includes('name="' + key + '"'), key);
  }
  assert.ok(missing.includes("overviewHref(filters,{page:result.page+1})"));
  assert.ok(seo.includes("loadAdminSeoQualityAudit("));
  assert.ok(seo.includes('action="/admin/kvalita/seo"'));
  for (const key of ["q", "agenda", "scope", "issue"]) {
    assert.ok(seo.includes('name="' + key + '"'), key);
  }
  assert.ok(seo.includes("auditHref(filterState, { page: report.pagination.page + 1 })"));
});

test("V5-05 link scan runs only on click and retains JSON export", () => {
  const checker = read("components/admin-link-health-checker.tsx");
  const page = read("app/admin/kontrola-odkazov/page.tsx");
  assert.ok(page.includes("<AdminLinkHealthChecker />"));
  assert.ok(checker.includes("onClick={() => void runScan()}"));
  assert.ok(checker.includes("onClick={saveReport}"));
  assert.ok(!page.includes("runScan("));
});

test("V5-05 Mapy remain independent and advanced links do not trigger paid operations", () => {
  const mapPage = read("app/admin/mapy/page.tsx");
  const toolsPage = read("app/admin/nastroje/page.tsx");
  const dashboard = read("components/admin-geo-operator-dashboard.tsx");
  for (const key of ["group", "category", "q", "page", "pageSize"]) {
    assert.ok(mapPage.includes("params." + key), key);
  }
  assert.ok(mapPage.includes("loadGeoAdminOperatorProfiles("));
  assert.ok(mapPage.includes("data-admin-maps-advanced"));
  assert.ok(mapPage.includes("<AdminGooglePlacesApiLink compact />"));
  assert.ok(dashboard.includes("<AdminGooglePlacePicker"));
  assert.ok(dashboard.includes("onClick={() => void runBulk()}"));
  assert.ok(toolsPage.includes('data-admin-content-module="technical-tools"'));
  assert.ok(toolsPage.includes("data-admin-advanced-tools"));
  for (const href of [
    "/admin/import", "/admin/nastroje/notion-audit", "/admin/operations/outreach",
    "/admin/nastroje/geo", "/admin/nastroje/google-places",
    "/admin/nastroje/address-enrichment", "/admin/nastroje/address-research-import",
  ]) assert.ok(toolsPage.includes('href="' + href + '"'), href);
  for (const source of [mapPage, toolsPage]) {
    assert.ok(!source.includes("fetch("));
    assert.ok(!source.includes("runBulk("));
    assert.ok(!source.includes("geocode("));
  }
});


test("V6-06 confirmed directory resolutions are not treated as missing; expired ones are", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, name TEXT, category TEXT, status TEXT, city TEXT, address TEXT, image_url TEXT, website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT);
      CREATE TABLE directory_profile_quality_resolutions(profile_id INTEGER, quality_field TEXT, resolution_status TEXT, checked_at TEXT);
      INSERT INTO directory_profiles VALUES
        (1,'A','veterinari','published','Nitra','A','image','web','','mail','fb','ig'),
        (2,'B','veterinari','published','Nitra','A','image','web','','mail','fb','ig'),
        (3,'C','veterinari','published','Nitra','A','image','web','123','mail','fb','ig');
      INSERT INTO directory_profile_quality_resolutions VALUES
        (1,'phone','NOT_PUBLIC',datetime('now')),
        (2,'phone','NOT_PUBLIC',datetime('now','-366 days')),
        (3,'phone','NOT_PUBLIC',datetime('now'));`);
    const filters = parseOverviewFilters({ area: "services", field: "phone" });
    const source = overviewSqlSource(filters, new Date("2026-11-24T12:00:00Z"));
    const flags = db.prepare(source.sql + " SELECT id,m_phone,e_phone FROM profiles ORDER BY id").all();
    assert.deepEqual(flags.map(row => [row.id,row.m_phone,row.e_phone]), [[1,0,1],[2,1,0],[3,0,0]]);
    const d1 = { prepare: sql => ({ bind: (...args) => ({
      first: async () => db.prepare(sql).get(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }) }) };
    const missing = await loadMissingDataOverview(d1, filters);
    assert.equal(missing.visibleCount, 1);
    assert.equal(missing.items[0].id, 2);
    const exceptions = parseOverviewFilters({ area: "services", field: "phone", view: "exceptions" });
    const report = await loadMissingDataOverview(d1, exceptions);
    assert.equal(report.visibleCount, 1);
    assert.equal(report.items[0].id, 1);
    assert.deepEqual(report.items[0].exceptions, ["phone"]);
    assert.match(overviewHref(exceptions, { page: 2 }), /view=exceptions/);
    assert.equal(parseOverviewFilters({ area:"events", view:"exceptions" }).exceptions, false);
  } finally { db.close(); }
});

test("V6-06 keeps direct quality shortcuts in Ctrl+K and distinguishes unavailable reads", () => {
  assert.equal(qualityTabs.length, 4);
  const quick = read("components/admin-quick-navigation-dialog.tsx");
  assert.match(quick, /qualityTabs.filter\(tab => tab.id !== "findings"\)/);
  assert.match(read("app/admin/kvalita/prehlad/page.tsx"), /Počty nie sú vyhodnotené/);
  assert.match(read("app/admin/kvalita/page.tsx"), /Evidencia návrhov je nedostupná/);
  assert.match(read("components/admin-missing-quality-dashboard.tsx"), /Posledný pokus:/);
  assert.match(read("components/admin-link-health-checker.tsx"), /V tejto relácii ešte neprebehla kontrola/);
});

test("missing fields include primary and secondary category members once", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, name TEXT, category TEXT, status TEXT, city TEXT, address TEXT, image_url TEXT, website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT);
      CREATE TABLE directory_profile_quality_resolutions(profile_id INTEGER, quality_field TEXT, resolution_status TEXT, checked_at TEXT);
      CREATE TABLE directory_profile_additional_categories(profile_id INTEGER, category TEXT);
      INSERT INTO directory_profiles(id,name,category,status) VALUES
        (1,'A','veterinari','published'),(2,'B','chovatelske-stanice','published'),
        (3,'C','chovatelske-stanice','published');
      INSERT INTO directory_profile_additional_categories VALUES (1,'veterinari'),(2,'veterinari');
    `);
    const d1 = { prepare: (sql) => ({ bind: (...args) => ({
      first: async () => db.prepare(sql).get(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }) }) };
    const filters = parseOverviewFilters({ area: "services", category: "veterinari", field: "phone" });
    const result = await loadMissingDataOverview(d1, filters);
    assert.equal(result.summary.totalProfiles, 2);
    assert.equal(result.visibleCount, 2);
    assert.deepEqual(result.items.map((item) => item.id), [1, 2]);
  } finally {
    db.close();
  }
});

test("quality search folds Slovak accents and treats percent and underscore as literal characters", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, name TEXT, category TEXT, status TEXT, city TEXT, address TEXT, image_url TEXT, website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT);
      CREATE TABLE directory_profile_quality_resolutions(profile_id INTEGER, quality_field TEXT, resolution_status TEXT, checked_at TEXT);
      INSERT INTO directory_profiles(id,name,category,status) VALUES
        (1,'Žltý salón 100%','veterinari','published'),(2,'Čistý salón','veterinari','published'),
        (3,'Salón_2','veterinari','published'),(4,'Björk','veterinari','published');
    `);
    const d1 = { prepare: (sql) => ({ bind: (...args) => ({
      first: async () => db.prepare(sql).get(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }) }) };
    for (const [q, id] of [["ZLTY SALON", 1], ["%", 1], ["_", 3], ["Björk", 4]]) {
      const result = await loadMissingDataOverview(d1, parseOverviewFilters({ q }));
      assert.deepEqual(result.items.map((item) => item.id), [id]);
    }
  } finally {
    db.close();
  }
});

test("help quality excludes retired duplicate categories and reports expiring earlier today", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE help_organizations(id INTEGER, name TEXT, status TEXT, city TEXT, image_url TEXT, website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT, registration_number TEXT);
      CREATE TABLE adoption_dogs(id INTEGER, name TEXT, status TEXT, city TEXT, main_image TEXT, contact_url TEXT, external_source_url TEXT, contact_phone TEXT, contact_email TEXT);
      CREATE TABLE help_cases(id INTEGER, title TEXT, category TEXT, status TEXT, city TEXT, resolved INTEGER, image_url TEXT, action_url TEXT);
      CREATE TABLE lost_found_dog_reports(id INTEGER, dog_name TEXT, type TEXT, status TEXT, city TEXT, expires_at TEXT, main_image TEXT, source_url TEXT);
      INSERT INTO help_cases(id,title,category,status) VALUES (1,'Stará adopcia','adopcia','published'),
        (2,'Zbierka','zbierky','published'), (3,'Opatera','docasna-opatera','published');
      INSERT INTO lost_found_dog_reports(id,dog_name,type,status,expires_at) VALUES
        (10,'Vypršal','LOST','ACTIVE','2026-11-25T08:00:00.000Z'),
        (11,'Ešte aktívny','FOUND','ACTIVE','2026-11-25T20:00:00.000Z'),
        (12,'Vyprší práve teraz','FOUND','ACTIVE','2026-11-25T12:00:00.000Z');
    `);
    const filters = parseOverviewFilters({ area: "help" });
    const now = new Date("2026-11-25T12:00:00.000Z");
    const source = overviewSqlSource(filters, now);
    const rows = db.prepare(source.sql + " SELECT id FROM profiles ORDER BY id").all(...source.bindings);
    assert.deepEqual(rows.map((row) => row.id), [2, 3, 11]);
    const all = overviewSqlSource(parseOverviewFilters({ area: "help", state: "all" }), now);
    assert.deepEqual(db.prepare(all.sql + " SELECT id FROM profiles ORDER BY id")
      .all(...all.bindings).map((row) => row.id), [2, 3, 10, 11, 12]);
    assert.equal(parseOverviewFilters({ area: "help", category: "case:adopcia" }).category, "");
    assert.equal(parseOverviewFilters({ area: "help", category: "category-not-supported" }).category, "");
    assert.equal(parseOverviewFilters({ area: "help", category: "case:zbierky" }).category, "case:zbierky");
  } finally {
    db.close();
  }
});
