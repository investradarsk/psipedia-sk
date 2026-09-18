import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyHelpItems, previewHelpItems } from "../lib/help-import-preview.ts";

const regions = ["Bratislavský kraj", "Trnavský kraj", "Nitriansky kraj"];
const categories = ["utulky", "adopcia", "docasna-opatera", "zbierky", "dobrovolnictvo"];

function input(overrides = {}) {
  return {
    title: "Venčenie v OZ Priateľ", slug: "vencenie-oz-priatel", category: "dobrovolnictvo", status: "draft",
    excerpt: "Pomôžte pravidelným venčením psov v starostlivosti združenia.",
    description: "Hľadáme dobrovoľníkov na pravidelné prechádzky so psami v starostlivosti združenia.",
    organization: "OZ Priateľ", dogName: "", city: "Nitra", region: "Nitriansky kraj", locationNote: "Okres: Nitra",
    actionLabel: "Chcem pomôcť",
    contactNote: "E-mail: ahoj@priatel.sk\nTelefón: +421 900 123 456",
    actionUrl: "https://priatel.sk/pomoc", ...overrides,
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

test("new valid help case is NEW and safe", () => {
  const preview = classify([input()]);
  assert.equal(preview.total, 1);
  assert.equal(preview.NEW, 1);
  assert.equal(preview.SAFE_FOR_IMPORT, 1);
  assert.equal(preview.rows[0].safeForImport, true);
});

test("same (category, slug) reads a match and never writes; identical record is EXISTING_SAME", async () => {
  const sql = [];
  const db = { prepare(query) { sql.push(query); return { async all() { return { success: true, results: [production({ category: "dobrovolnictvo" })] }; } }; } };
  const preview = await previewHelpItems(db, [input({ category: "dobrovolnictvo", actionLabel: "Chcem pomôcť" })], categories, regions);
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
  assert.equal(preview.rows[0].matchedProductionTitle, "Venčenie v OZ Priateľ");
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
  const rows = Array.from({ length: 151 }, (_, index) => production({ id: index + 1, category: "dobrovolnictvo", slug: `historicky-${index}`, title: `Historická výzva ${index}`, organization: `Iné OZ ${index}`, city: "Košice", action_url: null, contact_note: "" }));
  rows[150] = production({ id: 151, category: "dobrovolnictvo", status: "draft" });
  const db = { prepare(sql) { assert.match(sql, /^SELECT\b/); assert.doesNotMatch(sql, /\bLIMIT\b/i); return { async all() { return { success: true, results: rows }; } }; } };
  const preview = await previewHelpItems(db, [input({ category: "dobrovolnictvo", actionLabel: "Chcem pomôcť" })], categories, regions);
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
  const items = Array.from({ length: 106 }, (_, index) => input({ category: "dobrovolnictvo", title: `Výzva ${index}`, slug: `vyzva-${index}`, organization: `OZ ${index}`, city: `Mesto ${index}`, actionLabel: "Chcem pomôcť", actionUrl: `https://vyzva-${index}.sk`, contactNote: "" }));
  const preview = await previewHelpItems(db, items, categories, regions);
  assert.equal(selects, 1);
  assert.equal(preview.total, 106);
  assert.equal(preview.NEW, 106);
  assert.equal(preview.SAFE_FOR_IMPORT, 106);
});

test("runtime preview excludes legacy shelter rows and blocks utulky as a legacy help import category", async () => {
  let query = "";
  const db = { prepare(sql) { query = sql; return { async all() { return { success: true, results: [] }; } }; } };
  const preview = await previewHelpItems(db, [input({ category: "utulky", slug: "legacy-utulok", title: "Legacy útulok", actionLabel: "Pomôcť organizácii" })], categories, regions);
  assert.ok(query.includes("FROM help_cases WHERE category <> 'utulky'"));
  assert.equal(preview.BLOCKED, 1);
  assert.match(preview.rows[0].reason, /neplatná category/);
});

test("an incomplete or failed production SELECT aborts preview instead of marking items NEW", async () => {
  await assert.rejects(previewHelpItems({ prepare() { return { async all() { return { success: false, results: [] }; } }; } }, [input()], categories, regions), /úplný zoznam/);
  await assert.rejects(previewHelpItems({ prepare() { return { async all() { throw new Error("D1 unavailable"); } }; } }, [input()], categories, regions), /D1 unavailable/);
});


test("duplicate input keys block both rows and invalid payload stays BLOCKED", () => {
  const preview = classify([input(), input(), { ...input(), slug: "chybny", region: "Trnavský kraj / Nitriansky kraj" }]);
  assert.equal(preview.BLOCKED, 3);
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
  const volunteer = production({ category: "dobrovolnictvo", slug: "vencenie-trnava", title: "Venčenie v Trnave", organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj" });
  const adoption = input({ category: "adopcia", slug: "rex-hlada-domov", title: "Rex hľadá domov", dogName: "Rex", organization: "Útulok Trnava", city: "Trnava", region: "Trnavský kraj", actionLabel: "Mám záujem o adopciu" });
  const preview = classify([adoption], [volunteer]);
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
