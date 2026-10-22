import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { combinedFciMeasurement, publicBreedMeasurement } from "../lib/breed-fci.ts";
import test from "node:test";

const page = readFileSync("app/plemena/page.tsx", "utf8");
const browser = readFileSync("components/breed-browser.tsx", "utf8");
const crawlIndex = readFileSync("components/breed-crawl-index.tsx", "utf8");

test("clean breed landing exposes every canonical breed through ordinary server-rendered links", () => {
  assert.match(page, /policy\.kind === "clean" && <BreedCrawlIndex breeds=\{breeds\} groups=\{fciGroups\} \/>/);
  assert.match(crawlIndex, /import Link from "next\/link"/);
  assert.match(crawlIndex, /for \(const breed of breeds\)/);
  assert.match(crawlIndex, /<Link href=\{\`\/plemena\/\$\{breed\.slug\}\`\}>\{breed\.name\}<\/Link>/);
  assert.doesNotMatch(crawlIndex, /\.slice\(/);
  assert.doesNotMatch(crawlIndex, /onClick=/);
});

test("breed crawl hierarchy does not create indexable pagination or filter variants", () => {
  assert.match(page, /buildListingPageMetadata\(\{/);
  assert.match(page, /path: "\/plemena"/);
  assert.doesNotMatch(page, /indexPagination:\s*true/);
  assert.match(page, /const policy = resolveListingIndexPolicy\("\/plemena", rawSearchParams\)/);
});

test("interactive breed browser keeps the existing 60-card load-more UX", () => {
  assert.match(browser, /useState\(60\)/);
  assert.match(browser, /visible\.slice\(0,shown\)/);
  assert.match(browser, /Zobraziť ďalšie plemená/);
  assert.match(browser, /setShown\(\(value\)=>value\+60\)/);
});


test("atlas projection avoids full FCI and SEO blobs while retaining canonical index and search fields", () => {
  const store = readFileSync("lib/breed-store.ts", "utf8");
  const start = store.indexOf("export async function listPublishedCanonicalBreedAtlasCards");
  const end = store.indexOf("export type BreedSitemapIndexItem", start);
  assert.ok(start >= 0 && end > start);
  const part = store.slice(start, end);
  assert.match(part, /canonicalBreedIdsSql/);
  assert.match(part, /ORDER BY fci_group,name/);
  // Public HTML must not wait for R2 HEAD/list subrequests per card.
  assert.match(part, /image:ownedBreedImage\(row\.image_url\)/);
  assert.doesNotMatch(part, /withAvailableBreedImages|availableBreedImage|BUCKET\.(?:head|list)/);
  assert.doesNotMatch(part, /SELECT \*|SELECT.*fci_standard_json|SELECT.*seo_json/);
  assert.match(part, /json_extract\(fci_standard_json, '\$\.vyska_pes_cm'\)/);
  assert.match(part, /json_extract\(fci_standard_json, '\$\.hmotnost_suka_kg'\)/);
  assert.match(page, /listPublishedCanonicalBreedAtlasCards\(\)/);
  assert.match(browser, /BreedAtlasCard\[\]/);
  assert.match(crawlIndex, /BreedAtlasCard\[\]/);
  assert.match(store, /export type BreedAtlasCard = Pick<ManagedBreedIndexItem/);
});

test("atlas SQL scalar FCI projections preserve measurement fallbacks, reject malformed JSON", () => {
  const store = readFileSync("lib/breed-store.ts", "utf8");
  const start = store.indexOf("export async function listPublishedCanonicalBreedAtlasCards");
  const part = store.slice(start, store.indexOf("export type BreedSitemapIndexItem", start));
  const raw = part.split("const result=await database.prepare(")[1]?.split(").all<BreedAtlasCardRow>()")[0];
  assert.ok(raw, "dedicated SQL projection exists");
  const sql = raw.slice(1, -1).replace("$" + "{canonicalBreedIdsSql}", "SELECT id FROM managed_breeds WHERE status = 'published'");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_breeds (" +
      "id INTEGER, slug TEXT, name TEXT, image_url TEXT, fci_group INTEGER, fci_section TEXT," +
      "fci_section_number TEXT, origin TEXT, group_name TEXT, official_fci_name TEXT," +
      "accent TEXT, height TEXT, weight TEXT, intro TEXT, energy INTEGER, trainability INTEGER," +
      "family INTEGER, search_text TEXT, editorial_complete INTEGER, fci_standard_json TEXT, status TEXT)");
    const insert = db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const basics = (id, height, weight, standard, status="published") => [
      id, "breed-"+id, "Breed "+id, "", 8, "Retrievers", "1",
      "Slovensko", "Retrievery", "OFFICIAL", "forest", height, weight, "Opis",
      3, 4, 5, "search", 1, standard, status,
    ];
    insert.run(...basics(1, "", "", JSON.stringify({
      vyska_pes_cm:"48–51", vyska_suka_cm:"45–48", hmotnost_pes_kg:"20–23", hmotnost_suka_kg:"17–20",
    })));
    insert.run(...basics(2, "52–62 cm", "25–30 kg", "invalid-json"));
    insert.run(...basics(3, "", "", "{}", "draft"));
    const rows = db.prepare(sql).all();
    assert.equal(rows.length, 2);
    const item = rows.find(row => row.slug === "breed-1");
    assert.equal(publicBreedMeasurement(item.height,"height",
      combinedFciMeasurement([item.standard_dog_height??undefined,item.standard_bitch_height??undefined],"cm")),"45–51 cm");
    assert.equal(publicBreedMeasurement(item.weight,"weight",
      combinedFciMeasurement([item.standard_dog_weight??undefined,item.standard_bitch_weight??undefined],"kg")),"17–23 kg");
    const corrupt = rows.find(row => row.slug === "breed-2");
    assert.equal(corrupt.standard_dog_height,null);
    assert.equal(publicBreedMeasurement(corrupt.height,"height",
      combinedFciMeasurement([corrupt.standard_dog_height??undefined,corrupt.standard_bitch_height??undefined],"cm")),"52–62 cm");
    assert.equal(publicBreedMeasurement(corrupt.weight,"weight",
      combinedFciMeasurement([corrupt.standard_dog_weight??undefined,corrupt.standard_bitch_weight??undefined],"kg")),"25–30 kg");
  } finally { db.close(); }
});
