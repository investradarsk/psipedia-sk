import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";

const keys = geminiAutomationCatalog.map(x => x.stableKey);
function drafts(key, phase) {
  const n = keys.indexOf(key);
  assert.ok(n >= 0, key);
  return ["NEW", "APPROVED", "IMPORTED", "PUBLISHED"].map((kind, i) => ({
    id: "00000000-0000-4000-8000-" + String(n * 10 + i + 1).padStart(12, "0"),
    name: kind + " " + key, city: "Nitra", reviewState: phase === "published" && i === 0 ? "PUBLISHED" : kind,
    psipediaId: i >= 2 ? String(n + 100) : "", canonicalVerified: i >= 2,
    ...(key.startsWith("directory.") ? { category: key.slice(10) } :
      { agenda: key.startsWith("events.") ? "events" : key === "help.utulky" ? "organizations" :
        key === "help.adopcia" ? "adoptions" : key === "help.stratene-a-najdene" ? "lost-found" : "help-cases" }),
    stableKey: key, lastEditedAt: "2026-10-19T08:00:00Z", syncError: i === 1 ? "Konflikt z Notionu" : "",
    reviewAvailable: true, fields: [],
  }));
}
test("Gemini real React UI: 22 categories on desktop/mobile, publication, history, stale API and failure", async () => {
  assert.equal(keys.length, 22);
  assert.deepEqual(["directory", "events", "help"].map(s => geminiAutomationCatalog.filter(i => i.section === s).length), [10,6,6]);
  const dir = await mkdtemp(join(tmpdir(), "gemini-published-browser-"));
  let browser;
  try {
    const input = [
      'import React from "react";',
      'import {createRoot} from "react-dom/client";',
      'import {AdminGeminiAllConcepts} from "./components/admin-gemini-all-concepts";',
      'import {AdminGeminiNotionDrafts} from "./components/admin-gemini-notion-drafts";',
      'import "./app/admin/admin-workspace.css";',
      'import "./app/admin/admin-legacy-scoped.css";',
      'const q = new URLSearchParams(location.search);',
      'createRoot(document.getElementById("root")).render(q.get("view") === "category" ?',
      '<AdminGeminiNotionDrafts stableKey={q.get("key") ?? "directory.veterinari"}/> : <AdminGeminiAllConcepts/>);',
    ].join("\n");
    await build({ stdin: { contents:input, loader:"tsx", resolveDir:process.cwd() },
      bundle:true, jsx:"automatic", outfile:join(dir,"app.js"),
      define:{"process.env.NODE_ENV":'"production"'},
      plugins:[{name:"next-link-fixture",setup(b){
        b.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
        b.onLoad({filter:/.*/,namespace:"fixture"},()=>({
          contents:'import React from "react"; export default function Link(p){return React.createElement("a",p)}',
          resolveDir:process.cwd(),
        }));
      }}],
    });
    const [js,css] = await Promise.all(["app.js","app.css"].map(f=>readFile(join(dir,f),"utf8")));
    browser = await chromium.launch({headless:true,
      ...(process.env.GEMINI_TEST_CHROMIUM ? {executablePath:process.env.GEMINI_TEST_CHROMIUM,
        args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu-sandbox"]}:{}),
    });
    const html = '<!doctype html><html lang="sk"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:12px}' +
      css + '</style></head><body class="admin-body"><main class="admin-workspace"><div id="root"></div></main><script>' + js + '</script></body></html>';
    for (const width of [390, 1440]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[], methods=[], calls=[];
      let phase="draft", failKey=null;
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("**/*",route=>{
        const url=new URL(route.request().url()), method=route.request().method();
        if(url.pathname==="/")return route.fulfill({contentType:"text/html; charset=utf-8",body:html});
        if(method!=="GET"){methods.push(method);return route.fulfill({status:405,json:{error:"No writes"}});}
        if(url.pathname==="/api/admin/gemini-automation/notion-drafts"){
          const key=url.searchParams.get("stable_key"); calls.push(key);
          if(key===failKey)return route.fulfill({status:503,json:{error:"D1 read failed"}});
          return route.fulfill({json:{drafts:drafts(key,phase)}});
        }
        return route.fulfill({status:404,body:"Unexpected request"});
      });
      const complete=()=>page.getByText(/Načítaných všetkých 22 kategórií/).waitFor({timeout:15000});
      const counter=page.locator('section[aria-label="Súhrn konceptov"] strong');
      await page.goto("https://fixture.test/"); await complete();
      assert.equal(new Set(calls).size,22);
      assert.equal(await counter.innerText(),"66");
      assert.equal(await page.locator("li").count(),66);
      await page.getByRole("combobox",{name:"Stav"}).selectOption("PUBLISHED");
      assert.equal(await page.locator("li").count(),22);
      await page.getByRole("combobox",{name:"Stav"}).selectOption("ACTIVE");
      phase="published";
      await page.getByRole("button",{name:/Obnoviť/}).click(); await complete();
      assert.equal(await counter.innerText(),"44", "confirmed publications leave active count");
      assert.equal(await page.locator("li").count(),44);
      await page.getByRole("combobox",{name:"Stav"}).selectOption("PUBLISHED");
      assert.equal(await page.locator("li").count(),44,"published history retained");
      await page.getByRole("combobox",{name:"Stav"}).selectOption("ACTIVE");
      phase="draft"; // stale response after an earlier confirmed publication
      await page.getByRole("button",{name:/Obnoviť/}).click(); await complete();
      assert.equal(await counter.innerText(),"44","stale refresh must not revive confirmed publications");
      phase="published"; await page.reload(); await complete();
      assert.equal(await counter.innerText(),"44","hard refresh recomputes D1 status");
      failKey=keys[0];
      await page.getByRole("button",{name:/Obnoviť/}).click();
      await page.getByText(/Zoznam nie je úplný/).waitFor();
      assert.equal(await counter.innerText(),"42");
      assert.equal(await page.getByRole("alert").count(),1);
      assert.deepEqual(methods,[]); assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.close();

      for(const key of keys){
        const panel=await browser.newPage({viewport:{width,height:900}});
        let local="draft"; const panelErrors=[];
        panel.on("pageerror",e=>panelErrors.push(e.message));
        await panel.route("**/*",route=>{
          const url=new URL(route.request().url());
          if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:html});
          if(url.pathname==="/api/admin/gemini-automation/notion-drafts"){
            assert.equal(url.searchParams.get("stable_key"),key);
            assert.equal(route.request().method(),"GET");
            return route.fulfill({json:{drafts:drafts(key,local)}});
          }
          return route.fulfill({status:404,body:"Unexpected category request"});
        });
        await panel.goto("https://fixture.test/?view=category&key="+encodeURIComponent(key));
        await panel.getByRole("button",{name:/Koncepty z automatizácie/}).click();
        await panel.getByText("NEW "+key,{exact:true}).waitFor();
        const button=panel.getByRole("button",{name:/Koncepty z automatizácie/});
        assert.match(await button.innerText(),/\(3\)/,key);
        local="published";
        await panel.getByRole("button",{name:/Obnoviť/}).click();
        await panel.waitForFunction(() => (document.querySelector('section[aria-label="Koncepty vytvorené automatizáciou"] button')?.textContent ?? "").includes("(2)"), null, {timeout:10000});
        await panel.getByText("APPROVED "+key,{exact:true}).waitFor();
        await panel.getByText("IMPORTED "+key,{exact:true}).waitFor();
        await panel.getByRole("combobox",{name:"Stav konceptu"}).selectOption("PUBLISHED");
        await panel.getByText("NEW "+key,{exact:true}).waitFor();
        await panel.getByText("PUBLISHED "+key,{exact:true}).waitFor();
        assert.deepEqual(panelErrors,[],key);
        assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,key);
        await panel.close();
      }
    }
  } finally {await browser?.close();await rm(dir,{recursive:true,force:true});}
});
