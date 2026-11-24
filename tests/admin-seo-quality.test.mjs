import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildAdminSeoQualityAudit } from "../lib/admin-seo-quality-store.ts";
import { articleEntity, eventEntity, loadPublishedSeoQualityEntities, loadSeoQualitySources } from "../lib/admin-seo-quality-entities.ts";
import { adminSeoAgendas, adminSeoIssueDefinitions, auditSeoQualityEntity, isSeoMetadataFinding, isSeoProfileAgenda, seoEntityKey } from "../lib/admin-seo-quality-rules.ts";
import { auditHref, isSeoIssueInScope, selectAdminSeoQualityPage } from "../lib/admin-seo-quality-page.ts";

function entity(overrides = {}) {
  return {
    agenda: "directory",
    id: 1,
    title: "Veterinárna klinika Nitra",
    slug: "veterinarna-klinika-nitra",
    adminHref: "/admin/adresar/1",
    expectedCanonicalPath: "/adresar/veterinari/veterinarna-klinika-nitra",
    parentPath: "/adresar/veterinari",
    excerpt: "Veterinárna klinika v Nitre s ambulantnou a preventívnou starostlivosťou.",
    description: "Veterinárna klinika v Nitre poskytuje preventívnu, diagnostickú a ambulantnú starostlivosť pre psy aj ďalšie spoločenské zvieratá.",
    uniqueContentParts: [
      "Veterinárna klinika v Nitre poskytuje preventívnu, diagnostickú a ambulantnú starostlivosť pre psy aj ďalšie spoločenské zvieratá.",
      "Objednávanie, očkovanie, diagnostika, chirurgia a praktické informácie pre majiteľov zvierat na jednom mieste.",
    ],
    imageUrl: "/media/directory/klinika.webp",
    imageAlt: "Veterinárna klinika Nitra",
    imageAltMode: "stored",
    imageAltSource: "test.image_alt",
    city: "Nitra",
    cityRequired: true,
    category: "veterinari",
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: "",
    customSeoDescription: "",
    customCanonical: "",
    noindex: false,
    resultTitle: "Veterinárna klinika Nitra – kontakt a služby",
    resultDescription: "Veterinárna klinika Nitra v lokalite Nitra: kontakt, veterinárne služby, adresa a ďalšie praktické informácie.",
    ...overrides,
  };
}

test("ADMIN-SEO-QUALITY-1 distinguishes missing custom SEO from weak resolved metadata", () => {
  const findings = auditSeoQualityEntity(entity());
  assert.ok(findings.some((item) => item.code === "custom-title-missing" && item.scope === "custom"));
  assert.ok(findings.some((item) => item.code === "custom-description-missing" && item.scope === "custom"));
  assert.equal(findings.some((item) => item.code === "result-title-weak"), false);
  assert.equal(findings.some((item) => item.code === "result-description-weak"), false);
});

test("ADMIN-SEO-QUALITY-ALT-1 keeps decorative and unsupported image contracts out of image-alt-missing", () => {
  const adapted = articleEntity({
    id: 91,
    title: "Článok s obrázkom",
    slug: "clanok-s-obrazkom",
    portal_section: "clanky",
    category: "starostlivost",
    excerpt: "Praktický článok s dostatočne dlhým perexom pre kontrolu SEO auditu a jeho výsledných metadata.",
    intro: "Toto je dostatočne dlhý úvod článku, ktorý slúži iba ako testovací obsah pre SEO audit obrázkov a ALT kontraktu.",
    takeaway: "",
    sections_json: "[]",
    blocks_json: "[]",
    image_url: "/media/articles/test.webp",
    image_alt: "",
    seo_title: "",
    meta_description: "",
    canonical_url: "",
    noindex: 0,
  });
  const decorative = auditSeoQualityEntity({ ...adapted, imageAltMode: "decorative", imageAltSource: "public decorative contract" });
  const unsupported = auditSeoQualityEntity({ ...adapted, imageAltMode: "unsupported", imageAltSource: "agenda has no ALT contract" });
  assert.equal(decorative.some((item) => item.code === "image-alt-missing"), false);
  assert.equal(unsupported.some((item) => item.code === "image-alt-missing"), false);
});

test("ADMIN-SEO-QUALITY-ALT-1 article adapter uses the real stored ALT and never invents title fallback", () => {
  const baseRow = {
    id: 92,
    title: "Ako sa starať o labradora",
    slug: "ako-sa-starat-o-labradora",
    portal_section: "clanky",
    category: "starostlivost",
    excerpt: "Praktický sprievodca starostlivosťou o labradora s informáciami o pohybe, srsti, zdraví a každodennom režime.",
    intro: "Labrador potrebuje pravidelný pohyb, primeranú starostlivosť o srsť a zuby, kontrolu hmotnosti a preventívnu veterinárnu starostlivosť.",
    takeaway: "",
    sections_json: "[]",
    blocks_json: "[]",
    image_url: "/media/articles/labrador.webp",
    seo_title: "",
    meta_description: "",
    canonical_url: "",
    noindex: 0,
  };

  const missing = articleEntity({ ...baseRow, image_alt: "" });
  assert.equal(missing.imageAlt, "");
  assert.equal(missing.imageAltMode, "stored");
  assert.equal(missing.imageAltSource, "managed_articles.image_alt");
  assert.notEqual(missing.imageAlt, missing.title);
  assert.equal(auditSeoQualityEntity(missing).some((item) => item.code === "image-alt-missing"), true);

  const present = articleEntity({ ...baseRow, image_alt: "Čierny labrador pri prechádzke v prírode" });
  assert.equal(present.imageAlt, "Čierny labrador pri prechádzke v prírode");
  assert.equal(auditSeoQualityEntity(present).some((item) => item.code === "image-alt-missing"), false);
});

test("ADMIN-SEO-QUALITY-ALT-1 event adapter uses all six canonical discovery parents", () => {
  const expected = new Map([
    ["Výstava", "/podujatia/vystavy"],
    ["Preteky", "/podujatia/preteky"],
    ["Seminár", "/podujatia/seminare"],
    ["Tréning", "/podujatia/treningy"],
    ["Stretnutie", "/podujatia/stretnutia"],
    ["Iné", "/podujatia/dalsie"],
  ]);

  for (const [eventType, parentPath] of expected) {
    const adapted = eventEntity({
      id: 100,
      title: `Test ${eventType}`,
      slug: "test-event",
      event_type: eventType,
      city: "Nitra",
      excerpt: "Testovacie podujatie s dostatočne dlhým perexom pre regresnú kontrolu SEO quality auditu.",
      description: "Testovací popis podujatia je dostatočne dlhý na to, aby samotný ALT a crawlable parent test nebol ovplyvnený inými quality pravidlami.",
      practical_info: "",
      image_url: "/media/events/test.webp",
      seo_json: "{}",
    });
    assert.equal(adapted.parentPath, parentPath, eventType);
    assert.equal(adapted.imageAlt, `Test ${eventType}`, eventType);
    assert.equal(adapted.imageAltMode, "derived-public", eventType);
  }
});

test("ADMIN-SEO-QUALITY-1 reports explicit noindex and only non-self custom canonicals", () => {
  const selfCanonical = auditSeoQualityEntity(entity({
    noindex: true,
    customCanonical: "https://psipedia.sk/adresar/veterinari/veterinarna-klinika-nitra?utm_source=test#profil",
  }));
  assert.equal(selfCanonical.some((item) => item.code === "noindex-explicit"), true);
  assert.equal(selfCanonical.some((item) => item.code === "canonical-nonstandard"), false);

  const crossCanonical = auditSeoQualityEntity(entity({
    customCanonical: "https://psipedia.sk/adresar/veterinari/iny-profil",
  }));
  assert.equal(crossCanonical.some((item) => item.code === "canonical-nonstandard"), true);
});

test("ADMIN-SEO-QUALITY performance: keep scoped counts and filter only the paged items", () => {
  const store = fs.readFileSync(new URL("../lib/admin-seo-quality-store.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../lib/admin-seo-quality-page.ts", import.meta.url), "utf8");
  assert.match(store, /selectAdminSeoQualityPage\(filtered, filters, filters\.page, PAGE_SIZE\)/);
  assert.match(page, /const visible = filtered\.filter\(\(item\) => item\.findings\.some\(matchesVisibleFinding\)\)/);
  assert.match(page, /visible\.slice\(offset, offset \+ pageSize\)\.map\(\(item\)/);
  assert.match(store, /resultCount: available \? selected\.total : null/);
  assert.match(store, /itemsWithAnyFinding: available \? inbox\.length : null/);
  assert.match(store, /agendaCounts,/);
  assert.doesNotMatch(store, /filtered\.map\(\(item\)/);
});

test("ADMIN-SEO-QUALITY-1 stays read-only and exposes management links", () => {
  const entities = fs.readFileSync(new URL("../lib/admin-seo-quality-entities.ts", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../lib/admin-seo-quality-store.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../app/admin/kvalita/seo/page.tsx", import.meta.url), "utf8");

  assert.match(entities, /SELECT id, slug, name, category/);
  assert.match(entities, /WHERE status = 'published'/);
  const writeSql = /\b(?:INSERT\s+INTO|UPDATE\s+[a-z_]|DELETE\s+FROM|REPLACE\s+INTO)\b/i;
  assert.doesNotMatch(entities, writeSql);
  assert.doesNotMatch(store, writeSql);
  assert.match(page, /item\.entity\.adminHref/);
  assert.match(page, /Spravovať →/);
  assert.doesNotMatch(page, /fetch\(|method=["']POST|method=["']PUT|method=["']DELETE/);
});

test("ADMIN-SEO-QUALITY-1 covers every requested canonical agenda", () => {
  const entities = fs.readFileSync(new URL("../lib/admin-seo-quality-entities.ts", import.meta.url), "utf8");
  for (const marker of [
    'agenda: "directory"',
    'agenda: "events"',
    'agenda: "help"',
    'agenda: "organizations"',
    'agenda: "adoptions"',
    'agenda: "breeds"',
    'agenda: "articles"',
  ]) assert.ok(entities.includes(marker), marker);
});

test("SEO page selection exactly matches original complete projection on 134 mixed findings", () => {
  const makeItem = (id) => {
    const findings = [
      ...(id % 2 === 0 ? [{ code: "result-title-weak", scope: "quality" }] : []),
      ...(id % 3 === 0 ? [{ code: "custom-title-missing", scope: "custom" }] : []),
      ...(id % 5 === 0 ? [{ code: "noindex-explicit", scope: "quality" }] : []),
    ];
    return { entity: { id, agenda: "directory", title: "Profil " + id }, findings, customGapCount: 0, qualityFindingCount: 0 };
  };
  const source = Array.from({ length: 134 }, (_, id) => makeItem(id + 1));
  for (const scope of ["all", "quality", "custom"]) {
    for (const issue of ["all", "result-title-weak", "custom-title-missing", "noindex-explicit"]) {
      for (const requestedPage of [1, 2, 3, 99]) {
        const match = (finding) =>
          (scope === "all" || (scope === "custom" ? finding.scope === "custom" : finding.scope !== "custom"))
          && (issue === "all" || finding.code === issue);
        const expected = source.map((item) => {
          const findings = item.findings.filter(match);
          const customGapCount = findings.filter((finding) => finding.scope === "custom").length;
          return { ...item, findings, customGapCount, qualityFindingCount: findings.length - customGapCount };
        }).filter((item) => item.findings.length > 0);
        const totalPages = Math.max(1, Math.ceil(expected.length / 50));
        const page = Math.min(requestedPage, totalPages);
        const got = selectAdminSeoQualityPage(source, { scope, issue }, requestedPage, 50);
        assert.equal(got.total, expected.length, scope + "/" + issue);
        assert.equal(got.totalPages, totalPages);
        assert.equal(got.page, page);
        assert.deepEqual(got.items, expected.slice((page - 1) * 50, page * 50));
      }
    }
  }
  const empty = selectAdminSeoQualityPage([], { scope: "all", issue: "all" }, 900, 50);
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.deepEqual(empty.items, []);
});

test("SEO defaults prioritize missing profile metadata without inventing custom fields for rescue records", () => {
  assert.equal(isSeoProfileAgenda("directory"), true);
  assert.equal(isSeoProfileAgenda("help"), true);
  assert.equal(isSeoProfileAgenda("adoptions"), true);
  assert.equal(isSeoProfileAgenda("organizations"), true);
  assert.equal(isSeoProfileAgenda("breeds"), true);
  assert.equal(isSeoProfileAgenda("events"), false);
  assert.equal(isSeoProfileAgenda("articles"), false);

  const directoryFindings = auditSeoQualityEntity(entity());
  const rescueFindings = auditSeoQualityEntity(entity({
    agenda: "adoptions", id: 2, customSeoSupported: false, customSeoTitle: null,
    customSeoDescription: null, resultTitle: "Pes", resultDescription: "",
  }));
  assert.equal(rescueFindings.some(finding => finding.scope === "custom"), false,
    "generated rescue metadata must not be falsely reported as missing editable custom SEO");
  assert.equal(rescueFindings.some(finding => finding.code === "result-description-weak"), true);

  const items = [
    { entity: entity(), findings: directoryFindings, customGapCount: 2, qualityFindingCount: directoryFindings.length - 2 },
    { entity: entity({ agenda: "adoptions", id: 2 }), findings: rescueFindings, customGapCount: 0,
      qualityFindingCount: rescueFindings.length },
  ];
  const paged = selectAdminSeoQualityPage(items, { scope: "metadata", issue: "all" }, 1);
  assert.equal(paged.total, 2);
  assert.equal(paged.items[0].findings.every(isSeoMetadataFinding), true);
  assert.equal(paged.items[1].findings.every(isSeoMetadataFinding), true);

  const store = fs.readFileSync(new URL("../lib/admin-seo-quality-store.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../app/admin/kvalita/seo/page.tsx", import.meta.url), "utf8");
  assert.match(store, /: "profiles"/);
  assert.match(store, /: "metadata"/);
  assert.match(page, /SEO metadáta profilov/);
  assert.match(page, /Automatické SEO metadáta/);
});


test("V6-01 audits SQL-only schemas and never resurrects retired JSON", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    // Isolated schema fixture: no production database or migration execution.
    sqlite.exec(`
      CREATE TABLE directory_profiles (
        id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT,
        excerpt TEXT, description TEXT, city TEXT, online INTEGER, image_url TEXT
      );
      CREATE TABLE directory_profile_service_texts (
        profile_id INTEGER, item_order INTEGER, service_text TEXT
      );
      CREATE TABLE directory_profile_qualifications (
        profile_id INTEGER, item_order INTEGER, qualification_text TEXT
      );
      CREATE TABLE directory_profile_seo (
        profile_id INTEGER PRIMARY KEY, title TEXT DEFAULT '', description TEXT DEFAULT '',
        focus_keyword TEXT DEFAULT '', canonical_url TEXT DEFAULT '', og_title TEXT DEFAULT '',
        og_description TEXT DEFAULT '', og_image_url TEXT DEFAULT '', noindex INTEGER DEFAULT 0
      );
      CREATE TABLE directory_profile_additional_categories (profile_id INTEGER, category TEXT);
      CREATE TABLE directory_profile_extra_fields (profile_id INTEGER, field_key TEXT, text_value TEXT);
      CREATE TABLE service_profile_option_choices (profile_id INTEGER, option_id TEXT, choice TEXT);
      CREATE TABLE service_catalog_builtin_overrides (
        option_id TEXT, label TEXT, categories_json TEXT, group_name TEXT, meaning TEXT, version INTEGER
      );
      CREATE TABLE service_catalog_admin_options (
        id TEXT, label TEXT, categories_json TEXT, group_name TEXT, meaning TEXT,
        version INTEGER, kind TEXT, status TEXT
      );
      CREATE TABLE managed_breeds (
        id INTEGER PRIMARY KEY, slug TEXT, name TEXT, status TEXT, fci_group INTEGER,
        image_url TEXT, intro TEXT, character TEXT, needs TEXT, history TEXT,
        exercise TEXT, training TEXT, health TEXT
      );
      CREATE TABLE managed_events (
        id INTEGER, slug TEXT, title TEXT, status TEXT, excerpt TEXT, event_type TEXT, city TEXT,
        description TEXT, practical_info TEXT, image_url TEXT, seo_json TEXT
      );
      CREATE TABLE help_cases (
        id INTEGER, slug TEXT, title TEXT, status TEXT, category TEXT, excerpt TEXT, description TEXT,
        dog_name TEXT, city TEXT, location_note TEXT, contact_note TEXT, image_url TEXT, seo_json TEXT
      );
      CREATE TABLE lost_found_dog_reports (
        id INTEGER, type TEXT, slug TEXT, dog_name TEXT, breed TEXT, description TEXT,
        distinguishing_marks TEXT, collar_description TEXT, main_image TEXT, city TEXT,
        location_description TEXT, public_contact_note TEXT, status TEXT, published_at TEXT,
        duplicate_of_id INTEGER, expires_at TEXT
      );
      CREATE TABLE help_organizations (
        id INTEGER, name TEXT, slug TEXT, type TEXT, short_description TEXT, description TEXT,
        image_url TEXT, city TEXT, status TEXT, published_at TEXT, archived_at TEXT
      );
      CREATE TABLE organization_locations (
        id INTEGER, organization_id INTEGER, city TEXT, is_primary INTEGER, sort_order INTEGER
      );
      CREATE TABLE adoption_dogs (
        id INTEGER, name TEXT, slug TEXT, city TEXT, main_image TEXT, short_description TEXT,
        description TEXT, temperament TEXT, health_notes TEXT, adoption_requirements TEXT, status TEXT
      );
      CREATE TABLE managed_articles (
        id INTEGER, slug TEXT, title TEXT, excerpt TEXT, category TEXT, portal_section TEXT,
        intro TEXT, takeaway TEXT, sections_json TEXT, blocks_json TEXT, image_url TEXT,
        image_alt TEXT, seo_title TEXT, meta_description TEXT, canonical_url TEXT, noindex INTEGER,
        status TEXT, published_at TEXT
      );
    `);
    // Reuse the reviewed breed schema definitions in the disposable SQLite fixture.
    sqlite.exec(fs.readFileSync(new URL("../drizzle/0174_breeds_sql_json_foundation.sql", import.meta.url), "utf8"));
    sqlite.exec(`
      INSERT INTO directory_profiles VALUES
        (1,'test','Veterina','veterinari','published','Perex','Popis','Nitra',0,'/media/a.webp'),
        (2,'empty','Prázdny','veterinari','published','','','Nitra',0,''),
        (3,'absent','Bez SEO','veterinari','published','','','Nitra',0,''),
        (4,'draft','Koncept','veterinari','draft','','','Nitra',0,'');
      INSERT INTO directory_profile_seo (profile_id,title,description,canonical_url,noindex)
        VALUES (1,'SQL title','SQL description','/adresar/veterinari/other',1),(2,'','','',0);
      INSERT INTO directory_profile_qualifications VALUES (1,2,'Druhá'),(1,1,'Prvá');
      INSERT INTO directory_profile_service_texts VALUES (1,1,'Samostatný text'),(1,2,'Potlačená služba');
      INSERT INTO directory_profile_additional_categories VALUES (1,'treneri');
      INSERT INTO directory_profile_extra_fields VALUES (1,'_psipedia_trainer_services_text','Text trénera');
      INSERT INTO service_catalog_admin_options VALUES
        ('test-no','Potlačená služba','["veterinari"]','Test','Test',1,'service','ACTIVE'),
        ('test-yes','Nová služba','["treneri"]','Test','Test',1,'service','ACTIVE');
      INSERT INTO service_profile_option_choices VALUES (1,'test-no','no'),(1,'test-yes','yes');
      INSERT INTO managed_breeds (id,slug,name,status,fci_group,intro,seo_title,seo_description,seo_noindex,seo_canonical_url)
        VALUES (10,'labrador','Labrador','published',8,'Úvod','SQL plemeno','SQL popis',1,
          '/plemena/retrievery-sliedice-vodne/labrador');
      INSERT INTO breed_editorial_text (breed_id,overview) VALUES (10,'SQL redakčný text');
      INSERT INTO managed_events (id,slug,title,status,event_type,seo_json)
        VALUES (20,'event','Podujatie','published','Preteky','{"title":"SEO podujatia","noindex":true}');
      INSERT INTO help_cases (id,slug,title,status,category,seo_json)
        VALUES (30,'case','Prípad','published','zbierky','{"title":"SEO pomoci","noindex":true}');
      INSERT INTO managed_articles (id,slug,title,portal_section,seo_title,meta_description,canonical_url,noindex,status)
        VALUES (40,'article','Článok','clanky','SEO článku','SQL description','/clanky/article',1,'published');
    `);
    const database = {
      prepare(sql) {
        assert.match(sql, /^\s*SELECT\b/i);
        const statement = sqlite.prepare(sql);
        let bindings = [];
        return {
          bind(...args) { bindings = args; return this; },
          async all() { return { results: statement.all(...bindings) }; },
        };
      },
    };
    const initial = await loadPublishedSeoQualityEntities(database);
    assert.deepEqual(initial.map((row) => row.id), [1, 2, 3, 20, 30, 10, 40]);
    const byId = (rows, id) => rows.find((row) => row.id === id);
    const directory = byId(initial, 1);
    assert.equal(directory.customSeoTitle, "SQL title");
    assert.equal(directory.resultDescription, "SQL description");
    assert.equal(directory.noindex, true);
    const codes = auditSeoQualityEntity(directory).map((item) => item.code);
    assert.ok(codes.includes("noindex-explicit"));
    assert.ok(codes.includes("canonical-nonstandard"));
    assert.deepEqual(directory.uniqueContentParts, [
      "Perex", "Popis", "Samostatný text", "Nová služba", "Prvá", "Druhá", "Text trénera",
    ]);
    for (const id of [2, 3]) {
      const row = byId(initial, id);
      assert.equal(row.customSeoTitle, "");
      assert.equal(row.customSeoDescription, "");
      assert.equal(row.noindex, false);
      assert.equal(row.customCanonical, "");
      assert.ok(auditSeoQualityEntity(row).some((item) => item.code === "custom-title-missing"));
    }
    const breed = byId(initial, 10);
    assert.equal(breed.customSeoTitle, "SQL plemeno");
    assert.equal(breed.noindex, true);
    assert.ok(breed.uniqueContentParts.includes("SQL redakčný text"));
    assert.equal(auditSeoQualityEntity(breed).some((item) => item.code === "canonical-nonstandard"), false);
    assert.equal(byId(initial, 20).customSeoTitle, "SEO podujatia");
    assert.equal(byId(initial, 30).customSeoTitle, "SEO pomoci");
    assert.equal(byId(initial, 40).customSeoTitle, "SEO článku");
    assert.ok([20, 30, 40].every((id) => byId(initial, id).noindex));

    // Even a mixed transitional schema with deliberately wrong legacy documents
    // must produce exactly the same result, including empty SQL sidecars.
    sqlite.exec(`
      ALTER TABLE directory_profiles ADD COLUMN services_json TEXT DEFAULT '["STALE SERVICE"]';
      ALTER TABLE directory_profiles ADD COLUMN qualifications_json TEXT DEFAULT '["STALE QUALIFICATION"]';
      ALTER TABLE directory_profiles ADD COLUMN seo_json TEXT DEFAULT '{"title":"STALE","noindex":true}';
      ALTER TABLE managed_breeds ADD COLUMN seo_json TEXT DEFAULT '{"title":"STALE","noindex":false}';
      ALTER TABLE managed_breeds ADD COLUMN editorial_json TEXT DEFAULT '{"overview":"STALE"}';
    `);
    assert.deepEqual(await loadPublishedSeoQualityEntities(database, { BREED_SQL_V2_READ_MODE: "off" }), initial);

    // Fresh SQL edits, including a cleared SEO override, are visible immediately.
    sqlite.exec(`
      UPDATE directory_profile_seo SET title='', description='', canonical_url='', noindex=0 WHERE profile_id=1;
      DELETE FROM directory_profile_qualifications WHERE profile_id=1;
      DELETE FROM directory_profile_service_texts WHERE profile_id=1;
      UPDATE managed_breeds SET seo_title='Aktualizované SQL plemeno',seo_noindex=0 WHERE id=10;
    `);
    const edited = await loadPublishedSeoQualityEntities(database);
    assert.equal(byId(edited, 1).customSeoTitle, "");
    assert.equal(byId(edited, 1).customCanonical, "");
    assert.equal(byId(edited, 1).noindex, false);
    assert.deepEqual(byId(edited, 1).uniqueContentParts, ["Perex", "Popis", "Nová služba", "Text trénera"]);
    assert.equal(byId(edited, 10).customSeoTitle, "Aktualizované SQL plemeno");
    assert.equal(byId(edited, 10).noindex, false);
  } finally {
    sqlite.close();
  }
});

const v6AuditScans = [
  ["directory", "FROM directory_profiles"],
  ["events", "FROM managed_events"],
  ["help", "FROM help_cases"],
  ["lostFound", "FROM lost_found_dog_reports"],
  ["organizations", "FROM help_organizations o"],
  ["adoptions", "FROM adoption_dogs"],
  ["breeds", "FROM managed_breeds"],
  ["articles", "FROM managed_articles"],
];

function v6AuditDatabase(rows = {}, fail = []) {
  const calls = [];
  const database = {
    prepare(sql) {
      const source = v6AuditScans.find(([, marker]) => sql.includes(marker))?.[0];
      assert.ok(source, "unexpected D1 query");
      calls.push(source);
      if (fail.includes(source + ":prepare")) throw new Error("prepare failed");
      return {
        bind() { return this; },
        async all() {
          if (fail.includes(source)) throw new Error("query failed");
          if (fail.includes(source + ":result")) return { success: false, results: [] };
          return { results: rows[source] ?? [] };
        },
      };
    },
  };
  return { database, calls };
}

test("V6-02 limits detail D1 reads to requested sources, including on later pages", async () => {
  const rows = { articles: Array.from({ length: 134 }, (_, i) => ({
    id: i + 1, title: "Článok " + (i + 1), slug: "clanok-" + (i + 1),
    category: "zdravie", portal_section: "clanky", seo_title: "", meta_description: "",
  })) };
  const { database, calls } = v6AuditDatabase(rows);
  const all = await buildAdminSeoQualityAudit(database, { agenda: "all", scope: "custom" });
  assert.equal(calls.length, 8);
  assert.equal(all.entityCount, 134);
  calls.length = 0;
  const scoped = await buildAdminSeoQualityAudit(database, { agenda: "articles", scope: "custom", page: 2 });
  assert.deepEqual(calls, ["articles"], "one rather than eight detail queries");
  assert.equal(scoped.entityCount, 134);
  assert.equal(scoped.resultCount, all.resultCount);
  assert.equal(scoped.items.length, 50);
  assert.equal(scoped.items[0].entity.id, 51);
  assert.equal(scoped.agendaAvailability.directory, "not-requested");
  assert.equal(scoped.agendaCounts.directory, null);
  calls.length = 0;
  await buildAdminSeoQualityAudit(database, { agenda: "profiles" });
  assert.deepEqual(calls, ["directory", "help", "lostFound", "organizations", "adoptions", "breeds"]);
});

test("V6-02 preserves successful help sources and explicitly marks partial totals", async () => {
  const { database, calls } = v6AuditDatabase({
    help: [{ id: 1, title: "Pomoc", slug: "pomoc", category: "zbierky" }],
  }, ["lostFound:prepare"]);
  const report = await buildAdminSeoQualityAudit(database, { agenda: "help", scope: "all" });
  assert.deepEqual(calls, ["help", "lostFound"]);
  assert.equal(report.availability, "partial");
  assert.equal(report.agendaAvailability.help, "partial");
  assert.deepEqual(report.failedSources, ["lostFound"]);
  assert.equal(report.agendaCounts.help.entities, 1);
  assert.equal(report.entityCount, 1);
  assert.equal(report.items[0].entity.id, 1);
});

test("V6-02 distinguishes empty, unavailable and partially available scopes", async () => {
  const { database } = v6AuditDatabase({}, ["events:result", "articles"]);
  const empty = await buildAdminSeoQualityAudit(database, { agenda: "adoptions" });
  assert.equal(empty.availability, "complete");
  assert.equal(empty.resultCount, 0);
  const error = await buildAdminSeoQualityAudit(database, { agenda: "events" });
  assert.equal(error.availability, "error");
  assert.equal(error.resultCount, null);
  assert.equal(error.issueCounts, null);
  assert.equal(error.agendaCounts.events, null);
  const partial = await buildAdminSeoQualityAudit(database, { agenda: "all" });
  assert.equal(partial.availability, "partial");
  assert.deepEqual(partial.failedSources, ["events", "articles"]);
  assert.equal(partial.agendaAvailability.adoptions, "complete");
  const noDb = await buildAdminSeoQualityAudit(undefined, { agenda: "articles" });
  assert.equal(noDb.availability, "error");
  assert.equal(noDb.entityCount, null);
});

test("V6-02 reads fresh values on subsequent requests and ignores unrelated failures", async () => {
  const rows = { articles: [{ id: 1, title: "Článok", slug: "clanok", category: "zdravie", seo_title: "", meta_description: "" }] };
  const { database, calls } = v6AuditDatabase(rows, ["directory"]);
  const first = await buildAdminSeoQualityAudit(database, { agenda: "articles", scope: "custom" });
  assert.equal(first.resultCount, 1);
  rows.articles[0].seo_title = "Nový dostatočne dlhý SEO titulok článku";
  rows.articles[0].meta_description = "Nový meta popis článku, ktorý opisuje obsah a poskytuje návštevníkom dostatok informácií.";
  const second = await buildAdminSeoQualityAudit(database, { agenda: "articles", scope: "custom" });
  assert.equal(second.availability, "complete");
  assert.equal(second.resultCount, 0);
  assert.deepEqual(calls, ["articles", "articles"]);
});

test("V6-02 isolates entity conversion errors and keeps the other source", async () => {
  const { database } = v6AuditDatabase({
    directory: [{ id: 1, service_choices: "invalid" }],
    articles: [{ id: 2, title: "Článok", slug: "clanok" }],
  });
  const sources = await loadSeoQualitySources(database, "all");
  assert.equal(sources.find((source) => source.source === "directory").status, "error");
  const article = sources.find((source) => source.source === "articles");
  assert.equal(article.status, "available");
  assert.equal(article.entities[0].id, 2);
});


test("V6-03 round-trips every agenda, scope and issue including all, search and pagination", () => {
  for (const agenda of ["all", "profiles", ...adminSeoAgendas]) {
    for (const scope of ["all", "metadata", "custom", "quality"]) {
      for (const issue of ["all", ...adminSeoIssueDefinitions.map((item) => item.code)]) {
        const filters = { agenda, scope, issue, query: "Žilina & Nitra + pes" };
        for (const page of [1, 2, 99]) {
          const params = new URL(auditHref(filters, { page }), "https://admin.invalid").searchParams;
          assert.equal(params.get("agenda"), agenda);
          assert.equal(params.get("scope"), scope);
          assert.equal(params.get("issue"), issue);
          assert.equal(params.get("q"), filters.query);
          assert.equal(Number(params.get("page") ?? 1), page);
        }
      }
    }
  }
});

test("V6-03 counts records, profiles, findings and issue facets separately before pagination", async () => {
  const rows = { articles: Array.from({ length: 53 }, (_, i) => ({
    id: i + 1, title: i === 52 ? "Iný článok" : "Nitra článok " + i,
    slug: "clanok-" + i, category: "zdravie", portal_section: "clanky",
    seo_title: "", meta_description: "",
  })) };
  const { database } = v6AuditDatabase(rows);
  const all = await buildAdminSeoQualityAudit(database, { agenda: "all", scope: "custom", query: "Nitra", page: 2 });
  assert.equal(all.entityCount, 53);
  assert.equal(all.filteredEntityCount, 52);
  assert.equal(all.resultCount, 52);
  assert.equal(all.resultProfileCount, 0);
  assert.equal(all.resultFindingCount, 104);
  assert.equal(all.items.length, 2);
  assert.equal(all.filteredCustomGapEntities, 52);
  assert.equal(all.filteredIssueCounts["custom-title-missing"], 52);
  assert.equal(all.filteredIssueCounts["description-missing"], 0);
  const one = await buildAdminSeoQualityAudit(database, { agenda: "all", scope: "custom", issue: "custom-title-missing", query: "Nitra", page: 99 });
  assert.equal(one.pagination.page, 2);
  assert.equal(one.resultFindingCount, 52);
  assert.equal(one.filteredIssueCounts["custom-description-missing"], 52);
  assert.equal(one.items[0].customGapCount, 1);
  const incompatible = await buildAdminSeoQualityAudit(database, { agenda: "all", scope: "custom", issue: "description-missing", query: "Nitra" });
  assert.equal(incompatible.resultCount, 0);
  assert.equal(incompatible.resultFindingCount, 0);
  assert.equal(isSeoIssueInScope("description-missing", "custom"), false);
});

test("V6-03 separates help and lost-found IDs and keeps correct editor routes", async () => {
  const { database } = v6AuditDatabase({
    help: [{ id: 7, title: "Pomoc", slug: "pomoc", category: "zbierky" }],
    lostFound: [{ id: 7, dog_name: "Pes", slug: "pes", type: "LOST" }],
  });
  const report = await buildAdminSeoQualityAudit(database, { agenda: "help", scope: "all" });
  assert.equal(report.resultCount, 2);
  assert.equal(report.resultProfileCount, 2);
  assert.deepEqual(report.items.map((item) => seoEntityKey(item.entity)), ["help:7", "lostFound:7"]);
  assert.deepEqual(report.items.map((item) => item.entity.adminHref), ["/admin/pomoc/7", "/admin/stratene-najdene/7"]);
});
