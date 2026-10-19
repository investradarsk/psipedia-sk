import assert from "node:assert/strict";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {build} from "esbuild";

// Render the real TSX component, isolating only Next router and adjacent UI wrappers.
// No D1, API requests, feature-flag activation or production data are involved.
const compiled=await build({
  entryPoints:[fileURLToPath(new URL("../components/admin-service-catalog-workspace.tsx",import.meta.url))],
  bundle:true,platform:"node",format:"cjs",packages:"external",jsx:"automatic",write:false,
  plugins:[{
    name:"catalog-mobile-polish-test-isolation",
    setup(b){
      b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"catalog-mock"}));
      b.onResolve({filter:/^@\/components\/admin-(interaction-system|editor-workspace)$/},()=>({path:"components",namespace:"catalog-mock"}));
      b.onResolve({filter:/\.module\.css$/},()=>({path:"css",namespace:"catalog-mock"}));
      b.onLoad({filter:/.*/,namespace:"catalog-mock"},({path})=>({
        contents:path==="router"
          ? "export const useRouter=()=>({refresh(){}});"
          :path==="css"
            ? "export default new Proxy({}, {get:(_target,key)=>String(key)});"
            : `import React from "react";
export function AdminActionButton({children,disabled,...props}){return React.createElement("button",{disabled},children);}
export function EditorWorkspace(){return null;}
export function EditorActionBar(){return null;}
export function EditorStatus({label}){return React.createElement("span",null,label);}`,
        loader:"js"
      }));
    }
  }]
});
const mod={exports:{}};
runInNewContext(`(function(require,module,exports){${compiled.outputFiles[0].text}\n})`,
  {process,console})(createRequire(import.meta.url),mod,mod.exports);
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

test("enabled writes: draft creation is truthfully available but lifecycle stays restricted",()=>{
  const out=html({writeEnabled:true});
  assert.match(out,/Vytváranie konceptov je dostupné/);
  assert.match(out,/Nové možnosti možno vytvoriť ako koncepty/);
  assert.match(out,/Úpravy, schvaľovanie a archivácia zostávajú nedostupné/);
  assert.doesNotMatch(out,/Zápisy sú vypnuté/);
  assert.match(out,/<button>\+ Nová možnosť<\/button>/);
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
