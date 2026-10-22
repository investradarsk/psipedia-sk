import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render the real dashboard and action controls before hydration. Only routing is stubbed.
test("server-rendered organization lifecycle buttons are disabled until handlers are attached", async () => {
  const result = await build({
    entryPoints:["components/admin-organization-publication-dashboard.tsx"], bundle:true, write:false,
    platform:"node", format:"cjs", packages:"external", external:["react","react/*"], jsx:"automatic", loader:{".css":"empty"},
    plugins:[{name:"router-fixture", setup(build) {
      build.onResolve({filter:/\.module\.css$/},args=>({path:args.path,namespace:"css-fixture"}));
      build.onLoad({filter:/.*/,namespace:"css-fixture"},()=>({contents:"export default {};",loader:"js"}));
      build.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:"router-fixture"}));
      build.onLoad({filter:/.*/,namespace:"router-fixture"},args=>({contents:args.path.endsWith("navigation")
        ? 'export const useRouter=()=>({push(){},refresh(){}});'
        : 'import React from "react"; export default function Link({children,...props}){return React.createElement("a",props,children);}',loader:"js"}));
    }}],
  });
  const mod={exports:{}};
  new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const item={id:1,name:"Test",slug:"test",type:"OTHER",preflight:{ready:true,blockers:[]},completenessHints:[],updatedAt:"2026-10-21T00:00:00Z",locationCount:0,fundraisingCount:0};
  const data={items:["DRAFT","PUBLISHED","ARCHIVED"].map((status,i)=>({...item,id:i+1,status})),counts:{total:3,draft:1,published:1,archived:1},pagination:{page:1,totalPages:1,total:3,pageSize:30},options:{regions:[],districts:[],cities:[]}};
  const filters={q:"",type:"",status:"all",region:"",district:"",city:"",missingLocation:false,incomplete:false,page:1};
  const html=renderToStaticMarkup(React.createElement(mod.exports.AdminOrganizationPublicationDashboard,{data,filters}));
  for(const label of ["Publikovať","Presunúť do konceptu","Archivovať","Obnoviť do konceptu"]){
    const buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(match=>match[2]===label);
    assert.ok(buttons.length,label);
    for(const button of buttons)assert.match(button[1],/\bdisabled=""/,label);
  }
});
