import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { breedWorkcopyAtomicActivationSql as SQL } from "../lib/notion-breed-workcopy-activation-sql.mjs";

const OLD="2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const NEW="f460b1e5-4454-4a10-9200-3b35106f9e32";
const receipt="breed-field-v1:valid-synthetic-test-baseline";

function seed(n=344) {
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,slug TEXT,fci_number INTEGER);
    CREATE TABLE breed_notion_sync(breed_id INTEGER PRIMARY KEY,notion_page_id TEXT,content_hash TEXT);
    CREATE TABLE breed_notion_workcopy_links(
      breed_id INTEGER PRIMARY KEY,original_notion_page_id TEXT,work_notion_page_id TEXT,
      original_data_source_id TEXT,work_data_source_id TEXT,canonical_slug TEXT,
      fci_number INTEGER,original_sync_receipt TEXT,work_sync_receipt TEXT,
      status TEXT,verified_at TEXT,activated_at TEXT,updated_at TEXT
    );
  `);
  const b=db.prepare("INSERT INTO managed_breeds(id,slug,fci_number) VALUES(?,?,?)");
  const source=db.prepare("INSERT INTO breed_notion_sync(breed_id,notion_page_id,content_hash) VALUES(?,?,?)");
  const work=db.prepare("INSERT INTO breed_notion_workcopy_links(breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,work_sync_receipt,status) VALUES(?,?,?,?,?,?,?,?,?,?)");
  for(let i=1;i<=n;i++){
    b.run(i,"breed-"+i,i);
    source.run(i,"old-"+i,receipt);
    work.run(i,"old-"+i,"work-"+i,OLD,NEW,"breed-"+i,i,receipt,receipt,"SHADOW");
  }
  return db;
}
const counts=db=>db.prepare("SELECT status,COUNT(*) n FROM breed_notion_workcopy_links GROUP BY status ORDER BY status").all().map(row=>({status:row.status,n:Number(row.n)}));

test("correct complete 344-row cohort activates in a single SQL statement",()=>{
  const db=seed();
  try{
    const result=db.prepare(SQL).run(OLD,NEW);
    assert.equal(Number(result.changes),344);
    assert.deepEqual(counts(db),[{status:"ACTIVE",n:344}]);
    assert.equal(Number(db.prepare(SQL).run(OLD,NEW).changes),0);
  }finally{db.close();}
});
test("one stale receipt or wrong canonical slug causes zero partial activation",()=>{
  for(const query of [
    "UPDATE breed_notion_workcopy_links SET work_sync_receipt='stale' WHERE breed_id=5",
    "UPDATE breed_notion_workcopy_links SET canonical_slug='wrong' WHERE breed_id=4",
    "UPDATE breed_notion_sync SET notion_page_id='changed-old-link' WHERE breed_id=8",
  ]){
    const db=seed();
    try{
      db.exec(query);
      assert.equal(Number(db.prepare(SQL).run(OLD,NEW).changes),0);
      assert.deepEqual(counts(db),[{status:"SHADOW",n:344}]);
    }finally{db.close();}
  }
});
test("a 343-row or 345-row cohort never activates even if 344 otherwise match",()=>{
  const missing=seed(343);
  try{
    assert.equal(Number(missing.prepare(SQL).run(OLD,NEW).changes),0);
    assert.deepEqual(counts(missing),[{status:"SHADOW",n:343}]);
  }finally{missing.close();}
  const extra=seed(345);
  try{
    assert.equal(Number(extra.prepare(SQL).run(OLD,NEW).changes),0);
    assert.deepEqual(counts(extra),[{status:"SHADOW",n:345}]);
  }finally{extra.close();}
});

test("atomic guard allows a separately initialized new workcopy receipt", () => {
  const db = seed();
  try {
    db.exec("UPDATE breed_notion_workcopy_links SET work_sync_receipt='breed-field-v1:new-baseline' WHERE breed_id=2");
    assert.equal(Number(db.prepare(SQL).run(OLD, NEW).changes), 344);
    assert.deepEqual(counts(db), [{ status: "ACTIVE", n: 344 }]);
  } finally { db.close(); }
});

test("atomic SQL safely preserves 50 legacy original hashes while using new receipts", () => {
  const db = seed();
  try {
    const source = db.prepare("UPDATE breed_notion_sync SET content_hash=? WHERE breed_id=?");
    const shadow = db.prepare(
      "UPDATE breed_notion_workcopy_links SET original_sync_receipt=? WHERE breed_id=?");
    for (let n = 1; n <= 50; n++) {
      const legacy = "legacy-sha-" + n;
      source.run(legacy, n);
      shadow.run(legacy, n);
    }
    assert.equal(Number(db.prepare(SQL).run(OLD, NEW).changes), 344);
    assert.deepEqual(counts(db), [{ status: "ACTIVE", n: 344 }]);
    assert.equal(db.prepare("SELECT content_hash FROM breed_notion_sync WHERE breed_id=10")
      .get().content_hash, "legacy-sha-10");
  } finally { db.close(); }
});
