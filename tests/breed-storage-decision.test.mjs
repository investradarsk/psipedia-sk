import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  BREED_STORAGE_VERSION,
  BREED_CANONICAL_DATABASE,
  BREED_NOTION_FIELD_DESTINATIONS,
  BREED_JSON_COLUMN_DECISIONS,
  BREED_ADDITIONAL_CANONICAL_SQL_FIELDS,
  BREED_CANONICAL_JSON_FIELDS,
  BREED_RELATIONAL_FIELDS,
  BREED_SYNC_CUTOVER_POLICY,
} from "../lib/breed-storage-decision.mjs";
import {
  BREED_WORKCOPY_PHYSICAL_PROPERTIES,
  BREED_WORKCOPY_HISTORICAL_PROPERTIES,
  BREED_WORKCOPY_TECHNICAL_PROPERTIES,
} from "../lib/breed-notion-workcopy-field-contract.mjs";
import {BREED_CONTROLLED_FIELDS} from "../lib/breed-workcopy-controlled.mjs";

const field=name=>BREED_NOTION_FIELD_DESTINATIONS[name];
const dest=name=>field(name)?.table+"."+field(name)?.column;
const path=(name)=>new URL("../"+name,import.meta.url);

test("every physical Notion property has exactly one specified v2 destination",()=>{
  assert.equal(BREED_STORAGE_VERSION,2);
  assert.equal(BREED_CANONICAL_DATABASE,"Cloudflare D1");
  assert.equal(BREED_WORKCOPY_PHYSICAL_PROPERTIES.length,90);
  assert.deepEqual(Object.keys(BREED_NOTION_FIELD_DESTINATIONS).sort(),
    [...BREED_WORKCOPY_PHYSICAL_PROPERTIES].sort());
  const unique=new Set();
  const kinds={sql:0,json:0,"notion-only":0};
  for(const [name,v] of Object.entries(BREED_NOTION_FIELD_DESTINATIONS)){
    assert.ok(Object.hasOwn(kinds,v.kind),name);
    kinds[v.kind]++;
    if(v.kind==="notion-only") {
      assert.equal(v.table,null,name);
      assert.equal(v.column,null,name);
    } else {
      assert.match(v.table,/^[a-z_]+$/,name);
      assert.match(v.column,/^[a-z_]+$/,name);
      const id=v.table+"."+v.column;
      assert.equal(unique.has(id),false,"duplicate canonical target: "+name+" "+id);
      unique.add(id);
    }
  }
  assert.deepEqual(kinds,{sql:73,json:9,"notion-only":8});
  for(const name of BREED_WORKCOPY_HISTORICAL_PROPERTIES)
    assert.equal(field(name).kind,"notion-only",name);
  assert.equal(field("Zdrojový profil Notion").kind,"notion-only");
  assert.equal(dest("Psipedia ID"),"managed_breeds.id");
  assert.equal(dest("URL profil / slug"),"managed_breeds.slug");
  assert.equal(BREED_WORKCOPY_TECHNICAL_PROPERTIES.length,3);
});

test("12 controlled values have one canonical target, never a second values_json",()=>{
  const targets={
    fciGroupSelect:"managed_breeds.fci_group",
    fciSectionSelect:"managed_breeds.fci_section_number",
    originCountries:"breed_public_facts.origin_countries_json",
    sizeSelect:"managed_breeds.size",
    coatTypes:"breed_public_facts.coat_types_json",
    useTypes:"breed_public_facts.use_types_json",
    heightMinCm:"breed_public_facts.height_min_cm",
    heightMaxCm:"breed_public_facts.height_max_cm",
    weightMinKg:"breed_public_facts.weight_min_kg",
    weightMaxKg:"breed_public_facts.weight_max_kg",
    lifespanMinYears:"breed_public_facts.lifespan_min_years",
    lifespanMaxYears:"breed_public_facts.lifespan_max_years",
  };
  assert.equal(BREED_CONTROLLED_FIELDS.length,12);
  for(const item of BREED_CONTROLLED_FIELDS)
    assert.equal(dest(item.notion),targets[item.key],item.key);
  for(const item of Object.values(BREED_NOTION_FIELD_DESTINATIONS))
    assert.notEqual(item.table,"breed_notion_controlled_values",
      "controlled values_json must not become second canonical store");
});

test("all 33 current FCI text, URL, PDF fields stay individually writable as SQL",()=>{
  const source=readFileSync(path("lib/breed-fci.ts"),"utf8");
  const start=source.indexOf("export const FCI_STANDARD_TEXT_KEYS");
  const end=source.indexOf("] as const;",start);
  assert.ok(start>=0&&end>start);
  const keys=[...source.slice(start,end).matchAll(/"([^"]+)"/g)].map(m=>m[1]);
  assert.equal(keys.length,31);
  const cols=[...BREED_ADDITIONAL_CANONICAL_SQL_FIELDS.breed_fci_standard];
  assert.deepEqual(cols.sort(),
    [...keys,"fci_nomenklatura_url","fci_standard_pdf"].map(k=>"fci_"+k).sort());
  for(const [name,v] of Object.entries(BREED_NOTION_FIELD_DESTINATIONS)){
    if(name.startsWith("FCI ") && !["FCI skupina","FCI sekcia","FCI číslo"].includes(name)){
      assert.equal(v.kind,"sql",name);
      assert.equal(v.table,"breed_fci_standard",name);
    }
  }
});

test("existing breed JSON columns are categorized once, without premature deletion",()=>{
  const schema=readFileSync(path("db/schema.ts"),"utf8");
  const start=schema.indexOf("export const managedBreeds =");
  const end=schema.indexOf("export const breedArticleRelations =",start);
  assert.ok(start>=0&&end>start);
  const original=[...schema.slice(start,end).matchAll(
    /(?:text|integer)\("([a-z0-9_]+_json)"\)/g)].map(m=>m[1]);
  assert.equal(original.length,10);
  assert.deepEqual(original.sort(),Object.keys(BREED_JSON_COLUMN_DECISIONS).sort());
  const actions=Object.values(BREED_JSON_COLUMN_DECISIONS).reduce(
    (m,d)=>(m[d.action]=(m[d.action]??0)+1,m),{});
  assert.deepEqual(actions,{
    "retain-json":6,
    "move-to-sql":3,
    "move-to-relations":1,
  });
  assert.equal(BREED_JSON_COLUMN_DECISIONS.gallery_json.action,"retain-json");
  assert.equal(BREED_JSON_COLUMN_DECISIONS.related_breeds_json.action,"move-to-relations");
  assert.equal(BREED_JSON_COLUMN_DECISIONS.seo_json.action,"move-to-sql");
  assert.ok(BREED_ADDITIONAL_CANONICAL_SQL_FIELDS.managed_breeds.includes("seo_noindex"));
  assert.ok(BREED_ADDITIONAL_CANONICAL_SQL_FIELDS.managed_breeds.includes("seo_canonical_url"));
  assert.ok(BREED_CANONICAL_JSON_FIELDS.managed_breeds.includes("sources_json"));
});

test("relations and field level sync policy prevent accidental duplicate masters",()=>{
  assert.equal(BREED_RELATIONAL_FIELDS.relatedArticleIds.existing,true);
  assert.equal(BREED_RELATIONAL_FIELDS.directoryProfileIds.existing,true);
  assert.equal(BREED_RELATIONAL_FIELDS.relatedBreedIds.table,"breed_related_breeds");
  assert.match(BREED_SYNC_CUTOVER_POLICY.conflicts,/per-field/);
  assert.match(BREED_SYNC_CUTOVER_POLICY.missingNotionField,/unchanged/);
  assert.match(BREED_SYNC_CUTOVER_POLICY.preserve347,/3 D1 rows/);
  const steps=BREED_SYNC_CUTOVER_POLICY.deployOrder;
  assert.ok(steps.indexOf("additive SQL schema")<steps.indexOf("drop duplicated legacy columns and fallbacks"));
});
