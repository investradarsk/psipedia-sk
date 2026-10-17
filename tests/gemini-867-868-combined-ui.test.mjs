import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Read *actual* PR #867 dashboard source at the approved compact layout SHA.
// No cherry-pick, no second PR, no writes to the #867 branch.
// The main repository (PR #868) retains its own canonical draft manager.
const DASHBOARD_SHA = "0509a333f5c84a1e68c86d7d1deedcae5551db12";
const fromDashboardPR = (path) => {
  try {
    return execFileSync("git", ["show", DASHBOARD_SHA + ":" + path], {
      cwd: process.cwd(), encoding: "utf8", timeout: 10000,
    });
  } catch {
    throw Error("Dashboard PR #867 snapshot unavailable: fetch " + DASHBOARD_SHA +
      " into the isolated CI checkout before running combined UI test");
  }
};

test("PR #867 compact dashboard and PR #868 concept manager work together", async () => {
  const dashboard = fromDashboardPR("components/admin-gemini-automation-settings.tsx");
  const dashboardCSS = fromDashboardPR("components/admin-gemini-automation.module.css");
  assert.equal((dashboard.match(/<AdminGeminiNotionDrafts\b/g) ?? []).length, 1,
    "must render a single canonical concept panel");

  const dir = await mkdtemp(join(tmpdir(), "gemini-867-868-integration-"));
  const screenshotDir = process.env.GEMINI_INTEGRATION_SCREENSHOTS;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  let browser;

  const input = String.raw`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { AdminGeminiAutomationSettings } from "./components/admin-gemini-automation-settings";
    import "./app/admin/admin-workspace.css";
    import "./app/admin/admin-legacy-scoped.css";
    const settings = [
      { stableKey:"directory.veterinari", section:"directory", label:"Veterinári",
        enabled:true, saved:true, cadenceMinutes:20160, weeklyDay:null, maxNewConcepts:1,
        lastRunAt:null, nextRunAt:null },
      { stableKey:"events.vystavy", section:"events", label:"Výstavy",
        enabled:true, saved:true, cadenceMinutes:10080, weeklyDay:null, maxNewConcepts:1,
        lastRunAt:null, nextRunAt:null },
    ];
    const sections = [
      {key:"directory", label:"Služby pre psov"},
      {key:"events", label:"Podujatia"},
    ];
    createRoot(document.getElementById("root")).render(
      <AdminGeminiAutomationSettings sections={sections} settings={settings}
        available={true} externalEnabled={true} queueEnabled={false}
        initialJobs={[]} recentRuns={[]} />
    );
  `;
  // Use a string literal rather than a second production page.
  const inputScript = input;
  try {
    await build({
      stdin: { contents: inputScript, resolveDir: process.cwd(), loader: "tsx" },
      bundle: true, jsx: "automatic", outfile: join(dir, "app.js"),
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        { name: "dashboard-867-snapshot", setup(plugin) {
          plugin.onLoad({ filter: /[/\\]admin-gemini-automation-settings\.tsx$/ }, () => ({
            contents: dashboard, loader: "tsx", resolveDir: join(process.cwd(), "components"),
          }));
          plugin.onLoad({ filter: /[/\\]admin-gemini-automation\.module\.css$/ }, () => ({
            contents: dashboardCSS, loader: "local-css", resolveDir: join(process.cwd(), "components"),
          }));
        }},
        { name: "next-router-fixture", setup(plugin) {
          plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path:"link", namespace:"gemini-fixture" }));
          plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path:"navigation", namespace:"gemini-fixture" }));
          plugin.onLoad({ filter: /.*/, namespace:"gemini-fixture" }, (a) => ({
            contents: a.path === "navigation"
              ? 'export function useRouter(){return {refresh(){}}}'
              : 'import React from "react";export default function Link(props){return React.createElement("a", props)}',
            loader:"jsx",
          }));
        }},
      ],
    });

    const script = await readFile(join(dir, "app.js"), "utf8");
    const css = await readFile(join(dir, "app.css"), "utf8");
    browser = await chromium.launch({ headless: true,
      ...(process.env.GEMINI_TEST_CHROMIUM ? {
        executablePath: process.env.GEMINI_TEST_CHROMIUM,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu-sandbox"],
      } : {}),
    });

    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      const mutations = [];
      const conceptLists = [];
      page.on("pageerror", error => errors.push(error.message));

      const directoryDraft = {
        id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name:"Veterina Žilina",
        category:"veterinari", city:"Žilina", reviewState:"NEW", lastEditedAt:"2026-10-17T10:00:00Z",
        psipediaId:"", canonicalVerified:false, psipediaStatus:"Koncept",
        editorialState:"Na kontrolu", geminiNote:"Kontrola mena",
        website:"https://example.test", source:"https://example.test", notes:"",
        rejectionReason:"", seo:{}, qualityResolutions:{phone:"",email:"",website:"",image:"",address:""},
      };
      const rejected = {
        ...directoryDraft, id:"cccccccc-cccc-cccc-cccc-cccccccccccc",
        name:"Veterina Bratislava", city:"Bratislava", reviewState:"REJECTED",
        rejectionReason:"Nevhodné", lastEditedAt:"2026-10-16T10:00:00Z",
      };
      const event = {
        id:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name:"Výstava psov Nitra",
        agenda:"events", stableKey:"events.vystavy", city:"Nitra",
        reviewState:"IMPORTED", psipediaId:"321", canonicalVerified:true,
        lastEditedAt:"2026-10-17T10:00:00Z", reviewAvailable:true, fields:[],
      };
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        if (url.pathname === "/") {
          return route.fulfill({ contentType:"text/html", body:
            '<!doctype html><html lang="sk"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#f5f6f3;color:#132b21;font-family:Arial,sans-serif}' + css + '</style></head><body class="admin-body"><main class="admin-workspace"><header style="padding:12px 0"><strong>Psipedia Admin</strong><h1>Automatizácie Gemini</h1></header><div id="root"></div></main><script>' + script + '</script></body></html>' });
        }
        if (method !== "GET") {
          mutations.push(method + " " + url.pathname);
          return route.fulfill({ status:403, json:{error:"Test fixtures are read-only"} });
        }
        if (url.pathname === "/api/admin/gemini-automation") {
          return route.fulfill({json:{ settings:[
            {stableKey:"directory.veterinari",section:"directory",label:"Veterinári",enabled:true,saved:true,cadenceMinutes:20160,weeklyDay:null,maxNewConcepts:1,lastRunAt:null,nextRunAt:null},
            {stableKey:"events.vystavy",section:"events",label:"Výstavy",enabled:true,saved:true,cadenceMinutes:10080,weeklyDay:null,maxNewConcepts:1,lastRunAt:null,nextRunAt:null},
          ], jobs:[] }});
        }
        if (url.pathname === "/api/admin/gemini-automation/notion-drafts") {
          const key = url.searchParams.get("stable_key");
          conceptLists.push(key);
          return route.fulfill({json:{drafts:key === "events.vystavy" ? [event] : [directoryDraft,rejected]}});
        }
        if (url.pathname.startsWith("/api/admin/gemini-automation/notion-drafts/")) {
          return route.fulfill({json:{draft:directoryDraft}});
        }
        if (url.pathname === "/admin/podujatia/321") {
          return route.fulfill({contentType:"text/html",body:"<h1>Canonical podujatie 321</h1>"});
        }
        return route.fulfill({json:{items:[],regions:[],districts:[],cities:[]}});
      });

      const shot = async name => {
        if (screenshotDir) await page.screenshot({path:join(screenshotDir,`${name}-${width}.png`),fullPage:name.includes("list")});
      };

      await page.goto("https://fixture.test/");
      await page.getByRole("heading", {name:"Automatizácie Gemini"}).waitFor();
      assert.equal(await page.locator('section[aria-label="Koncepty vytvorené automatizáciou"]').count(),1);
      await page.getByRole("button", {name:/Koncepty z automatizácie/}).click();
      await page.getByRole("searchbox", {name:/Hľadať koncept/}).waitFor();
      await shot("01-combined-dashboard-list");

      const search = page.getByRole("searchbox",{name:/Hľadať koncept/});
      await search.fill("zilina");
      assert.equal(await page.getByText("Veterina Žilina",{exact:true}).count(),1);
      assert.equal(await page.getByText("Veterina Bratislava",{exact:true}).count(),0);
      await page.getByLabel("Stav konceptu").selectOption("REJECTED");
      await page.getByText(/Žiadny načítaný koncept nezodpovedá/).waitFor();
      await search.fill("bratislava");
      await page.getByText("Veterina Bratislava",{exact:true}).waitFor();
      await page.getByLabel("Stav konceptu").selectOption("ACTIVE");
      await search.fill("zilina");
      await page.getByRole("button",{name:"Otvoriť editor"}).click();
      await page.getByLabel("Názov profilu",{exact:true}).waitFor();
      await shot("02-combined-notion-editor");

      await page.getByLabel("Názov profilu",{exact:true}).fill("Neuložená úprava");
      let prompted = false;
      page.once("dialog",async dialog => { prompted = true; assert.equal(dialog.type(),"confirm"); await dialog.dismiss(); });
      await page.keyboard.press("Escape");
      assert.equal(prompted,true);
      assert.equal(await page.getByLabel("Názov profilu",{exact:true}).inputValue(),"Neuložená úprava");
      page.once("dialog",async dialog => dialog.accept());
      await page.getByRole("button",{name:"Zavrieť dialóg"}).click();

      await page.getByLabel("Kategória").selectOption("events.vystavy");
      assert.equal(await page.locator('section[aria-label="Koncepty vytvorené automatizáciou"]').count(),1);
      await page.getByRole("button", {name:/Koncepty z automatizácie/}).click();
      const direct = page.getByRole("link",{name:/Upraviť v sekcii/});
      await direct.waitFor();
      assert.equal(await direct.getAttribute("href"),"/admin/podujatia/321");
      assert.equal(await page.locator("iframe").count(),0);
      await shot("03-combined-imported-event");
      await direct.click();
      assert.equal(new URL(page.url()).pathname,"/admin/podujatia/321");
      await page.getByText("Canonical podujatie 321").waitFor();
      assert.deepEqual(mutations,[],"no paid Gemini calls, D1/Notion writes, or publishing");
      assert.deepEqual(conceptLists,["directory.veterinari","events.vystavy"],
        "one concept request per selected category, without parallel list");
      assert.deepEqual(errors,[],"no runtime exceptions in combined fixture");
      await page.close();
    }
  } finally {await browser?.close();await rm(dir,{recursive:true,force:true});}
});
