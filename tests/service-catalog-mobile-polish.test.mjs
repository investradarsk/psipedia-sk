import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {readFileSync} from "node:fs";

// Transpile the real TSX with the repository's declared TypeScript dependency.
// Stub only the Next router and adjacent UI wrappers; retain real React rendering.
const source=readFileSync(new URL("../components/admin-service-catalog-workspace.tsx",import.meta.url),"utf8");
const transpiled=ts.transpileModule(source,{
  fileName:"admin-service-catalog-workspace.tsx",
  compilerOptions:{
    jsx:ts.JsxEmit.ReactJSX,
    module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,
    esModuleInterop:true
  }
}).outputText;
const actualRequire=createRequire(import.meta.url);
const styles=new Proxy({}, {get:(_target,key)=>String(key)});
const fakeRequire=(id)=>{
  if(id==="react"||id==="react/jsx-runtime")return actualRequire(id);
  if(id==="next/navigation")return {useRouter:()=>({refresh(){}})};
  // The real safety helper has dedicated runtime tests; SSR snapshot stubs only its import.
  if(id==="@/lib/service-catalog-admin-mirror-controls")return {
    manualCatalogMirrorAction:()=>null,manualCatalogMirrorConfirmation:()=>""
  };
  if(id.endsWith(".module.css"))return {__esModule:true,default:styles};
  if(id==="@/components/admin-interaction-system")return {
    AdminActionButton:({children,disabled})=>createElement("button",{disabled},children)
  };
  if(id==="@/components/admin-editor-workspace")return {
    EditorActionBar:()=>null,
    EditorWorkspace:()=>null,
    EditorStatus:({label})=>createElement("span",null,label)
  };
  throw new Error("Unexpected dependency in catalog test: "+id);
};
const mod={exports:{}};
runInNewContext("(function(require,module,exports){"+transpiled+"\n})",
  {process,console})(fakeRequire,mod,mod.exports);
const {AdminServiceCatalogWorkspace}=mod.exports;
const html=({writeEnabled=false,loadError=null}={})=>renderToStaticMarkup(
  createElement(AdminServiceCatalogWorkspace,{items:[],categories:[],writeEnabled,loadError})
);

test("disabled writes: one concise truthful status, hidden native disclosure, separate controls",()=>{
  const out=html();
  assert.match(out,/Zápisy sú vypnuté/);
  assert.match(out,/Vytváranie a úpravy možností katalógu sú momentálne nedostupné/);
  assert.equal((out.match(/class="statusPanel"/g)||[]).length,1);
  assert.match(out,/<details[^>]*class="statusDetails"[^>]*><summary>Podrobnosti o katalógu<\/summary>/);
  assert.doesNotMatch(out,/<details[^>]*\bopen(?:="")?/);
  assert.match(out,/Kanonický register možností je v D1/);
  assert.match(out,/DRAFT \/ PENDING/);
  assert.match(out,/Vytvorenie konceptu neznamená automatické schválenie ani verejné publikovanie/);
  assert.match(out,/disabled=""[^>]*>\+ Nová možnosť<\/button>/);
  assert.doesNotMatch(out,/Zápisy Services V3 sú zatiaľ vypnuté/);
});

test("enabled writes: edit availability is honest and approval stays Notion-receipt gated",()=>{
  const out=html({writeEnabled:true});
  assert.match(out,/Vytváranie konceptov je dostupné/);
  assert.match(out,/Koncepty možno vytvárať a upravovať/);
  assert.match(out,/Schválenie vyžaduje SYNCED a overený Notion receipt/);
  assert.match(out,/vyradenie je nezvratné/);
  assert.doesNotMatch(out,/Zápisy sú vypnuté/);
  assert.match(out,/<button>\+ Nová možnosť<\/button>/);
  assert.match(out,/Overiť D1 ↔ Notion \(iba čítanie\)/);
});

test("load errors remain visible role=alert even with disclosure closed",()=>{
  const out=html({loadError:"Dynamické možnosti sa nepodarilo načítať."});
  assert.match(out,/<p role="alert" class="error">Dynamické možnosti sa nepodarilo načítať\.<\/p>/);
  assert.match(out,/<details[^>]*class="statusDetails"/);
  assert.doesNotMatch(out,/<details[^>]*\bopen(?:="")?/);
  assert.match(out,/Zápisy sú vypnuté/);
});

test("inconsistent enabled+error props fail closed in status rather than misleading user",()=>{
  const out=html({writeEnabled:true,loadError:"Chyba katalógu"});
  assert.match(out,/Vytváranie konceptov je pozastavené/);
  assert.match(out,/role="alert"/);
  assert.doesNotMatch(out,/Vytváranie konceptov je dostupné/);
  assert.match(out,/disabled=""[^>]*>\+ Nová možnosť<\/button>/);
});
