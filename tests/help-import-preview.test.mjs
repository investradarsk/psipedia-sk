import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyHelpItems, previewHelpItems } from "../lib/help-import-preview.ts";

const regions = ["Bratislavský kraj", "Trnavský kraj", "Nitriansky kraj"];
const categories = ["utulky", "adopcia", "docasna-opatera", "zbierky", "dobrovolnictvo"];

function input(overrides = {}) {
  return {
    title: "Útulok Priateľ", slug: "utulok-priatel", category: "utulky", status: "draft",
    excerpt: "Pomáhame psom v núdzi a hľadáme im domovy.",
    description: "Pomáhame psom v núdzi a sprostredkúvame im zodpovedné adopcie na Slovensku.",
    organization: "OZ Priateľ", dogName: "", city: "Nitra", region: "Nitriansky kraj", locationNote: "Okres: Nitra",
    actionLabel: "Pomôcť organizácii",
    contactNote: "E-mail: ahoj@priatel.sk\nTelefón: +421 900 123 456\nFacebook: https://facebook.com/priatel",
    actionUrl: "https://priatel.sk", ...overrides,
  };
}
function production(overrides = {}) {
  const source = input();
  return {
    id: 1, slug: source.slug, title: source.title, category: source.category, status: source.status,
    excerpt: source.excerpt, description: source.description, organization: source.organization, dog_name: source.dogName,
    city: source.city, region: source.region, location_note: source.locationNote, contact_note: source.contactNote,
    action_url: source.actionUrl, ...overrides,
  };
}
function classify(items, rows = []) { return classifyHelpItems(items, rows, categories, regions); }

test("new valid organization is NEW and safe", () => {
  const preview = classify([input()]);
  assert.equal(preview.total, 1);
  assert.equal(preview.NEW, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 1);
  assert.equal(preview.rows[0].safeForImport, true);
});

test("same (category, slug) reads a match and never writes; identical record is EXISTING_SAME", async () => {
  const sql = [];
  const db = { prepare(query) { sql.push(query); return { async all() { return { success: true, results: [production()] }; } }; } };
  const preview = await previewHelpItems(db, [input()], categories, regions);
  assert.equal(preview.EXISTING_SAME, 1);
  assert.equal(preview.rows[0].matchedProductionId, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
  assert.equal(sql.length, 1);
  assert.match(sql[0], /^SELECT\b/);
  assert.doesNotMatch(sql[0], /\b(INSERT|UPDATE|DELETE|UPSERT|LIMIT|WHERE\s+status)\b/i);
});

test("different slug with strong identity is POSSIBLE_DUPLICATE", () => {
  const preview = classify([input({ slug: "oz-priatel" })], [production()]);
  assert.equal(preview.POSSIBLE_DUPLICATE, 1);
  assert.equal(preview.rows[0].matchedProductionTitle, "Útulok Priateľ");
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
});

test("same slug but different operator or description is CONFLICT", () => {
  assert.equal(classify([input({ organization: "OZ Iný" })], [production()]).CONFLICT, 1);
  assert.equal(classify([input({ description: "Iný podrobný popis práce útulku s adopciami psov." })], [production()]).CONFLICT, 1);
});

test("two regions and invalid region are BLOCKED without silent reduction", () => {
  for (const region of ["Bratislavský kraj; Trnavský kraj", "Neexistujúci kraj"]) {
    const preview = classify([input({ region })]);
    assert.equal(preview.BLOCKED, 1);
    assert.match(preview.rows[0].reason, /region/);
  }
});

test("drafts and over 100 production rows are checked without LIMIT", async () => {
  const rows = Array.from({ length: 151 }, (_, index) => production({ id: index + 1, slug: `historicky-${index}`, title: `Starý útulok ${index}`, organization: `Iné OZ ${index}`, city: "Košice", action_url: null, contact_note: "" }));
  rows[150] = production({ id: 151, status: "draft" });
  const db = { prepare(sql) { assert.match(sql, /^SELECT\b/); assert.doesNotMatch(sql, /\bLIMIT\b/i); return { async all() { return { success: true, results: rows }; } }; } };
  const preview = await previewHelpItems(db, [input()], categories, regions);
  assert.equal(preview.EXISTING_SAME, 1);
  assert.equal(preview.rows[0].matchedProductionId, 151);
});

test("106 inputs perform only one SELECT and no D1 write", async () => {
  let selects = 0;
  const db = {
    prepare(sql) {
      assert.match(sql, /^SELECT\b/);
      selects += 1;
      return { async all() { return { success: true, results: [] }; } };
    },
    batch() { throw new Error("batch must never run"); },
  };
  const items = Array.from({ length: 106 }, (_, index) => input({ title: `Útulok ${index}`, slug: `utulok-${index}`, organization: `OZ ${index}`, city: `Mesto ${index}`, actionUrl: `https://utulok-${index}.sk`, contactNote: "" }));
  const preview = await previewHelpItems(db, items, categories, regions);
  assert.equal(selects, 1);
  assert.equal(preview.total, 106);
  assert.equal(preview.NEW, 106);
  assert.equal(preview.SAFE_FOR_IMPORT, 106);
});

test("an incomplete or failed production SELECT aborts preview instead of marking items NEW", async () => {
  await assert.rejects(previewHelpItems({ prepare() { return { async all() { return { success: false, results: [] }; } }; } }, [input()], categories, regions), /úplný zoznam/);
  await assert.rejects(previewHelpItems({ prepare() { return { async all() { throw new Error("D1 unavailable"); } }; } }, [input()], categories, regions), /D1 unavailable/);
});

test("same contact identity or site domain across locations is not automatically NEW for organizations", () => {
  const existing = production({ id: 5, slug: "povodny-utulok", title: "Starý názov", organization: "Iné združenie", city: "Trnava", region: "Trnavský kraj" });
  assert.equal(classify([input()], [existing]).POSSIBLE_DUPLICATE, 1);
  assert.equal(classify([input({ actionUrl: "https://ine.sk", contactNote: "E-mail: ahoj@priatel.sk" })], [existing]).POSSIBLE_DUPLICATE, 1);
});

test("duplicate input keys block both rows and invalid payload stays BLOCKED", () => {
  const preview = classify([input(), input(), { ...input(), slug: "chybny", region: "Trnavský kraj / Nitriansky kraj" }]);
  assert.equal(preview.BLOCKED, 3);
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
});

test("shared legal operator across different organization titles remains a possible duplicate in utulky", () => {
  const caseInput = input({ title: "Združenie za práva zvierat, o.z.", slug: "zdruzenie-za-prava-zvierat", organization: "Združenie za práva zvierat, o.z.", city: "Bratislava" });
  const caseProduction = production({ title: "Československý kastračný program", slug: "ceskoslovensky-kastracny-program", organization: "Združenie za práva zvierat, o.z.", city: "Trnava" });
  const preview = classify([caseInput], [caseProduction]);
  assert.equal(preview.POSSIBLE_DUPLICATE, 1);
  assert.equal(preview.rows[0].matchedProductionTitle, "Československý kastračný program");
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
});

test("different adoption dogs from the same organization are NEW even when contacts and general URL are shared", () => {
  const first = input({
    category: "adopcia", title: "Rex hľadá nový domov", slug: "rex-hlada-novy-domov", dogName: "Rex",
    organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", actionLabel: "Mám záujem o adopciu",
    actionUrl: "https://utulok.example/na-adopciu", contactNote: "E-mail: adopcie@utulok.example\nTelefón: +421 900 111 222",
  });
  const second = input({
    category: "adopcia", title: "Beky hľadá nový domov", slug: "beky-hlada-novy-domov", dogName: "Beky",
    organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", actionLabel: "Mám záujem o adopciu",
    actionUrl: "https://utulok.example/na-adopciu", contactNote: "E-mail: adopcie@utulok.example\nTelefón: +421 900 111 222",
  });
  const preview = classify([first, second]);
  assert.equal(preview.NEW, 2);
  assert.equal(preview.POSSIBLE_DUPLICATE, 0);
  assert.equal(preview.SAFE_FOR_IMPORT, 2);
});

test("same adoption dog and organization with another slug is POSSIBLE_DUPLICATE", () => {
  const existing = production({
    id: 10, category: "adopcia", slug: "rex-na-adopciu", title: "Rex na adopciu", dog_name: "Rex",
    organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", action_url: "https://utulok.example/psy/rex",
  });
  const candidate = input({
    category: "adopcia", slug: "rex-hlada-domov", title: "Rex hľadá domov", dogName: "Rex",
    organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", actionLabel: "Mám záujem o adopciu",
    actionUrl: "https://utulok.example/psy/rex",
  });
  const preview = classify([candidate], [existing]);
  assert.equal(preview.POSSIBLE_DUPLICATE, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
});

test("same organization in another help category does not block a case", () => {
  const shelter = production({ category: "utulky", slug: "utulok-trnava", title: "Útulok Trnava", organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj" });
  const adoption = input({ category: "adopcia", slug: "rex-hlada-domov", title: "Rex hľadá domov", dogName: "Rex", organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", actionLabel: "Mám záujem o adopciu" });
  const preview = classify([adoption], [shelter]);
  assert.equal(preview.NEW, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 1);
});

test("same fundraiser title and organizer remains a possible duplicate", () => {
  const existing = production({ category: "zbierky", slug: "operacia-penny", title: "Pomôžme Penny postaviť sa", organization: "Zlatica Guzlejová", city: "Bratislava", region: "Bratislavský kraj", action_url: "https://donio.sk/pomozme-penny" });
  const candidate = input({ category: "zbierky", slug: "pomoc-pre-penny", title: "Pomôžme Penny postaviť sa", organization: "Zlatica Guzlejová", city: "Bratislava", region: "Bratislavský kraj", actionLabel: "Otvoriť overenú zbierku", actionUrl: "https://donio.sk/pomozme-penny" });
  const preview = classify([candidate], [existing]);
  assert.equal(preview.POSSIBLE_DUPLICATE, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 0);
});

test("preview endpoint is separate from existing mutating import route", () => {
  const route = readFileSync(new URL("../app/api/admin/help/preview/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /importFciBreeds|runBatches|createManagedHelpCase|\/api\/admin\/import|\.batch\(/);
  assert.match(route, /previewHelpItems/);
});
