import {mkdirSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
const root=".e2e-artifacts/services-v3-admin-3b";
const label=(width:number)=>width===1440?"desktop-1440":"mobile-"+width;
const capture=async(page:Page,name:string,fullPage=true)=>{
  mkdirSync(root,{recursive:true});
  // Restore the natural top-of-page viewport before full-page capture. Sticky headers
  // otherwise get stitched into the middle of the full-page PNG after clicking a row.
  await page.evaluate(()=>{window.scrollTo(0,0);if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
  await page.waitForTimeout(100);
  if(name.startsWith("catalog-mobile-"))await page.screenshot({path:root+"/"+name+"-viewport.png",fullPage:false,animations:"disabled"});
  await page.screenshot({path:root+"/"+name+".png",fullPage,animations:"disabled"});
};
const noOverflow=async(page:Page,name:string)=>{
  const {scroll,client}=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(scroll,name+" horizontal document overflow").toBeLessThanOrEqual(client+1);
};
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("psipedia-cookie-consent","necessary"));
});
test("Services V3 catalog approved A — desktop and mobile visual QA",async({page},info)=>{
 test.setTimeout(150000);
 const sizes=info.project.name==="mobile-chromium"?[{width:390,height:844},{width:320,height:720}]:[{width:1440,height:900}];
 for(const viewport of sizes){
   await page.setViewportSize(viewport);
   const r=await page.goto("/admin/sluzby-pre-psov/katalog",{waitUntil:"domcontentloaded"});
   expect(r?.status()).toBe(200);
   await expect(page.getByRole("heading",{level:1,name:"Katalóg služieb a vlastností"})).toBeVisible();
   await expect(page.getByRole("navigation",{name:"Drobečková navigácia"}).getByText("Katalóg",{exact:true})).toBeVisible();
   const panel=page.locator('[data-write-enabled="false"]');
   const disclosure=panel.locator("details");
   const summary=disclosure.locator("summary");
   await expect(panel.getByRole("heading",{name:"Zápisy sú vypnuté"})).toBeVisible();
   await expect(panel.getByText("Vytváranie a úpravy možností katalógu sú momentálne nedostupné.")).toBeVisible();
   await expect(summary).toHaveText("Podrobnosti o katalógu");
   await expect(disclosure).not.toHaveAttribute("open");
   await expect(panel.getByText("Kanonický register možností je v D1.")).toBeHidden();
   await expect(page.getByRole("button",{name:"+ Nová možnosť"})).toBeDisabled();
   const toggle=page.getByRole("button",{name:/^Filtre/});
   const typeFilter=page.getByRole("combobox",{name:"Typ"});
   if(viewport.width<=800){
     await expect(toggle).toBeVisible();
     await expect(toggle).toHaveAttribute("aria-expanded","false");
     await expect(typeFilter).toBeHidden();
     await toggle.click();
     await expect(typeFilter).toBeVisible();
     await typeFilter.selectOption("attribute");
     await expect(toggle).toContainText("(1)");
     await toggle.click();
     await expect(typeFilter).toBeHidden();
     await expect(toggle).toContainText("(1)");
     await toggle.click();
     await typeFilter.selectOption("all");
     await toggle.click();
   }else {
     await expect(toggle).toBeHidden();
     await expect(typeFilter).toBeVisible();
   }
   const skip=page.locator(".admin-skip-link");
   await expect(skip).toHaveCSS("clip-path","inset(50%)");
   await skip.focus();
   await expect(skip).toBeFocused();
   await expect(skip).toHaveCSS("clip-path","none");
   await skip.evaluate((link:HTMLElement)=>link.blur());
   const list=page.locator('[aria-label="Možnosti katalógu"]');
   const detail=page.locator('[aria-label="Detail vybranej možnosti"]');
   const first=list.locator("button").first();
   await expect(first).toBeVisible();
   await first.click();
   await expect(first).toHaveAttribute("aria-pressed","true");
   await expect(detail.locator("h2")).toBeVisible();
   await expect(detail.getByRole("button",{name:"Schváliť"})).toBeDisabled();
   await expect(detail.getByRole("button",{name:"Archivovať"})).toBeDisabled();
   const l=await list.boundingBox(),d=await detail.boundingBox();
   expect(l).not.toBeNull();expect(d).not.toBeNull();
   if(viewport.width<=800){
      expect(d!.y,"mobile detail stacked beneath list").toBeGreaterThanOrEqual(l!.y+l!.height-3);
      expect(Math.abs(d!.x-l!.x),"mobile list/detail align").toBeLessThan(4);
   }else expect(d!.x,"desktop detail sits alongside list").toBeGreaterThan(l!.x+l!.width-3);
   await noOverflow(page,label(viewport.width));
   await capture(page,"catalog-panel-collapsed-"+label(viewport.width));
   // Native <summary> works with keyboard and announces expanded state through <details open>.
   await summary.focus();
   await expect(summary).toBeFocused();
   await summary.press("Enter");
   await expect(disclosure).toHaveAttribute("open","");
   await expect(panel.getByText("Kanonický register možností je v D1.")).toBeVisible();
   await expect(panel.getByText("Vstavané statické možnosti nie sú editovateľné.")).toBeVisible();
   await expect(panel.getByText("Vytvorenie konceptu neznamená automatické schválenie ani verejné publikovanie.")).toBeVisible();
   await noOverflow(page,"expanded-"+label(viewport.width));
   await capture(page,"catalog-panel-expanded-"+label(viewport.width));
   await summary.press("Space");
   await expect(disclosure).not.toHaveAttribute("open");
   await expect(panel.getByText("Kanonický register možností je v D1.")).toBeHidden();
   await noOverflow(page,"collapsed-again-"+label(viewport.width));
   await page.getByRole("searchbox",{name:"Vyhľadávanie",exact:true}).fill("RTG vyšetrenie");
   await expect(list.locator("button").first()).toContainText("RTG vyšetrenie");
   await page.getByRole("searchbox",{name:"Vyhľadávanie",exact:true}).fill("not-a-real-service-741xyz");
   await expect(page.getByText("Pre zadané filtre neboli nájdené možnosti.")).toBeVisible();
 }
});
test("Services V3 explicit Unknown profile editor — desktop/mobile screenshots",async({page},info)=>{
 test.setTimeout(120000);
 const viewport=info.project.name==="mobile-chromium"?{width:390,height:844}:{width:1440,height:900};
 await page.setViewportSize(viewport);
 const r=await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture",{waitUntil:"domcontentloaded"});
 expect(r?.status()).toBe(200);
 await page.getByRole("link",{name:"Directory Admin Editor Fixture"}).click();
 const card=page.getByRole("region",{name:"Services V3 — služby a vlastnosti na profile"});
 await expect(card).toBeVisible();
 await expect(card.getByRole("heading",{name:"Services V3 — hodnoty profilu"})).toBeVisible();
 await expect(card.getByText("Kanonické zápisy sú vypnuté")).toBeVisible();
 const input=card.locator('select[aria-label^="Hodnota:"]');
 expect(await input.count()).toBeGreaterThan(0);
 await expect(input.first()).toBeDisabled();
 await expect(input.first()).toHaveValue("unknown");
 await expect(card.getByRole("button",{name:/Uložiť hodnoty/})).toBeDisabled();
 await noOverflow(page,label(viewport.width));
 mkdirSync(root,{recursive:true});
 await card.screenshot({path:root+"/profile-card-"+label(viewport.width)+".png",animations:"disabled"});
 await capture(page,"profile-full-"+label(viewport.width));
});
