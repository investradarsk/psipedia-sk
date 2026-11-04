import test from "node:test";
import assert from "node:assert/strict";
import {
  BREED_COAT_MAX_LENGTH,
  BREED_LIST_ITEM_MAX_LENGTH,
  cleanBreedCoatDescription,
  cleanBreedEditorialList,
} from "../lib/breed-long-description.ts";

test("long Notion coat description survives without 200-character clipping",()=>{
  const full="Hrubá krycia srsť a hustá podsada. ".repeat(18);
  assert.ok(full.length>400);
  assert.equal(cleanBreedCoatDescription(full),full.trim());
  assert.equal(cleanBreedCoatDescription(full).length,full.length);
});

test("health-risk and consideration paragraphs survive full length beyond 240 characters",()=>{
  const first="Zdokumentované genetické riziko vyžaduje odborné potvrdenie. ".repeat(8).trim();
  const second="Pri chove zohľadnite výsledky rodičov a aktuálne poznatky. ".repeat(8).trim();
  assert.ok(first.length>240);
  assert.ok(second.length>240);
  const result=cleanBreedEditorialList([first,second]);
  assert.deepEqual(result,[first,second]);
});

test("do not quietly publish incomplete specialist content beyond explicit limits",()=>{
  assert.throws(()=>cleanBreedCoatDescription("x".repeat(BREED_COAT_MAX_LENGTH+1)),/Srsť presahuje limit/);
  assert.throws(()=>cleanBreedEditorialList(["a".repeat(BREED_LIST_ITEM_MAX_LENGTH+1)]),/Odborná položka presahuje limit/);
  assert.throws(()=>cleanBreedEditorialList(Array.from({length:31},()=>"text")) ,/viac než 30 položiek/);
  assert.deepEqual(cleanBreedEditorialList(null),[]);
  assert.deepEqual(cleanBreedEditorialList([" A  ","",null," B"]),["A","B"]);
});
