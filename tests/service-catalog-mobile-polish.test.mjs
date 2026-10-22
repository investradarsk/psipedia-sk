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

test("disabled writes disable new service action and keep technical details collapsed",()=>{
 const out=html();
 assert.match(out,/Technické informácie o synchronizácii/);
 assert.match(out,/disabled=""[^>]*>\+ Nová služba<\/button>/);
 assert.doesNotMatch(out,/<details[^>]*\bopen(?:="")?/);
});
test("enabled writes offer only simple catalog action",()=>{
 const out=html({writeEnabled:true});
 assert.match(out,/<button>\+ Nová služba<\/button>/);
 assert.doesNotMatch(out,/Schválenie vyžaduje SYNCED/);
 assert.match(out,/Zmeny katalógu sa prenášajú automaticky/);
});
test("load errors remain visible and disable writes",()=>{
 const out=html({writeEnabled:true,loadError:"Chyba katalógu"});
 assert.match(out,/role="alert"/);
 assert.match(out,/Chyba katalógu/);
 assert.match(out,/disabled=""[^>]*>\+ Nová služba<\/button>/);
});
