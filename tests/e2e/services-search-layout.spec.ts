import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// SERVICES-V2 (3/10): this suite verifies the currently approved single-search
// and three-column directory contract. Legacy root category previews and the
// embedded .directory-results toolbar were intentionally retired.
const searchForm = 'form[data-public-search-form="services"]';
const filterForm = '[data-directory-filter-form]';
const filterPanel = '[data-directory-filter-disclosure]';
const categories = '[data-directory-category-navigation]';
const results = '[data-directory-results]';

async function openDirectory(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBe(200);
  await expect(page.locator(searchForm)).toHaveCount(1);
  await expect(page.locator(results)).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label + " horizontal overflow").toBeLessThanOrEqual(1);
}

async function expectSeriousCriticalAxeClean(page: Page, include: string, label: string) {
  const analysis = await new AxeBuilder({ page })
    .include(include)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = analysis.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations, label + ": " + JSON.stringify(violations, null, 2)).toEqual([]);
}

async function openMobileFilters(page: Page) {
  const form = page.locator(filterForm);
  await expect(form).toHaveAttribute("data-public-search-ready", "true");
  const panel = page.locator(filterPanel);
  await expect(panel).not.toHaveAttribute("open", "");
  await panel.locator("summary").click();
  await expect(panel).toHaveAttribute("open", "");
  return form;
}

test.describe("public services search layout — SERVICES-V2 3/10", () => {
  test("desktop uses exactly one independent search and visible left sidebar filters", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop contract");
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDirectory(page, "/adresar");
    const search = page.locator(searchForm);
    await expect(search.locator('input[name="q"]')).toBeVisible();
    await expect(search.getByRole("button", { name: "Hľadať" })).toBeVisible();
    await expect(page.locator(filterForm + ' input[name="q"]')).toHaveCount(0); // no empty q when no search is active
    await expect(page.locator(filterForm + ' select[name="region"]')).toBeVisible();
    await expect(page.locator(filterForm + ' select[name="district"]')).toBeVisible();
    await expect(page.locator(filterForm + ' select[name="city"]')).toBeVisible();
    await expect(page.locator(filterForm + ' select[name="sort"]')).toBeVisible();
    await expect(page.locator('[data-directory-columns]')).toBeVisible();
    const columns = await page.locator('[data-directory-columns]').evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
    expect(columns).toBe(3);
    await expectNoHorizontalOverflow(page, "desktop search and filters");
    await expectSeriousCriticalAxeClean(page, "main#obsah", "desktop directory");
  });

  test("mobile keeps one search above an accessible, collapsible filter panel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile contract");
    await page.setViewportSize({ width: 390, height: 844 });
    await openDirectory(page, "/adresar");
    const search = page.locator(searchForm);
    await expect(search.locator('input[name="q"]')).toBeVisible();
    await expect(page.locator(categories)).toBeVisible();
    const form = await openMobileFilters(page);
    for (const name of ["region","district","city","sort"]) {
      await expect(form.locator('select[name="' + name + '"]')).toBeVisible();
    }
    await page.locator(filterPanel + " summary").click();
    await expect(page.locator(filterPanel)).not.toHaveAttribute("open", "");
    await expectNoHorizontalOverflow(page, "mobile filter disclosure");
    await expectSeriousCriticalAxeClean(page, "main#obsah", "mobile directory");
    await testInfo.attach("services-v2-mobile-390", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test("category navigation exposes all ten canonical routes and root lists published profiles", async ({ page }) => {
    await openDirectory(page, "/adresar");
    const hero = page.locator("[data-unified-section-hero]");
    await expect(hero.getByRole("heading", { level: 1, name: "Služby pre psov" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Prepnúť kategóriu služby" });
    await expect(nav).toHaveAttribute("data-public-subcategory-mode","compact");
    const expected = [
      "/adresar", "/adresar/veterinari", "/adresar/treneri",
      "/adresar/kynologicke-kluby", "/adresar/chovatelske-kluby",
      "/adresar/chovatelske-stanice", "/adresar/salony-a-sluzby",
      "/adresar/hotely-a-opatrovanie", "/adresar/vencenie",
      "/adresar/fyzioterapia", "/adresar/dalsie-sluzby",
    ];
    expect(await nav.getByRole("link").evaluateAll(links => links.map(el => el.getAttribute("href")))).toEqual(expected);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator("#directory-results-heading")).toBeVisible();
    await expect(page.locator("[data-directory-category-overview]")).toHaveCount(0);
    expect(await page.locator(results + " [data-directory-card]").count()).toBeGreaterThan(0);
    const provider = page.locator("[data-directory-provider-cta]");
    await expect(provider.getByRole("link", {name:/Pridať alebo upraviť profil/})).toHaveAttribute("href","/o-nas#kontakt");
    const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(jsonLd).toContain("CollectionPage");
    expect(jsonLd).toContain("/adresar/veterinari");
    await expectNoHorizontalOverflow(page,"root landing");
  });

  test("accent-insensitive search and server-backed location selections remain correct", async ({ page }) => {
    await openDirectory(page,"/adresar/veterinari?q=publikovana");
    await expect(page.getByText("E2E Veterina publikovaná",{exact:true})).toBeVisible();
    await openDirectory(page,"/adresar/veterinari?region=Bratislavsk%C3%BD%20kraj&city=Bratislava");
    await expect(page.locator(filterForm + ' select[name="region"]')).toHaveValue("Bratislavský kraj");
    await expect(page.locator(filterForm + ' select[name="city"]')).toHaveValue("Bratislava");
    await expect(page.getByText("E2E Veterina publikovaná",{exact:true})).toBeVisible();
    await expectNoHorizontalOverflow(page,"location query");
  });

  test("profile cards are whole-row links and search/filters remain keyboard accessible", async ({page},testInfo) => {
    if(testInfo.project.name==="mobile-chromium") await page.setViewportSize({width:390,height:844});
    await openDirectory(page,"/adresar/treneri");
    const cards=page.locator("[data-directory-card]");
    expect(await cards.count()).toBeGreaterThan(0);
    const first=cards.first();
    await expect(first).toHaveAttribute("href", /\/adresar\/treneri\//);
    await expect(first.locator("a")).toHaveCount(0);
    const search=page.locator(searchForm+' input[name="q"]');
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe("BODY");
    await expect(page.locator(filterForm + ' select[name="region"]')).toHaveCount(1);
    if(testInfo.project.name==="mobile-chromium"){
      const rect=await first.boundingBox();
      expect(rect!.height).toBeLessThan(260);
    }
    await expectNoHorizontalOverflow(page,"keyboard/cards");
    await expectSeriousCriticalAxeClean(page,"main#obsah","keyboard/cards");
  });

  test("mobile applies sorting with GET and preserves reset, backward and forward navigation",async({page},testInfo)=>{
    test.skip(testInfo.project.name!=="mobile-chromium","Mobile state contract");
    await page.setViewportSize({width:390,height:844});
    await openDirectory(page,"/adresar/veterinari");
    const form=await openMobileFilters(page);
    await form.locator('select[name="sort"]').selectOption("name-asc");
    await Promise.all([
      page.waitForURL(url=>url.pathname==="/adresar/veterinari"&&url.searchParams.get("sort")==="name-asc"),
      form.getByRole("button",{name:"Použiť filtre"}).click(),
    ]);
    await expect(page.locator(filterForm+' select[name="sort"]')).toHaveValue("name-asc");
    await expect(page.locator(filterPanel+' summary')).toContainText("(1)");
    await page.locator(filterPanel+" summary").click();
    await page.locator(filterForm+' a[href="/adresar/veterinari"]').click();
    await expect(page).toHaveURL(/\/adresar\/veterinari$/);
    await page.goBack();
    await expect(page).toHaveURL(/sort=name-asc/);
    await page.goForward();
    await expect(page).toHaveURL(/\/adresar\/veterinari$/);
    await expectNoHorizontalOverflow(page,"sort and reset");
  });

  test("services main search works at 375/390/430/768px with no duplicate form",async({page},testInfo)=>{
    test.skip(testInfo.project.name!=="mobile-chromium","Mobile/tablet contract");
    for(const width of [375,390,430,768]){
      await page.setViewportSize({width,height:900});
      await openDirectory(page,"/adresar/veterinari?q=publikovana");
      await expect(page.locator(searchForm+' input[name="q"]')).toHaveValue("publikovana");
      await expect(page.locator(searchForm)).toHaveCount(1);
      await expect(page.locator(filterForm)).toHaveCount(1);
      await expect(page.locator(categories+' [data-public-subcategory-item]')).toHaveCount(11);
      await expectNoHorizontalOverflow(page,"services "+width);
    }
  });

  test("long native filter values and long card titles do not overflow mobile",async({page},testInfo)=>{
    test.skip(testInfo.project.name!=="mobile-chromium","Mobile overflow contract");
    await page.setViewportSize({width:390,height:844});
    await openDirectory(page,"/adresar/veterinari");
    const form=await openMobileFilters(page);
    const value="VelmiDlhaLokalitaBezMedzierKtoraNesmieRozsiritSelectAniFormularMimoMobilnehoViewportu";
    await form.locator('select[name="city"]').evaluate((el,raw)=>{
      const option=document.createElement("option");
      option.value=raw;option.textContent=raw;option.selected=true;(el as HTMLSelectElement).append(option);
    },value);
    await page.locator(searchForm+' input[name="q"]').fill(value);
    const card=page.locator("[data-directory-card]").first();
    if(await card.count())await card.locator("strong").first().evaluate((el,raw)=>{el.textContent=raw;},value);
    await expectNoHorizontalOverflow(page,"very long mobile content");
  });

  test("combined GET search and facets survive submit while pagination resets",async({page},testInfo)=>{
    test.skip(testInfo.project.name!=="mobile-chromium","Mobile combined filters");
    await page.setViewportSize({width:390,height:844});
    await openDirectory(page,"/adresar/veterinari?q=publikovana&region=Bratislavsk%C3%BD%20kraj&city=Bratislava&sort=name-asc");
    await expect(page.locator(searchForm+' input[name="q"]')).toHaveValue("publikovana");
    await expect(page.locator(filterForm+' select[name="region"]')).toHaveValue("Bratislavský kraj");
    await expect(page.locator(filterForm+' select[name="city"]')).toHaveValue("Bratislava");
    await expect(page.locator(filterForm+' select[name="sort"]')).toHaveValue("name-asc");
    await page.locator(searchForm+' input[name="q"]').fill("publikovana kontrola");
    await Promise.all([
      page.waitForURL(url=>url.pathname==="/adresar/veterinari"
        &&url.searchParams.get("q")==="publikovana kontrola"
        &&url.searchParams.get("region")==="Bratislavský kraj"
        &&url.searchParams.get("city")==="Bratislava"
        &&url.searchParams.get("sort")==="name-asc"
        &&!url.searchParams.has("page")),
      page.locator(searchForm+' button[type="submit"]').click(),
    ]);
    await expect(page.locator(searchForm+' input[name="q"]')).toHaveValue("publikovana kontrola");
    await expectNoHorizontalOverflow(page,"combined search");
    await page.locator(filterPanel+" summary").click();
    await page.locator(filterForm+' a[href="/adresar/veterinari"]').click();
    await expect(page.locator(searchForm+' input[name="q"]')).toHaveValue("");
  });

  test("hero, search, categories, filters/results/sidebar are in stable document order",async({page})=>{
    for(const path of ["/adresar","/adresar/treneri"]){
      await openDirectory(page,path);
      const order=await page.evaluate(()=>{
        const select=["[data-unified-section-hero]",'form[data-public-search-form="services"]',"[data-directory-category-navigation]","[data-directory-filter-disclosure]","[data-directory-results]","[data-directory-map-cta]"];
        const nodes=select.map(x=>document.querySelector(x));
        return nodes.every((node,i)=>!!node&&(!i||!!(nodes[i-1]!.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)));
      });
      expect(order,path+" content order").toBe(true);
      await expect(page.locator("[data-directory-map-cta] a")).toHaveAttribute("href",/\/mapa\?category=services/);
      await expect(page.locator("[data-directory-provider-cta] a")).toHaveAttribute("href","/o-nas#kontakt");
      await expectNoHorizontalOverflow(page,path);
    }
  });

  test("single-column cards stay readable through desktop/tablet/mobile breakpoints",async({page})=>{
    await openDirectory(page,"/adresar/treneri");
    const grid=page.locator("[data-directory-list]");
    await expect(grid.locator("[data-directory-card]").first()).toBeVisible();
    for(const [width,layoutColumns] of [[1440,3],[1280,3],[1100,2],[900,2],[768,1],[430,1],[390,1]] as const){
      await page.setViewportSize({width,height:930});
      expect(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length),width+" card columns").toBe(1);
      expect(await page.locator('[data-directory-columns]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length),width+" layout columns").toBe(layoutColumns);
      await expectNoHorizontalOverflow(page,"grid "+width);
    }
    await page.setViewportSize({width:390,height:930});
    await grid.locator("[data-directory-card] strong").first().evaluate(el=>{el.textContent="Mimoriadnedlhynazovsluzbybezmedziermimoriadnedlhynazov";});
    await expectNoHorizontalOverflow(page,"long profile title");
  });
});
