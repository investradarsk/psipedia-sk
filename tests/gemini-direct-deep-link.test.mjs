import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { geminiAgendaForKey } from "../lib/gemini-notion-agenda-review.ts";
import {
  geminiDraftDeepLink, geminiValidNotionDraftId, geminiCanonicalEditorUrl,
} from "../lib/gemini-concept-manager.ts";

const ids = geminiAutomationCatalog.map((item, i) =>
  ["00000000-0000-4000-8000-", String(i + 101).padStart(12, "0")].join(""));
const byKey = new Map(geminiAutomationCatalog.map((item, i) => [item.stableKey, ids[i]]));

test("all 22 categories produce exact, encoded Notion draft links and existing canonical routes", () => {
  assert.equal(geminiAutomationCatalog.length, 22);
  for (const item of geminiAutomationCatalog) {
    const id = byKey.get(item.stableKey);
    const path = geminiDraftDeepLink(item.stableKey, id);
    assert.ok(path?.startsWith("/admin/automatizacie-gemini?stable_key="), item.stableKey);
    assert.equal(new URL(path, "https://fixture.test").searchParams.get("draft_id"), id);
    assert.equal(new URL(path, "https://fixture.test").searchParams.get("stable_key"), item.stableKey);
    const agenda = geminiAgendaForKey(item.stableKey);
    const native = { events:"podujatia", organizations:"organizacie",
      adoptions:"adopcie", "help-cases":"pomoc", "lost-found":"stratene-najdene" };
    assert.equal(geminiCanonicalEditorUrl({
      canonicalVerified:true, psipediaId:"781", ...(agenda ? {agenda} : {}),
    }), "/admin/" + (native[agenda] || "adresar") + "/781", item.stableKey);
  }
  assert.equal(geminiDraftDeepLink("help.invalid", ids[0]), null);
  for (const value of ["", "../abc", "not-uuid", "12345", "0".repeat(34), "abc?x=1"]) {
    assert.equal(geminiValidNotionDraftId(value), false, value);
    assert.equal(geminiDraftDeepLink("help.adopcia", value), null);
  }
  assert.equal(geminiCanonicalEditorUrl({canonicalVerified:false,psipediaId:"781",agenda:"adoptions"}),null);
});

test("deep-link reader opens only authenticated category-matching Notion drafts, without writes (3 widths x 22 keys)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemini-direct-link-"));
  let browser;
  try {
    const input = [
      'import React from "react";',
      'import {createRoot} from "react-dom/client";',
      'import {AdminGeminiNotionDrafts} from "./components/admin-gemini-notion-drafts";',
      'const p=new URLSearchParams(location.search);',
      'createRoot(document.getElementById("root")).render(<AdminGeminiNotionDrafts',
      'stableKey={p.get("stable_key")||"help.adopcia"} deepLinkDraftId={p.get("draft_id")||undefined}/>);',
    ].join("\n");
    await build({stdin:{contents:input,loader:"tsx",resolveDir:process.cwd()},
      bundle:true,jsx:"automatic",outfile:join(directory,"app.js"),
      define:{"process.env.NODE_ENV":'"production"'},
      plugins:[{name:"fixture-editors-and-next-link",setup(b) {
        b.onResolve({filter:/^@\/components\/admin-(directory-editor|gemini-agenda-draft-editor)$/},
          args=>({path:args.path,namespace:"fake-editor"}));
        b.onLoad({filter:/.*/,namespace:"fake-editor"},args=>({
          contents:args.path.endsWith("directory-editor")
            ? 'import React from "react"; export function AdminDirectoryEditor(p){return React.createElement("div",{"data-testid":"selected-concept"},p.notionDraft?.name||p.profile?.name)}'
            : 'import React from "react"; export function AdminGeminiAgendaDraftEditor(p){return React.createElement("div",{"data-testid":"selected-concept"},p.draft.name)}',
          resolveDir:process.cwd(),
        }));
        b.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fake-link"}));
        b.onLoad({filter:/.*/,namespace:"fake-link"},()=>({
          contents:'import React from "react"; export default function Link(p){return React.createElement("a",p)}',
          resolveDir:process.cwd(),
        }));
      }}],
    });
    const js=await readFile(join(directory,"app.js"),"utf8");
    const css=await readFile(join(directory,"app.css"),"utf8").catch(()=>"");
    const html='<!doctype html><html lang="sk"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}' +
      css + '</style></head><body><div id="root"></div><script>' + js + '</script></body></html>';
    browser=await chromium.launch({headless:true});
    for (const width of [320,390,1440]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const unexpected=[], errors=[];
      let activeKey="", activeId="", phase="NEW", deny=false, delayed=false;
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/*",async route=>{
        const url=new URL(route.request().url()), method=route.request().method();
        if(method!=="GET") {unexpected.push(method);return route.fulfill({status:405,body:"write forbidden"});}
        if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:html});
        if(url.pathname.startsWith("/admin/"))return route.fulfill({contentType:"text/html",body:"<p>CANONICAL</p>"});
        if(url.pathname.startsWith("/api/admin/gemini-automation/notion-drafts/")){
          if(deny) return route.fulfill({status:401,json:{error:"Unauthorized"}});
          if(delayed) await new Promise(resolve=>setTimeout(resolve,150));
          const requested=url.pathname.split("/").at(-1);
          if(requested!==activeId || (url.searchParams.get("stable_key") && url.searchParams.get("stable_key")!==activeKey))
            return route.fulfill({status:404,json:{error:"Identity mismatch"}});
          const item=geminiAutomationCatalog.find(x=>x.stableKey===activeKey);
          const agenda=geminiAgendaForKey(activeKey);
          return route.fulfill({json:{draft:{
            id:activeId,stableKey:activeKey,name:"Exact " + activeKey,
            ...(agenda?{agenda}:{category:item.subcategory}),
            city:"Nitra",reviewState:phase,
            psipediaId:phase==="IMPORTED"||phase==="UNVERIFIED"?"123":"",
            canonicalVerified:phase==="IMPORTED",
            lastEditedAt:"2026-10-19T10:00:00Z",fields:[],reviewAvailable:true,
          }}});
        }
        return route.fulfill({status:404,body:"Unexpected GET"});
      });
      for(const item of geminiAutomationCatalog) {
        activeKey=item.stableKey;activeId=byKey.get(activeKey);
        phase="NEW";deny=false;delayed=false;
        await page.goto("https://fixture.test/?stable_key="+encodeURIComponent(activeKey)+"&draft_id="+activeId);
        await page.getByTestId("selected-concept").getByText("Exact "+activeKey).waitFor({timeout:12000});
        assert.equal(await page.getByRole("button",{name:/Koncepty z automatizácie/}).getAttribute("aria-expanded"),"true");
        assert.equal(await page.getByTestId("selected-concept").innerText(),"Exact "+activeKey);
        if(item.stableKey==="help.adopcia"||item.stableKey==="help.stratene-a-najdene") {
          await page.reload();
          await page.getByTestId("selected-concept").getByText("Exact "+activeKey).waitFor();
        }
      }
      activeKey="help.adopcia";activeId=byKey.get(activeKey);phase="APPROVED";
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.getByTestId("selected-concept").getByText("Exact "+activeKey).waitFor();
      phase="IMPORTED";
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.waitForURL("**/admin/adopcie/123");
      activeKey="help.stratene-a-najdene";activeId=byKey.get(activeKey);
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.waitForURL("**/admin/stratene-najdene/123");
      phase="UNVERIFIED";
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.getByRole("alert").getByText(/D1 identita nie je overená/).waitFor();
      assert.equal(await page.getByTestId("selected-concept").count(),0);
      phase="NEW"; deny=true;
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.getByRole("alert").getByText(/Unauthorized/).waitFor();
      deny=false;
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id=invalid");
      await page.getByRole("alert").getByText(/Neplatná identita/).waitFor();
      assert.equal(await page.getByTestId("selected-concept").count(),0);

      // An unknown but well-formed UUID must fail closed, not open another row.
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+ids[0]);
      await page.getByRole("alert").getByText(/Identity mismatch/).waitFor();
      assert.equal(await page.getByTestId("selected-concept").count(),0);

      // Browser history restores the exact Notion record instead of its category.
      phase="NEW";
      await page.goto("https://fixture.test/?stable_key="+activeKey+"&draft_id="+activeId);
      await page.getByTestId("selected-concept").waitFor();
      await page.goto("https://fixture.test/?stable_key="+activeKey);
      await page.goBack();
      await page.getByTestId("selected-concept").waitFor();
      assert.equal(await page.getByTestId("selected-concept").innerText(),"Exact "+activeKey);
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(errors,[]);
      await page.close();
    }
  } finally {await browser?.close();await rm(directory,{recursive:true,force:true});}
});
