import assert from "node:assert/strict";
import test from "node:test";
import {
  BREED_COMPACT_VISIBLE,BREED_COMPACT_HIDDEN,BREED_COMPACT_MERGE,
  BREED_COMPACT_OPERATIONAL,BREED_COMPACT_RETIRE_AFTER_AUDIT,
  BREED_COMPACT_HEADINGS,
  planBreedCompactMigration,assertBreedCompactContract
} from "../lib/breed-notion-compact-consolidation.mjs";

test("every one of 109 original Notion properties has an explicit disposition",()=>{
  assert.doesNotThrow(assertBreedCompactContract);
  const all=[...BREED_COMPACT_VISIBLE,...BREED_COMPACT_HIDDEN];
  assert.equal(all.length,109);
  assert.equal(new Set(all).size,109);
  assert.equal(BREED_COMPACT_VISIBLE.length,60);
  assert.deepEqual(
    new Set(Object.keys(BREED_COMPACT_MERGE).concat(
      BREED_COMPACT_OPERATIONAL,BREED_COMPACT_RETIRE_AFTER_AUDIT)),
    new Set(BREED_COMPACT_HIDDEN)
  );
});
test("FCI and practical texts are never overwritten, even if destination is filled",()=>{
  const source={
    "FCI telo":"Pevný chrbát.",
    "FCI chvost":"Chvost strednej dĺžky.",
    "FCI krk":"Svalnatý krk.",
    "Potreby":"Potrebný je denný kontakt so psovodom.",
    "Redakcia prehľad":"Pôvodný prehľad odborného profilu.",
    "Skupina":"Spoločenský pes.",
  };
  const plan=planBreedCompactMigration(source);
  assert.equal(plan.ready,true);
  assert.match(plan.changes["FCI telo"],/Pevný chrbát/);
  assert.match(plan.changes["FCI telo"],/Chvost strednej dĺžky/);
  assert.match(plan.changes["FCI telo"],/Svalnatý krk/);
  assert.match(plan.changes["Redakcia prehľad"],/Pôvodný prehľad odborného profilu/);
  assert.match(plan.changes["Redakcia prehľad"],/Potrebný je denný kontakt/);
  assert.match(plan.changes["Redakcia prehľad"],/Spoločenský pes/);
});
test("repeat of the exact migration is idempotent for multi-source targets",()=>{
  const source={
    "FCI telo":"Telo.",
    "FCI chvost":"Chvost.",
    "FCI krk":"Krk.",
  };
  const first=planBreedCompactMigration(source);
  const second=planBreedCompactMigration({...source,...first.changes});
  assert.equal(second.ready,true);
  assert.deepEqual(second.changes,{});
  assert.equal(second.statuses.find(v=>v.source==="FCI chvost").status,"ALREADY_PRESENT");
});
test("merges use clear editorial/FCI labels rather than internal debug markers",()=>{
  const plan=planBreedCompactMigration({
    "FCI lebka":"Silná lebka.",
    "FCI oči":"Tmavé oči.",
    "FCI tvár":"Krátka tvár.",
    "FCI uši":"Vzpriamené uši.",
    "Potreby":"Pravidelný denný režim."
  });
  assert.equal(plan.ready,true);
  assert.match(plan.changes["FCI lebka"],/Oči podľa FCI: Tmavé oči\./);
  assert.match(plan.changes["FCI lebka"],/Tvárová časť podľa FCI: Krátka tvár\./);
  assert.match(plan.changes["FCI lebka"],/Uši podľa FCI: Vzpriamené uši\./);
  assert.match(plan.changes["Redakcia prehľad"],/Každodenné potreby: Pravidelný denný režim\./);
  assert.doesNotMatch(JSON.stringify(plan.changes),/Pôvodné pole|⟦|⟧/);
  assert.equal(new Set(Object.values(BREED_COMPACT_HEADINGS)).size,23);
});
test("a partially migrated breed resumes without duplicating FCI eye and ear sections",()=>{
  const original={
    "FCI lebka":"Silná lebka. — Oči podľa FCI: Tmavé oči. — Tvárová časť podľa FCI: Krátka tvár.",
    "FCI oči":"Tmavé oči.",
    "FCI tvár":"Krátka tvár.",
    "FCI uši":"Vzpriamené uši."
  };
  const plan=planBreedCompactMigration(original);
  assert.equal(plan.ready,true);
  assert.equal(plan.statuses.find(s=>s.source==="FCI oči").status,"ALREADY_PRESENT");
  assert.equal(plan.statuses.find(s=>s.source==="FCI tvár").status,"ALREADY_PRESENT");
  assert.equal(plan.changes["FCI lebka"],original["FCI lebka"]+" — Uši podľa FCI: Vzpriamené uši.");
  assert.doesNotMatch(plan.changes["FCI lebka"],/<br\s*\/?\s*>/i);
});
test("changed source after migration blocks deletion instead of hiding new text",()=>{
  const original=planBreedCompactMigration({"FCI chvost":"Pôvodný chvost."});
  const changed=planBreedCompactMigration({...original.changes,"FCI chvost":"Zmenený odborný opis chvosta."});
  assert.equal(changed.ready,false);
  assert.ok(changed.blocked.some(v=>v.source==="FCI chvost"));
});
test("technical IDs, publishing, sync and canonical relations are never merged into public text",()=>{
  const plan=planBreedCompactMigration({
    "Psipedia ID":"3214",
    "Import kľúč":"fci-122",
    "Stav":"Publikované",
    "Poznámky":"Len interné.",
    "Súvisiace profily služieb ID":"31; 32",
  });
  assert.deepEqual(plan.changes,{});
  for(const key of ["Psipedia ID","Import kľúč","Stav","Poznámky",
    "Súvisiace profily služieb ID"]) {
    assert.equal(plan.statuses.find(v=>v.source===key).status,"KEEP_OPERATIONAL");
  }
});
test("obsolete nonempty fields require verified archival before deletion",()=>{
  const plan=planBreedCompactMigration({
    "Profil skvalitnený":"__YES__",
    "Redakčné sekcie JSON":"{ \"overview\": \"Odborný text\" }"
  });
  assert.equal(plan.statuses.find(v=>v.source==="Profil skvalitnený").status,"REQUIRES_ARCHIVE");
  assert.equal(plan.statuses.find(v=>v.source==="Redakčné sekcie JSON").status,"REQUIRES_ARCHIVE");
});
