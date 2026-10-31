import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { notionPageBelongsToDataSource } from "../lib/notion-sync-page-ownership.ts";
import { requireNotionWritebackEvidence } from "../lib/notion-sync-writeback-evidence.ts";
import { sha256Text } from "../lib/notion-sync-shared.ts";
import { stableAgendaSnapshotJson } from "../lib/notion-bidirectional-reconciliation.ts";
import { agendaEditableFields } from "../lib/notion-events-help-adapters.ts";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";

const source = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
const agendas = ["events","organizations","adoptions","help-cases","lost-found"];
const ds = "76d9ccde-5816-422c-bcfe-863ab69db080";
const pid = "11111111-1111-4111-8111-111111111111";
function fragment(begin, end) {
  const start = source.indexOf(begin), stop = source.indexOf(end, start + begin.length);
  assert.ok(start >= 0 && stop > start, "Could not extract production code " + begin);
  return source.slice(start, stop);
}
function vmSection(code, dependencies) {
  const js = ts.transpileModule(code.replaceAll("export async function ", "async function "), {
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
  }).outputText;
  const ctx = {...dependencies};
  runInNewContext(js, ctx);
  return ctx;
}
const pageRead = fragment("function pageSnapshot(", "function identityPage(");
const write = fragment("async function writeSourceToNotion(", "async function markConflict(");

test("real mapped Notion transport refuses wrong, stale and uncertain echoes across five agendas", async () => {
  for (const agenda of agendas) {
    for (const mode of ["ok","wrong-page","partial","stale","remote-timeout"]) {
      let mappingHash = "original", patches = 0;
      const remote = new Map([[pid, {id:pid, parent:{type:"data_source_id",data_source_id:ds},
        properties:{Popis:"before"}}]]);
      const context = vmSection(pageRead + "\n" + write, {
        agendaEditableFields,sha256Text,stableAgendaSnapshotJson,requireNotionWritebackEvidence,
        pageProperty:(page,name)=>page.properties?.[name] ?? null,
        encodeProperties:(properties)=>properties,
        systemProperties:(s,at)=>({"Psipedia ID":s.id,"URL Psipedia":s.url,"Posledný sync":at}),
        createPage:async()=>{throw Error("unexpected create");},
        patchPage:async(_b,id,properties)=>{
          patches++;
          if (!notionPageBelongsToDataSource(remote.get(id),ds)) throw Error("UNSAFE_TARGET");
          remote.set(id,{...remote.get(id),properties});
          if (mode==="remote-timeout") throw Error("NOTION_TIMEOUT_AFTER_COMMIT");
          if (mode==="wrong-page") return {id:"another-page",properties};
          if (mode==="partial") return {id};
          if (mode==="stale") return {id,properties:{...properties,Popis:"before"}};
          return {id,properties};
        },
      });
      const hash = await sha256Text(stableAgendaSnapshotJson(agenda,{Popis:"after"}));
      async function execute() {
        const written = await context.writeSourceToNotion({
          bindings:{},dataSourceId:ds,
          source:{id:"42",url:"https://psipedia.sk/42",properties:{Popis:"after"}},
          schema:{Popis:{type:"rich_text"}},pageId:pid,
        });
        await context.requireVerifiedMappedNotionWriteback({
          written,expectedPageId:pid,expectedHash:hash,
          schema:{Popis:{type:"rich_text"}},agenda,
        });
        mappingHash=hash; // mocked D1 mapping/ack boundary
      }
      if (mode==="ok") {
        await execute();
        await execute();
        assert.equal(mappingHash,hash);
        assert.equal(patches,2);
      } else {
        await assert.rejects(execute(),
          mode==="remote-timeout" ? /NOTION_TIMEOUT_AFTER_COMMIT/
            : /NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH/);
        assert.equal(mappingHash,"original",agenda+"/"+mode);
        assert.equal(patches,1);
      }
    }
  }
});

test("production sweep dispatcher isolates broken agendas, dry-run and Gemini-targeted scope", async () => {
  const code = fragment("function totals(", "export async function runNotionEventsHelpBootstrapSweep(");
  const visited = [];
  const receipts = [];
  const definitions = agendas.map(key=>({key,label:key}));
  const empty = (d,enabled=true,schemaReady=true)=>({
    agenda:d.key,label:d.label,enabled,schemaReady,scanned:0,bootstrapped:0,
    createdFromNotion:0,createdInNotion:0,pulledFromNotion:0,pushedToNotion:0,
    geoMirrorUpdates:0,unchanged:0,conflicts:0,failed:0,
    resolvedConflictFlags:0,staleConflictCandidates:0,reviewQueue:{total:0},
  });
  const ctx = vmSection(code,{
    definitions,enabled:()=>true,schemaReady:async()=>true,emptyAgenda:empty,
    recordNotionTransfer:async(_db,scope,direction,count)=>{if(count>0)receipts.push({scope,direction,count});},
    logFailure:record=>{record.failed++;},
    syncAgenda:async input=>{
      visited.push([input.definition.key,input.mode,input.targetPageId]);
      if (input.definition.key==="adoptions") throw Error("PROVIDER_DOWN");
      return {...empty(input.definition),scanned:1,
        pushedToNotion:input.mode==="sync"?1:0};
    },
  });
  const run=ctx.runNotionEventsHelpSyncSweep;
  const all=await run({database:{},bindings:{},mode:"sync"});
  assert.deepEqual(Array.from(all.agendas,a=>a.agenda),agendas);
  assert.equal(all.totals.failed,1);
  assert.equal(all.totals.pushedToNotion,4);
  assert.deepEqual(receipts.map(x=>x.scope),["events","organizations","help-cases","lost-found"]);
  assert.ok(receipts.every(x=>x.direction==="ADMIN_TO_NOTION"&&x.count===1));
  assert.equal(visited.length,5);
  visited.length=0;
  const dry=await run({database:{},bindings:{},mode:"dry-run",agendas:["events"]});
  assert.equal(dry.totals.pushedToNotion,0);
  assert.deepEqual(visited.map(x=>x[0]),["events"]);
  await assert.rejects(run({database:{},bindings:{},mode:"sync",targetPageId:pid}),
    /GEMINI_TARGETED_NOTION_SCOPE_INVALID/);
  await assert.rejects(run({database:{},bindings:{},mode:"sync",
    agendas:["events"],targetPageId:pid,reviewedLegacy:true}),
    /GEMINI_LEGACY_REVIEW_SCOPE_INVALID/);
  visited.length=0;
  await run({database:{},bindings:{},mode:"sync",agendas:["events"],
    targetPageId:pid,expectedNotionRevision:"revision-1"});
  assert.deepEqual(visited.map(x=>x[2]),[pid]);
});

test("verified one-sided fields merge; concurrent edits never select a winner", () => {
  for (const agenda of agendas) {
    const baseline={Popis:"Before"},notion={Popis:"Notion"},admin={Popis:"Admin"};
    assert.equal(reconcileProfileFields({baseline,notion,psipedia:admin,
      protectedFields:new Set()}).kind,"CONFLICT",agenda);
    const safe=reconcileProfileFields({baseline,notion,psipedia:baseline,
      protectedFields:new Set()});
    assert.equal(safe.kind,"MERGE",agenda);
    assert.equal(safe.merged.Popis,"Notion",agenda);
  }
});
