import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { articleEntity, eventEntity } from "../lib/admin-seo-quality-entities.ts";
import { auditSeoQualityEntity } from "../lib/admin-seo-quality-rules.ts";
import { selectAdminSeoQualityPage } from "../lib/admin-seo-quality-page.ts";

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

test("ADMIN-SEO-QUALITY performance: keep global counts and filter only the paged items", () => {
  const store = fs.readFileSync(new URL("../lib/admin-seo-quality-store.ts", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../lib/admin-seo-quality-page.ts", import.meta.url), "utf8");
  assert.match(store, /selectAdminSeoQualityPage\(filtered, filters, filters\.page, PAGE_SIZE\)/);
  assert.match(page, /const visible = filtered\.filter\(\(item\) => item\.findings\.some\(matchesVisibleFinding\)\)/);
  assert.match(page, /visible\.slice\(offset, offset \+ pageSize\)\.map\(\(item\)/);
  assert.match(store, /resultCount: selected\.total/);
  assert.match(store, /itemsWithAnyFinding: inbox\.length/);
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
        const expected = source.map((item) => ({
          ...item, findings: item.findings.filter(match),
        })).filter((item) => item.findings.length > 0);
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
