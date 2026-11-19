import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  planBreedPublicSqlTransfer, breedPublicSqlStatements,
} from "../lib/breed-public-sql-transfer.mjs";
import {
  BREED_PUBLIC_COLUMN_MAP, BREED_PUBLIC_CONTROLLED_COLUMN_MAP,
} from "../lib/breed-public-sql-contract.mjs";

const migration = readFileSync(new URL("../drizzle/0173_breed_public_relational_sql.sql",import.meta.url),"utf8");

test("new breed tables are entirely relational with no persistent JSON columns",()=>{
  assert.doesNotMatch(migration,/\b[a-z_]+_json\b/i);
  for (const col of Object.values(BREED_PUBLIC_COLUMN_MAP))
    assert.match(migration, new RegExp('"'+col+'"'));
  for (const col of Object.values(BREED_PUBLIC_CONTROLLED_COLUMN_MAP))
    assert.match(migration, new RegExp('"'+col+'"'));
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, name TEXT, intro TEXT, image_url TEXT, image_key TEXT, updated_at TEXT);");
    db.exec(migration);
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'breed_public_%'").all();
    assert.equal(tables.length,6);
    for (const table of tables) {
      const columns=db.prepare("SELECT name FROM pragma_table_info(?)").all(table.name);
      assert.equal(columns.some(x=>x.name.endsWith("_json")),false,table.name);
    }
  } finally { db.close(); }
});

test("public-only Notion import inserts SQL columns and normalized public lists",()=>{
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY, name TEXT, intro TEXT, image_url TEXT, image_key TEXT, updated_at TEXT);");
    db.exec("INSERT INTO managed_breeds(id,name,intro,image_url,updated_at) VALUES (19,'','','','');");
    db.exec(migration);
    const plan=planBreedPublicSqlTransfer({breedId:19,
      fields:[
        {field:"name",value:"Írsky vlkodav"},
        {field:"intro",value:"Múdra a nežná povaha"},
        {field:"editorial.overview",value:"O'Brienov úvod"},
        {field:"fciStandard.oci",value:"Tmavé oči"},
        {field:"seo.title",value:"Írsky vlkodav | Psipedia"},
        {field:"seo.noindex",value:true},
        {field:"healthRisks",value:["Srdce","Kĺby"]},
        {field:"goodFor",value:["Rodiny"]},
        {field:"gallery",value:[{imageUrl:"/images/irish.webp",alt:"Vlkodav"}]},
        {field:"sports",value:[{key:"nosework",label:"Nosework",rating:4}]},
        {field:"sources",value:[{label:"FCI",url:"https://www.fci.be/"}]},
        {field:"legacyUnusedField",value:"DO NOT TRANSFER"},
      ],
      controlled:{fciGroupSelect:"10",heightMinCm:70,heightMaxCm:89,
        originCountries:["Írsko"],coatTypes:["Drsná"],useTypes:["Spoločenský"]},
    });
    db.exec(breedPublicSqlStatements(plan).join("\n"));
    const record=db.prepare("SELECT editorial_overview,fci_oci,seo_title,seo_noindex,controlled_height_min_cm FROM breed_public_profile WHERE breed_id=19").get();
    assert.equal(record.editorial_overview,"O'Brienov úvod");
    assert.equal(record.fci_oci,"Tmavé oči");
    assert.equal(record.seo_noindex,1);
    assert.equal(record.controlled_height_min_cm,70);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM breed_public_list_items WHERE breed_id=19").get().n,6);
    assert.equal(db.prepare("SELECT label FROM breed_public_sources WHERE breed_id=19").get().label,"FCI");
    assert.equal(db.prepare("SELECT rating FROM breed_public_sports WHERE breed_id=19").get().rating,4);
    assert.equal(db.prepare("SELECT name FROM managed_breeds WHERE id=19").get().name,"Írsky vlkodav");
    // Idempotent reruns are possible after interrupted 344-profile batches.
    db.exec(breedPublicSqlStatements(plan).join("\n"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM breed_public_gallery").get().n,1);
  } finally { db.close(); }
});

test("missing Notion fields stay empty; invalid IDs and SQL inputs are rejected",()=>{
  const plan=planBreedPublicSqlTransfer({breedId:33,fields:[],controlled:{}});
  assert.deepEqual(plan.profile,{breed_id:33});
  assert.deepEqual(plan.lists.healthRisks,[]);
  assert.deepEqual(plan.collections.gallery,[]);
  assert.throws(()=>planBreedPublicSqlTransfer({breedId:0,fields:[]}),/INVALID_ID/);
  assert.throws(()=>planBreedPublicSqlTransfer({breedId:1,fields:[
    {field:"name",value:"X"},{field:"name",value:"Y"},
  ]}),/DUPLICATE/);
});
