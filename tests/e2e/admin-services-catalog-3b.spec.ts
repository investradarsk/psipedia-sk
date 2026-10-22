import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
const root=".e2e-artifacts/services-v3-admin-3b";
const label=(width:number)=>width===1440?"desktop-1440":"mobile-"+width;
const capture=async(page:Page,name:string,fullPage=true)=>{
  mkdirSync(root,{recursive:true});
  // Restore the natural top-of-page viewport before full-page capture. Sticky headers
  // otherwise get stitched into the middle of the full-page PNG after clicking a row.
  await page.evaluate(()=>{window.scrollTo({top:0,behavior:"instant"});if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
  await page.waitForFunction(()=>Math.abs(window.scrollY)<=1,undefined,{polling:"raf"});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.screenshot({path:root+"/"+name+".png",fullPage,animations:"disabled",scale:"css"});
};

// Viewport evidence is intentionally separate from full-page stitching. It captures
// exactly what a mobile user sees both at the start and after scrolling.
const captureMobileViewportEvidence=async(page:Page,state:"collapsed"|"expanded",width:320|390)=>{
  const height=width===320?720:844;
  const name="catalog-panel-"+state+"-mobile-"+width;
  const search=page.getByRole("searchbox",{name:"Vyhľadávanie",exact:true});
  const toggle=page.getByRole("button",{name:/^Filtre/});
  const measure=async(phase:"top"|"scrolled")=>page.evaluate((phase)=>{
    const topbar=document.querySelector<HTMLElement>("[data-admin-topbar]");
    const section=document.querySelector<HTMLElement>('section[aria-label="Katalóg služieb a vlastností"]');
    const heading=document.querySelector<HTMLElement>("h1");
    const panel=section?.querySelector<HTMLElement>("[data-write-enabled]");
    const search=section?.querySelector<HTMLInputElement>('input[type="search"]');
    const summary=section?.querySelector<HTMLElement>("summary");
    const buttons=Array.from(section?.querySelectorAll<HTMLButtonElement>("button")??[]);
    const filters=buttons.find(button=>/^Filtre(?:\s|$)/.test(button.textContent?.trim()??""));
    const create=buttons.find(button=>button.textContent?.includes("+ Nová možnosť"));
    if(!topbar||!section||!heading||!panel||!search||!summary||!filters||!create){
      throw new Error("Viewport evidence: required admin controls missing");
    }
    const rectangle=(element:Element)=>{
      const r=element.getBoundingClientRect();
      const x=r.left+r.width/2,y=r.top+r.height/2;
      const inViewport=x>=0&&x<innerWidth&&y>=0&&y<innerHeight;
      const hit=inViewport?document.elementFromPoint(x,y):null;
      return {
        top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,
        inViewport,centerHittable:!inViewport||hit===element||element.contains(hit),
        centerCoveredByHeader:inViewport&&Boolean(hit&&(hit===topbar||topbar.contains(hit)))
      };
    };
    return {
      phase,scrollY:scrollY,viewport:{width:innerWidth,height:innerHeight},
      header:{...rectangle(topbar),position:getComputedStyle(topbar).position},
      heading:rectangle(heading),panel:rectangle(panel),summary:rectangle(summary),
      search:rectangle(search),filters:rectangle(filters),create:rectangle(create)
    };
  },phase);
  await page.evaluate(()=>{
    window.scrollTo({top:0,behavior:"instant"});
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  });
  await page.waitForFunction(()=>Math.abs(window.scrollY)<=1,undefined,{polling:"raf"});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const top=await measure("top");
  expect(top.viewport,"browser viewport dimensions").toMatchObject({width,height});
  expect(top.header.position,"mobile header must remain sticky").toBe("sticky");
  expect(top.header.top,"top viewport header placement").toBeGreaterThanOrEqual(-2);
  expect(top.header.top,"top viewport header placement").toBeLessThanOrEqual(2);
  expect(top.heading.top,"heading must begin below header").toBeGreaterThanOrEqual(top.header.bottom);
  expect(top.panel.top,"status panel must begin below header").toBeGreaterThanOrEqual(top.header.bottom);
  for(const key of ["search","filters","create"] as const){
    const item=top[key];
    if(item.inViewport&&item.top>=top.header.bottom&&item.bottom<=height){
      expect(item.centerCoveredByHeader,name+" top "+key+" header overlap").toBe(false);
      expect(item.centerHittable,name+" top "+key+" must be hit-testable").toBe(true);
    }
  }
  mkdirSync(root,{recursive:true});
  await page.screenshot({path:root+"/"+name+"-viewport-top.png",fullPage:false,animations:"disabled",scale:"css"});
  // Scroll so the search field is in the first unobstructed band below the
  // sticky header. This checks actual painted/hit-tested positions, not full-page layout.
  const scrollPlan=await page.evaluate(()=>{
    const header=document.querySelector<HTMLElement>("[data-admin-topbar]");
    const input=document.querySelector<HTMLInputElement>('section[aria-label="Katalóg služieb a vlastností"] input[type="search"]');
    if(!header||!input)throw new Error("Cannot find mobile header and catalog search");
    const requested=Math.max(0,window.scrollY+input.getBoundingClientRect().top-header.getBoundingClientRect().bottom-16);
    const scroller=document.scrollingElement??document.documentElement;
    const maxScroll=Math.max(0,scroller.scrollHeight-window.innerHeight);
    const target=Math.min(requested,maxScroll);
    // Use an immediate scroll regardless of document scroll-behavior:smooth.
    window.scrollTo({top:target,behavior:"instant"});
    return {requested,target,maxScroll};
  });
  // scrollY > 0 can be the FIRST FRAME of smooth scrolling; wait for the
  // requested destination, clamped to the document's current maximum.
  await page.waitForFunction(({target})=>{
    const scroller=document.scrollingElement??document.documentElement;
    const maxScroll=Math.max(0,scroller.scrollHeight-window.innerHeight);
    return Math.abs(window.scrollY-Math.min(target,maxScroll))<=1;
  },scrollPlan,{polling:"raf",timeout:10000});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const scrolled=await measure("scrolled");
  expect(scrolled.header.top,name+" scrolled header top").toBeGreaterThanOrEqual(-2);
  expect(scrolled.header.top,name+" scrolled header top").toBeLessThanOrEqual(2);
  expect(scrolled.search.top,name+" search below sticky header").toBeGreaterThanOrEqual(scrolled.header.bottom+4);
  expect(scrolled.search.bottom,name+" search visible after scroll").toBeLessThan(height);
  for(const key of ["search","filters","create"] as const){
    const item=scrolled[key];
    if(item.inViewport&&item.top>=scrolled.header.bottom&&item.bottom<=height){
      expect(item.centerCoveredByHeader,name+" scrolled "+key+" header overlap").toBe(false);
      expect(item.centerHittable,name+" scrolled "+key+" must be hit-testable").toBe(true);
    }
  }
  await page.screenshot({path:root+"/"+name+"-viewport-scrolled.png",fullPage:false,animations:"disabled",scale:"css"});
  // Verify Playwright can actually use the controls at this scroll position.
  await search.click();
  await expect(search).toBeFocused();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  writeFileSync(root+"/"+name+"-viewport-rectangles.json",JSON.stringify({top,scrolled,scrollPlan},null,2)+"\n");
  await page.evaluate(()=>{
    window.scrollTo({top:0,behavior:"instant"});
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  });
  await page.waitForFunction(()=>Math.abs(window.scrollY)<=1,undefined,{polling:"raf"});
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
   const panel=page.locator("[data-write-enabled]");
   await expect(panel).toBeVisible();
   const writeEnabled=await panel.getAttribute("data-write-enabled")==="true";
   const disclosure=panel.locator("details");
   const summary=disclosure.locator("summary");
   if(writeEnabled){
     await expect(panel.getByRole("heading",{name:"Vytváranie konceptov je dostupné"})).toBeVisible();
     await expect(panel.getByText("Koncepty možno vytvárať a upravovať.",{exact:false})).toBeVisible();
   }else{
     await expect(panel.getByRole("heading",{name:"Zápisy sú vypnuté"})).toBeVisible();
     await expect(panel.getByText("Vytváranie a úpravy možností katalógu sú momentálne nedostupné.")).toBeVisible();
   }
   await expect(summary).toHaveText("Podrobnosti o katalógu");
   await expect(disclosure).not.toHaveAttribute("open");
   await expect(panel.getByText("Kanonický register možností je v D1.")).toBeHidden();
   if(writeEnabled){
     await expect(page.getByRole("button",{name:"+ Nová možnosť"})).toBeEnabled();
   }else{
     await expect(page.getByRole("button",{name:"+ Nová možnosť"})).toBeDisabled();
   }
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
   if(viewport.width===320||viewport.width===390){
     await captureMobileViewportEvidence(page,"collapsed",viewport.width);
   }
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
   if(viewport.width===320||viewport.width===390){
     await captureMobileViewportEvidence(page,"expanded",viewport.width);
   }
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
 const input=card.locator('select[aria-label^="Hodnota:"]');
 expect(await input.count()).toBeGreaterThan(0);
 await expect(input.first()).toHaveValue("unknown");
 const save=card.getByRole("button",{name:/Uložiť hodnoty/});
 if(await card.getByText("Úpravy povolené",{exact:true}).count()){
   await expect(card.getByText("Kanonické zápisy sú vypnuté")).toHaveCount(0);
   await expect(input.first()).toBeEnabled();
   await expect(save).toBeDisabled();
   // Exercise the editable draft without invoking any mutation endpoint.
   await input.first().selectOption("yes");
   await expect(save).toBeEnabled();
   await input.first().selectOption("unknown");
   await expect(save).toBeDisabled();
 }else{
   await expect(card.getByText("Iba na čítanie",{exact:true})).toBeVisible();
   await expect(card.getByText("Kanonické zápisy sú vypnuté")).toBeVisible();
   await expect(input.first()).toBeDisabled();
   await expect(save).toBeDisabled();
 }
 await noOverflow(page,label(viewport.width));
 mkdirSync(root,{recursive:true});
 await card.screenshot({path:root+"/profile-card-"+label(viewport.width)+".png",animations:"disabled"});
 await capture(page,"profile-full-"+label(viewport.width));
});
