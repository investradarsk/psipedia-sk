import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {summarizeServiceChoiceSync} from "../lib/service-catalog-sync-feedback.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("verified and unchanged relation sync are reported separately from D1 save",()=>{
  const result=summarizeServiceChoiceSync([
    {notionFieldSync:"synced"},
    {notionFieldSync:"unchanged"},
  ]);
  assert.equal(result.savedCount,2);
  assert.equal(result.confirmedCount,1);
  assert.equal(result.unchangedCount,1);
  assert.equal(result.needsAttention,false);
  assert.match(result.message,/V Psipedii uložené: 2/);
  assert.match(result.message,/Notion: potvrdené 1, overené bez zmeny 1/);
});
test("pending, disabled and unlinked Notion outcomes never masquerade as synced",()=>{
 const result=summarizeServiceChoiceSync([
   {notionFieldSync:"pending"},
   {notionFieldSync:"disabled"},
   {notionFieldSync:"unlinked"},
   {notionFieldSync:"pending"},
   {}, // A stale API response cannot prove a Notion write.
 ]);
 assert.equal(result.savedCount,5);
 assert.equal(result.pendingCount,3);
 assert.equal(result.disabledCount,1);
 assert.equal(result.unlinkedCount,1);
 assert.equal(result.confirmedCount,0);
 assert.equal(result.needsAttention,true);
 assert.match(result.message,/čaká na kontrolu 3/);
 assert.match(result.message,/bez prepojenia 1/);
 assert.match(result.message,/synchronizácia vypnutá 1/);
});
test("server warning remains visible after successful D1 persistence",()=>{
 const warning="Výber je uložený v Psipedii, ale prenos katalógovej relácie do Notionu vyžaduje kontrolu.";
 const result=summarizeServiceChoiceSync([
   {notionFieldSync:"synced",warning},
   {notionFieldSync:"synced",warning},
 ]);
 assert.equal(result.savedCount,2);
 assert.equal(result.confirmedCount,2);
 assert.equal(result.needsAttention,true);
 assert.equal(result.message.split(warning).length,2,"duplicate warnings should be shown once");
});
test("partial batch acknowledges only successful D1 selections",()=>{
  const feedback=summarizeServiceChoiceSync([
    {notionFieldSync:"synced"},
  ]);
  assert.equal(feedback.savedCount,1);
  assert.doesNotMatch(feedback.message,/uložené: 2/);
  assert.equal(summarizeServiceChoiceSync([]).savedCount,0);
});
test("targeted service sync cannot infer confirmation from unrelated profile writes",()=>{
 const route=read("app/api/admin/directory/[id]/service-options/route.ts");
 assert.match(route,/result\.serviceRelationSync==="pushed"/);
 assert.match(route,/result\.serviceRelationSync==="unchanged"/);
 assert.match(route,/result\.serviceRelationSync==="skipped"\?"pending":"unlinked"/);
 assert.doesNotMatch(route,/result\.pulledFromNotion\|\|result\.pushedToNotion\?"synced"/);
 assert.match(route,/\["pending","unlinked","disabled"\]\.includes\(notionFieldSync\)/);
 assert.doesNotMatch(route,/notionProjection|projectServiceChoiceToDirectoryNotion/);
});
test("Services V3 editor actually consumes remote outcome and displays warning",()=>{
 const profile=read("components/admin-service-profile-values.tsx");
 assert.match(profile,/summarizeServiceChoiceSync\(outcomes\)/);
 assert.match(profile,/const outcomes:ServiceChoiceSyncOutcome\[\]=\[\]/);
 assert.match(profile,/outcomes\.push\(json\)/);
 assert.match(profile,/setFeedback\(summary\)/);
 assert.match(profile,/feedback\.needsAttention\?"Notion: vyžaduje kontrolu":"Notion: potvrdené"/);
 assert.match(profile,/setWriteFailed\(true\)/);
 assert.match(profile,/setSaved\(old=>/);
 assert.match(profile,/setDraft\(old=>/);
});
