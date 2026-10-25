import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = readFileSync(new URL("../lib/breed-store.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function listManagedBreedSummaries");
const end = source.indexOf("export async function listPublishedBreedIndex", start);
const fn = source.slice(start, end);
const found = fn.match(new RegExp("database\\.prepare\\(\\x60([\\s\\S]*?)\\x60\\)"));
if (!found) throw Error("Admin breed summary statement is missing.");

test("breed list queries only scalar overview and FCI references, not full JSON bodies", () => {
  assert.doesNotMatch(found[1], /(?:,\s*|\bSELECT\s+)editorial_json\b/);
  assert.doesNotMatch(found[1], /(?:,\s*|\bSELECT\s+)fci_standard_json\b/);
  assert.match(found[1], /AS editorial_overview/);
  assert.match(found[1], /AS fci_standard_pdf/);
  assert.match(found[1], /AS fci_nomenklatura_url/);
  assert.match(found[1], /sports_json/);
  assert.match(found[1], /article_relation_count/);
  assert.match(found[1], /directory_relation_count/);
  assert.match(fn, /ORDER BY fci_group,name LIMIT \?/);
  assert.match(fn, /result\.results\.map\(fromSummaryRow\)/);
});

test("projection agrees with the original JSON parsing for complete, sparse and corrupt breeds", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, status TEXT, image_url TEXT, fci_number INTEGER, fci_group INTEGER, fci_section TEXT, fci_section_number TEXT, origin TEXT, group_name TEXT, official_fci_name TEXT, accent TEXT, updated_at TEXT, editorial_json TEXT, sports_json TEXT, fci_standard_json TEXT, needs TEXT, exercise TEXT, training TEXT, health TEXT)");
    db.exec("CREATE TABLE breed_article_relations(breed_id INTEGER)");
    db.exec("CREATE TABLE breed_directory_relations(breed_id INTEGER)");
    const add = db.prepare("INSERT INTO managed_breeds VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const samples = [
      [1,"breed-1","Complete","published","/media/a.png",347,1,"","","Švajčiarsko","FCI","FCI Name","gold","2026-10-25",
       JSON.stringify({overview:"Overený text",coatCare:"x".repeat(11000)}),
       JSON.stringify([{key:"agility",label:"Agility",rating:5}]),
       JSON.stringify({fci_standard_pdf:"https://example.test/fci.pdf",otherSection:"x".repeat(17000)}),
       "Pohyb","","",""],
      [2,"breed-2","Draft","draft","",null,2,"","","","FCI","Name","blue","2026-10-24",
       "broken JSON","[]","{malformed", "", "", "", ""],
      [3,"breed-3","Sparse","draft","",15,3,"","","","FCI","Name","gray","2026-10-22",
       JSON.stringify({overview:"  ", coatCare:"x".repeat(3300)}),
       JSON.stringify([{key:"running",label:"Beh",rating:2}]),
       JSON.stringify({fci_nomenklatura_url:"https://example.test/list",otherField:"x".repeat(3300)}),
       "", "", "", ""],
    ];
    for (const row of samples) add.run(...row);
    db.prepare("INSERT INTO breed_article_relations(breed_id) VALUES (?)").run(1);
    db.prepare("INSERT INTO breed_directory_relations(breed_id) VALUES (?)").run(1);

    const projection = db.prepare(found[1]).all(500);
    assert.deepEqual(projection.map(row => [row.id,row.article_relation_count,row.directory_relation_count]), [[1,1,1],[2,0,0],[3,0,0]]);
    for (let i=0;i<samples.length;i++) {
      const row = projection[i];
      const original = samples[i];
      const parse = value => {try {const o=JSON.parse(value);return o && typeof o==="object" && !Array.isArray(o) ? o : {}; }catch{return {}; }};
      const editorial = parse(original[14]);
      const fci = parse(original[16]);
      assert.equal(row.editorial_overview,editorial.overview??"");
      assert.equal(row.fci_standard_pdf,fci.fci_standard_pdf??"");
      assert.equal(row.fci_nomenklatura_url,fci.fci_nomenklatura_url??"");
    }
    assert.equal(projection.some(row => String(row.editorial_overview).includes("x".repeat(1000))),false);
  } finally {db.close();}
});
