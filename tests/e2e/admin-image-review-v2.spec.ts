import { test, expect, type Page, type TestInfo } from "@playwright/test";

const target = "/tests/e2e/fixtures/admin-image-review-v2/index.html?section=media&category=all&mediaStatus=review";
const article = ".admin-quality-media-card.has-candidate";
const fixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#d9e8df"/><circle cx="230" cy="143" r="78" fill="#719e83"/><path d="M120 245h240" stroke="#1b4935" stroke-width="12"/></svg>';
const save = (page:Page,info:TestInfo,name:string) => page.screenshot({path:info.outputPath(name+".png"),fullPage:true});
async function gotoFixture(page:Page) {
  await page.route("**/media/fixture/**", route => route.fulfill({status:200,contentType:"image/svg+xml",body:fixtureSvg}));
  await page.goto(target);
  await expect(page.getByRole("heading",{name:"Obrázky na kontrolu"})).toBeVisible();
  await expect(page.locator(article)).toHaveCount(3);
}
async function selectThree(page:Page) {
  const boxes=page.locator(article+" input[type=checkbox]");
  await expect(boxes).toHaveCount(3);
  for(let i=0;i<3;i++) await boxes.nth(i).check();
  await expect(page.locator("[data-admin-bulk-toolbar]")).toContainText("3 vybrané");
}
async function noOverflow(page:Page) {
  const x=await page.evaluate(() => ({body:document.documentElement.scrollWidth, viewport:window.innerWidth}));
  expect(x.body,"No horizontal page overflow").toBeLessThanOrEqual(x.viewport+1);
}
async function touchTargets(page:Page) {
  const controls=page.locator(".admin-quality-media-actions button, .admin-quality-media-actions a, [data-admin-bulk-toolbar] button, dialog[open] button, .admin-quality-media-content > label, label:has(> input[type=checkbox])");
  const dimensions=await controls.evaluateAll(els => els.filter(e => e.getBoundingClientRect().width).map(e => ({text:(e.textContent||"").trim().slice(0,32),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
  for(const t of dimensions){ expect(t.w,t.text+" width").toBeGreaterThanOrEqual(44);expect(t.h,t.text+" height").toBeGreaterThanOrEqual(44); }
}
for(const width of [1440,390,320]){
  test.describe("Image Review V2 "+width+"px",()=>{
    test.use({viewport:{width,height:900}});
    test("01 list + touch targets + no overflow",async({page},info)=>{
      await gotoFixture(page); await noOverflow(page); await touchTargets(page);
      await expect(page.getByRole("button",{name:"Schváliť obrázok – Psí salón Luna"})).toBeVisible();
      await expect(page.getByRole("button",{name:"Zamietnuť obrázok – Psí salón Luna"})).toBeVisible();
      await save(page,info,"01-list");
    });
    test("02 individual approval and one network call",async({page},info)=>{
      await gotoFixture(page);
      let calls=0; let body:Record<string,unknown> = {};
      await page.route("**/api/admin/data-quality/media/**",async route=>{
        calls++;body=route.request().postDataJSON();
        await route.fulfill({status:200,json:{requested:1,updated:1,failed:[]}});
      });
      await page.getByRole("button",{name:"Schváliť obrázok – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      await expect(dialog).toContainText("Počet označených obrázkov: 1");
      await save(page,info,"02-approval-dialog");
      await dialog.getByRole("button",{name:"Schváliť označené"}).click();
      await expect(page.getByRole("status")).toContainText("Schválené obrázky: 1 z 1.");
      expect(calls).toBe(1);expect(body.expectedCandidateImageKey).toBe("fixture/new-luna.svg");
      await save(page,info,"02-approval-result");
    });
    test("03 individual rejection + durable reason in request",async({page},info)=>{
      await gotoFixture(page);
      let calls=0;let payload:Record<string,unknown> = {};
      await page.route("**/api/admin/data-quality/media/**",async route=>{
        calls++; payload=route.request().postDataJSON();
        await route.fulfill({status:200,json:{requested:1,updated:1,failed:[]}});
      });
      await page.getByRole("button",{name:"Zamietnuť obrázok – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      await expect(dialog).toContainText("Dôvod zamietnutia (voliteľný)");
      await dialog.getByRole("textbox",{name:"Dôvod zamietnutia (voliteľný)"}).fill("Nesprávny profil");
      await save(page,info,"03-rejection-dialog");
      await dialog.getByRole("button",{name:"Zamietnuť označené"}).click();
      await expect(page.getByRole("status")).toContainText("Zamietnuté obrázky: 1 z 1.");
      expect(calls).toBe(1); expect(payload).toMatchObject({action:"reject",ids:[101],reason:"Nesprávny profil"});
      await save(page,info,"03-rejection-result");
    });
    test("04 bulk count and toolbar",async({page},info)=>{
      await gotoFixture(page);await selectThree(page);await touchTargets(page);
      await noOverflow(page);await save(page,info,"04-bulk-toolbar");
      await page.getByRole("button",{name:"Zrušiť výber"}).click();
      await expect(page.locator("[data-admin-bulk-toolbar]")).toHaveCount(0);
    });
    test("05 confirmation, focus trap, Escape and cancel without API",async({page},info)=>{
      await gotoFixture(page);await selectThree(page);
      let calls=0;await page.route("**/api/admin/data-quality/media/**",route=>{calls++;return route.abort();});
      const trigger=page.getByRole("button",{name:"Zamietnuť označené"});
      await trigger.click();
      const dialog=page.getByRole("dialog");
      await expect(dialog).toContainText("Počet označených obrázkov: 3");
      for(let i=0;i<7;i++){await page.keyboard.press("Tab");expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBeTruthy();}
      await save(page,info,"05-bulk-confirm");
      await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
      await expect(page.locator("[data-admin-bulk-toolbar]")).toContainText("3 vybrané");
      expect(calls).toBe(0);
      await trigger.click();await dialog.getByRole("button",{name:"Zrušiť"}).click();
      await expect(dialog).toBeHidden();expect(calls).toBe(0);
    });
    test("06 detail comparison keeps selection and query",async({page},info)=>{
      await gotoFixture(page);
      await page.locator(article+" input[type=checkbox]").first().check();
      await page.getByRole("button",{name:"Detailne porovnať obrázky – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      await expect(dialog.getByText("Aktuálny obrázok",{exact:true})).toBeVisible();
      await expect(dialog.getByText("Navrhovaný obrázok",{exact:true})).toBeVisible();
      await save(page,info,"06-detail-compare");
      await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
      await expect(page.locator("[data-admin-bulk-toolbar]")).toContainText("1 vybranú");
      expect(new URL(page.url()).searchParams.get("mediaStatus")).toBe("review");
    });
    test("07 API failure reports error and retry stays explicit",async({page},info)=>{
      await gotoFixture(page);
      let calls=0;await page.route("**/api/admin/data-quality/media/**",async route=>{
        calls++;await route.fulfill({status:503,json:{error:"Testovacia chyba API"}});
      });
      await page.getByRole("button",{name:"Schváliť obrázok – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("button",{name:"Schváliť označené"}).click();
      await expect(dialog.getByRole("alert")).toContainText("Testovacia chyba API");
      expect(calls).toBe(1);await save(page,info,"07-api-error");
    });
    test("08 partial success retains failed selection",async({page},info)=>{
      await gotoFixture(page);await selectThree(page);
      let calls=0; await page.route("**/api/admin/data-quality/media/**",async route=>{
        calls++;await route.fulfill({status:200,json:{requested:3,updated:2,failed:[{id:103,error:"Konflikt kandidáta"}]}});
      });
      await page.getByRole("button",{name:"Schváliť označené"}).click();
      await page.getByRole("dialog").getByRole("button",{name:"Schváliť označené"}).click();
      await expect(page.getByRole("status").filter({hasText:"Čiastočný úspech"})).toContainText("2 z 3");
      await expect(page.getByText("ID 103: Konflikt kandidáta")).toBeVisible();
      await expect(page.locator(article+" input[type=checkbox]").nth(2)).toBeChecked();
      await expect(page.locator("[data-admin-bulk-toolbar]")).toContainText("1 vybranú");
      expect(calls).toBe(1); await save(page,info,"08-partial-result");
    });
    test("09 pending operation cannot submit twice",async({page},info)=>{
      await gotoFixture(page);
      let calls=0;let release!:()=>void;
      const wait=new Promise<void>(resolve=>{release=resolve;});
      await page.route("**/api/admin/data-quality/media/**",async route=>{
        calls++;await wait;await route.fulfill({status:200,json:{requested:1,updated:1,failed:[]}});
      });
      await page.getByRole("button",{name:"Schváliť obrázok – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("button",{name:"Schváliť označené"}).click();
      await expect(dialog.getByRole("button",{name:"Schvaľujem…"})).toBeDisabled();
      expect(calls).toBe(1);
      await save(page,info,"09-pending");
      release();
      await expect(page.getByRole("status")).toContainText("Schválené obrázky: 1 z 1.");
      expect(calls).toBe(1);
    });
    test("10 decision history loads only on explicit authenticated API request",async({page},info)=>{
      await gotoFixture(page);
      let calls=0;
      await page.route("**/api/admin/data-quality/media/101/history",async route=>{
        calls++; await route.fulfill({status:200,json:{monitorId:101,history:[
          {id:"example",action:"reject",reason:"Nesprávny profil",actor_ref:"admin@example.invalid",decided_at:"2026-10-20T12:00:00Z",outcome:"APPLIED"}
        ]}});
      });
      await page.getByRole("button",{name:"Detailne porovnať obrázky – Psí salón Luna"}).click();
      const dialog=page.getByRole("dialog");
      expect(calls).toBe(0);
      await dialog.getByRole("button",{name:"Zobraziť históriu rozhodnutí"}).click();
      await expect(dialog).toContainText("Nesprávny profil");
      expect(calls).toBe(1);
      await save(page,info,"10-decision-history");
    });
  });
}
