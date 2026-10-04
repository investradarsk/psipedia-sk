import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = ".e2e-artifacts/public-ux-hardening";
const landings = ["/pomoc-psom", "/adresar", "/podujatia", "/steniatka", "/starostlivost", "/aktivity", "/plemena", "/recenzie", "/clanky"];
const viewports = [[320, 800], [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900]];

// Initial collection deliberately preserves all findings without hiding later routes
// behind the first assertion failure. HTTP/render failures still fail the run.
test("PUBLIC-UX-HARDENING initial/final browser evidence", async ({ page }, info) => {
  test.setTimeout(24 * 60 * 1000);
  mkdirSync(ROOT, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  const records: unknown[] = [];
  const discovered = new Set<string>();
  const failures: string[] = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const routes = [...landings];
    if (width === 390 || width === 1440) routes.push("/", "/organizacie", "/mapa", "/hladat", "/oblubene", ...discovered);
    for (const route of [...new Set(routes)]) {
      const id = `${width}-${route.replaceAll(/[^a-z0-9]+/gi, "_") || "home"}`;
      try {
        const response = await page.goto(route, { waitUntil: "networkidle" });
        expect(response?.status(), route).toBe(200);
        await expect(page.locator("main")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        // Trigger native lazy images across the page, without altering application state.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise(resolve => setTimeout(resolve, 60));
          }
          window.scrollTo(0, 0);
        });
        await page.locator("main img").evaluateAll(async images => {
          await Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => undefined)));
        });
        const metrics = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          const visible = (e: Element) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== "hidden";
          const box = (e: Element | null) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
          const hero = main.querySelector("[data-unified-section-hero]");
          const shell = main.querySelector("[data-unified-section-hero-shell]");
          const next = shell?.nextElementSibling ?? hero?.nextElementSibling ?? null;
          const controls = Array.from(main.querySelectorAll("input,select,button,a")).filter(visible);
          const searches = controls.filter(e => e.matches('input[type="search"],input[name="q"]') || (e instanceof HTMLInputElement && /hľada|názov|plemeno/i.test(e.placeholder)));
          const links = Array.from(main.querySelectorAll("a[href]"));
          const ctas = links.filter(e => /pridať|ako pridať|mapu|porovnať|napísať recenziu|profil/i.test(e.textContent ?? "")).map(e=>({text:e.textContent?.trim(),href:e.getAttribute("href"),box:box(e)}));
          const navs = Array.from(main.querySelectorAll("[data-public-subcategory-navigator]")).map(nav => {
            const track = nav.querySelector("[data-public-subcategory-track]")!;
            const items = Array.from(nav.querySelectorAll("[data-public-subcategory-item]"));
            const t = box(track), second = box(items[1]);
            return {mode:nav.getAttribute("data-public-subcategory-mode"), track:t, count:items.length, current:nav.querySelector('[aria-current="page"]')?.textContent?.trim(), scrollWidth:track.scrollWidth, partialNext:!!(t && second && second.x < t.x+t.width && second.x+second.width > t.x+t.width), items:items.map(e=>({text:e.textContent?.trim(),box:box(e),href:e.getAttribute("href"),tabIndex:(e as HTMLElement).tabIndex}))};
          });
          return {
            width:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth,
            h1:Array.from(main.querySelectorAll("h1")).map(e=>({text:e.textContent,box:box(e)})), hero:box(hero), next:box(next), gap:hero && next ? next.getBoundingClientRect().top-hero.getBoundingClientRect().bottom:null,
            searches:searches.map(e=>({label:e.getAttribute("aria-label"),placeholder:e.getAttribute("placeholder"),box:box(e)})), navs,
            legacyNavs:main.querySelectorAll("[data-public-category-tiles],.section-tabs-inner").length,
            banners:Array.from(main.querySelectorAll("[data-public-context-banner]")).map(box), ctas,
            smallControls:controls.filter(e=>e.getBoundingClientRect().height<44).map(e=>({text:e.textContent?.trim().slice(0,80),tag:e.tagName,box:box(e)})),
            images:Array.from(main.querySelectorAll("img")).map(e=>({src:e.getAttribute("src"),alt:e.alt,loaded:e.complete && e.naturalWidth>0,box:box(e)})),
            links:links.map(e=>({href:e.getAttribute("href"),text:e.textContent?.trim()})),
            headings:Array.from(main.querySelectorAll("h1,h2,h3")).map(e=>({tag:e.tagName,text:e.textContent})),
            canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href"),robots:document.querySelector('meta[name="robots"]')?.getAttribute("content")
          };
        });
        // Discover published siblings and representative details from actual rendered links.
        if (landings.includes(route) || route === "/organizacie") {
          const candidates = metrics.links.map(l=>l.href).filter((href): href is string => !!href && href.startsWith(`${route}/`) && !href.includes("?"));
          for (const href of candidates.slice(0, 2)) discovered.add(href);
          if (route === "/podujatia") {
            const add = candidates.find(href=>href.includes("pridat")); if (add) discovered.add(add);
          }
        }
        const accessibility = width === 390 || width === 1440
          ? (await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze()).violations.filter(v=>v.impact === "serious" || v.impact === "critical") : null;
        const interactions: unknown[] = [];
        const toggles = page.locator('main button[aria-expanded]').filter({ hasText: /Filtre/ });
        for (const toggle of await toggles.all()) if (await toggle.isVisible()) {
          const before = await toggle.getAttribute("aria-expanded");
          await toggle.click();
          interactions.push({label:await toggle.innerText(),before,after:await toggle.getAttribute("aria-expanded"),controls:await toggle.getAttribute("aria-controls")});
          await toggle.click();
        }
        const current = page.locator('main [data-public-subcategory-mode="compact"] [aria-current="page"]');
        if (await current.count()) {
          await current.first().focus();
          interactions.push({currentFocus:await current.first().evaluate(e=>e===document.activeElement),focusedBox:await current.first().boundingBox()});
          await page.evaluate(()=>window.scrollTo(0,0));
        }
        const screenshot = `${ROOT}/${id}.png`;
        await page.screenshot({path:screenshot,fullPage:true});
        const record = {route,width,height,url:page.url(),metrics,accessibility,interactions,screenshot};
        records.push(record);
        writeFileSync(`${ROOT}/${id}.json`,JSON.stringify(record,null,2));
        console.log(`AUDIT ${route} ${width} overflow=${metrics.scrollWidth-metrics.width} searches=${metrics.searches.length} axe=${accessibility?.length ?? "not-run"}`);
      } catch (error) {
        failures.push(`${route}@${width}: ${String(error)}`);
        await page.screenshot({path:`${ROOT}/${id}-error.png`,fullPage:true}).catch(()=>undefined);
      }
      writeFileSync(`${ROOT}/summary.json`,JSON.stringify({baseURL:info.project.use.baseURL,records,failures},null,2));
    }
  }
  expect(failures,"All requested routes must render; see preserved measurements").toEqual([]);
});
