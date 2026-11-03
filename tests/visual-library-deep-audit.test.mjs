import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import {buildRegistry} from "../scripts/generate-component-registry.mjs";
import {scanCssRules} from "../scripts/visual-library-deep-audit.mjs";

function add(root,file,content){
  const absolute=path.join(root,file);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  fs.writeFileSync(absolute,content);
}

const jsxText = 'export default function Same(){return <main><header><h1>Titulok</h1><p>Text</p></header><article><section><h2>A</h2><p>B</p><button>OK</button></section><footer><a href="/x">Link</a></footer></article></main>}';

test("full audit includes inline JSX from pages, layouts and components missed by original registry", t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"visual-deep-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  add(root,"app/page.tsx",'import A from "@/components/one"; export default function Page(){return <main><A/><aside>Inline</aside></main>}');
  add(root,"app/(site)/layout.tsx",'export default function Layout({children}){return <div className="site"><header>Navigation</header>{children}</div>}');
  add(root,"app/plemena/[slug]/page.tsx",'export default function Breed(){return <main><h1>Breed</h1></main>}');
  add(root,"components/one.tsx",jsxText);
  add(root,"components/two.tsx",jsxText);
  add(root,"components/third.tsx",jsxText.replace("Titulok","Iný titulok"));
  add(root,"components/fourth.tsx",jsxText.replace("<footer>","<aside>").replace("</footer>","</aside>"));
  add(root,"lib/server-only.tsx",'export function Icon(){return <svg><path d="x"/></svg>}');
  add(root,"components/not-visual.tsx",'export const number=3');
  const reg=buildRegistry(root);
  const audit=reg.deepAudit;
  assert.equal(reg.version,3);
  assert.equal(audit.version,1);
  assert.equal(audit.totals.jsxFiles,8);
  assert.equal(audit.modules.length,8);
  assert.equal(audit.totals.otherJsxFiles,4);
  assert.equal(audit.modules.find(m=>m.path==="app/page.tsx").role,"page");
  assert.equal(audit.modules.find(m=>m.path==="app/(site)/layout.tsx").role,"layout");
  assert.equal(audit.modules.find(m=>m.path==="lib/server-only.tsx").role,"lib-jsx");
  assert.deepEqual(audit.identicalSourceGroups[0].files,["components/one.tsx","components/two.tsx"]);
  assert.ok(audit.similarStructureGroups.some(group=>
    group.files.includes("components/third.tsx")&&group.files.includes("components/one.tsx")));
  assert.ok(!audit.modules.some(m=>m.path==="components/not-visual.tsx"));
  assert.ok(audit.nearJsxCandidates.some(pair=>
    [pair.leftPath,pair.rightPath].includes("components/fourth.tsx")&&
    pair.score>=88&&pair.sharedTags>=7));
  assert.equal(audit.totals.nearJsxCandidatePairs,audit.nearJsxCandidates.length);
});

test("CSS scanning matches equal declaration sets across files while preserving at-rule context", t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"visual-css-deep-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  add(root,"app/page.tsx",'import Header from "@/components/header"; export default function Page(){return <Header/>}');
  add(root,"components/header.tsx",'import "./header.module.css"; export default function Header(){return <header/>}');
  add(root,"components/header.module.css",'.header { color:#fff; background: #123; padding: 8px; display:flex; }\n@media (max-width: 600px) {\n .header{ color:#fff; background:#123; padding:8px; display:flex; }\n}');
  add(root,"components/other.module.css",'.other { display:flex; padding:8px; background:#123; color:#fff; }\n.short {display:flex; color:red;}');
  add(root,"styles/global.css",'.other-global { color:#fff; background:#123; padding:8px; display:flex; }');
  const audit=buildRegistry(root).deepAudit;
  assert.equal(audit.totals.cssFiles,3);
  assert.equal(audit.totals.cssRules,5);
  assert.equal(audit.exactCssDeclarationGroups.length,1);
  const group=audit.exactCssDeclarationGroups[0];
  assert.equal(group.filesCount,3);
  assert.equal(group.propertyCount,4);
  assert.equal(group.context,"");
  assert.equal(group.members.length,3);
  assert.ok(group.members.every(m=>m.line>0));
  assert.ok(!group.members.some(m=>m.selector===".short"));
  const allRules=scanCssRules(fs.readFileSync(path.join(root,"components/header.module.css"),"utf8"),"components/header.module.css");
  assert.equal(allRules.length,2);
  assert.match(allRules[1].context,/^@media/);
});

test("audit UI is searchable, paginated, honest and never mutates public CSS or the DB",()=>{
  const ui=fs.readFileSync("components/admin-visual-library-deep-audit.tsx","utf8");
  const parent=fs.readFileSync("components/admin-visual-library.tsx","utf8");
  const duplicate=fs.readFileSync("components/admin-visual-library-duplicates.tsx","utf8");
  assert.match(ui,/audit\.modules\.filter/);
  assert.match(ui,/audit\.exactCssDeclarationGroups\.filter/);
  assert.match(ui,/slice\(0,limit\)/);
  assert.match(ui,/Totožné zdrojové súbory/);
  assert.match(ui,/Rovnaká JSX štruktúra/);
  assert.match(ui,/Opakované CSS deklarácie/);
  assert.match(ui,/Veľmi podobné JSX/);
  assert.match(ui,/Nič sa automaticky nezlučuje ani nemaže/);
  assert.match(parent,/useState<"register"/);
  assert.match(parent,/AdminVisualLibraryDeepAudit registry=\{registry\}/);
  assert.match(duplicate,/initialView="css"/);
  assert.doesNotMatch(ui,/method:\s*"(POST|PUT|DELETE)"|cloudflare:workers|fetch\(|DB\.prepare/);
});
