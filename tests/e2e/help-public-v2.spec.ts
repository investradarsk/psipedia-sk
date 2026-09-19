import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

test("Help landing is compact, canonical, accessible and touch-safe", async ({ page }) => {
  const response = await page.goto("/pomoc-psom", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Pomoc psom" })).toBeVisible();

  const categoryNav = page.locator("[data-help-category-nav]");
  await expect(categoryNav.locator("a")).toHaveCount(6);
  await expect(categoryNav.getByRole("link", { name: /Psy na adopciu/ })).toHaveAttribute("href", "/pomoc-psom/adopcia");
  await expect(categoryNav.getByRole("link", { name: /Stratené a nájdené psy/ })).toHaveAttribute("href", "/pomoc-psom/stratene-psy");
  await expect(categoryNav.getByRole("link", { name: /Útulky a organizácie/ })).toHaveAttribute("href", "/pomoc-psom/utulky");

  await expect(page.getByRole("form", { name: "Filtrovať pomoc" })).toBeVisible();
  await expect(page.getByPlaceholder("Meno, mesto alebo organizácia")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Kraj" })).toBeVisible();

  const targets = await categoryNav.locator("a").evaluateAll((links) => links.map((link) => {
    const rect = link.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test("Help category flows preserve dedicated domains and canonical organization profiles", async ({ page }) => {
  await page.goto("/pomoc-psom/utulky", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Útulky a organizácie" })).toBeVisible();
  await expect(page.locator('a[href="/organizacie/e2e-organizacia"]').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/pomoc-psom/docasna-opatera", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Dočasná opatera" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E dočasná opatera", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/pomoc-psom/stratene-a-najdene", { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).pathname).toBe("/pomoc-psom/stratene-psy");
  await expect(page.getByRole("heading", { level: 1, name: "Stratené psy" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("canonical adoption cards expose organization context without changing lifecycle filters", async ({ page }) => {
  await page.goto("/pomoc-psom/adopcia", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Psy na adopciu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toBeVisible();
  await expect(page.getByText(/E2E útulok Nitra/).first()).toBeVisible();
  await expect(page.getByLabel("Stav")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});


test("Help Admin list is paged, accent-insensitive and keeps dedicated modules outside its CRUD", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop covers the dense admin list; mobile has a dedicated contract test.");
  const response=await page.goto("/admin/pomoc?q=E2E+bulk&status=draft",{waitUntil:"domcontentloaded"});
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading",{level:1,name:"Help prípady a výzvy"})).toBeVisible();
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 64");
  await expect(page.locator(".admin-help-row")).toHaveCount(50);
  await expect(page.getByRole("link",{name:"Adopcie",exact:true})).toHaveAttribute("href","/admin/adopcie");
  await expect(page.getByRole("link",{name:"Stratené / nájdené",exact:true})).toHaveAttribute("href","/admin/stratene-najdene");
  await expect(page.getByRole("link",{name:"Organizácie",exact:true})).toHaveAttribute("href","/admin/organizacie");
  await page.getByRole("link",{name:"Ďalšia →"}).click();
  await expect(page.locator(".admin-help-row")).toHaveCount(14);

  await page.goto("/admin/pomoc?q=zlty");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
  await expect(page.getByRole("heading",{name:"E2E Žltý bulk koncept"})).toBeVisible();
  await page.goto("/admin/pomoc?organization=zlta");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
  await page.goto("/admin/pomoc?location=zilina");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
  await page.goto("/admin/pomoc?q=E2E+bulk&urgent=urgent");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
  await page.goto("/admin/pomoc?q=E2E+bulk&state=resolved");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
});

test("Help Admin create, edit, publish and unpublish lifecycle stays inside generic Help", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Mutation flow runs once against the isolated Help fixture.");
  await page.goto("/admin/pomoc/novy",{waitUntil:"domcontentloaded"});
  const existing=await page.request.get("/api/admin/help");
  if(existing.ok()){
    const body=await existing.json();
    for(const item of body.items??[]) if(item.slug==="e2e-help-admin-created") await page.request.delete(`/api/admin/help/${item.id}`);
    await page.reload();
  }

  const category=page.getByLabel("Kategória");
  await expect(category).toHaveValue("docasna-opatera");
  await expect(category.locator('option[value="adopcia"]')).toHaveCount(0);
  await expect(category.locator('option[value="stratene-a-najdene"]')).toHaveCount(0);
  await expect(category.locator('option[value="utulky"]')).toHaveCount(0);

  await page.getByLabel("Názov prípadu alebo výzvy").fill("E2E Help Admin Created");
  await page.getByLabel("Krátky popis").fill("Deterministický koncept pre Help Admin lifecycle test.");
  await page.getByLabel("Podrobný popis").fill("Tento lokálny Help záznam overuje vytvorenie, úpravu, publikovanie a bezpečný návrat do konceptu.");
  await page.getByLabel("Zodpovedná organizácia alebo osoba").fill("E2E Žltá organizácia");
  await page.getByLabel("Mesto").fill("Žilina");
  await page.getByRole("button",{name:"Uložiť koncept"}).click();
  await page.waitForURL(/\/admin\/pomoc\/\d+\?vytvorene=1/);
  const id=Number(page.url().match(/\/admin\/pomoc\/(\d+)/)?.[1]);
  expect(Number.isSafeInteger(id)).toBeTruthy();
  let api=await page.request.get(`/api/admin/help/${id}`);
  let item=(await api.json()).item;
  expect(item.status).toBe("draft");
  expect(item.category).toBe("docasna-opatera");

  await page.getByLabel("Názov prípadu alebo výzvy").fill("E2E Help Admin Created – upravený");
  await expect(page.getByLabel("Názov prípadu alebo výzvy")).toHaveValue("E2E Help Admin Created – upravený");
  await page.getByRole("checkbox",{name:/Urgentné/}).check();
  await page.getByRole("button",{name:"Publikovať prípad"}).click();
  await expect(page.getByRole("status")).toContainText("publikovaný");
  api=await page.request.get(`/api/admin/help/${id}`);item=(await api.json()).item;
  expect(item.status).toBe("published");expect(item.urgent).toBe(true);expect(item.title).toContain("upravený");

  await page.getByRole("button",{name:"Stiahnuť z webu"}).click();
  await expect(page.getByRole("status")).toContainText("Koncept");
  api=await page.request.get(`/api/admin/help/${id}`);item=(await api.json()).item;
  expect(item.status).toBe("draft");
  const cleanup=await page.request.delete(`/api/admin/help/${id}`);expect(cleanup.ok()).toBeTruthy();
});

test("Help Admin 390x844 list, editor and import preview have no page overflow, are keyboard reachable and Axe-clean", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Exact 390px mobile contract.");
  await page.setViewportSize({width:390,height:844});
  await page.goto("/admin/pomoc?q=E2E+bulk&status=draft",{waitUntil:"domcontentloaded"});
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
  const search=page.getByLabel("Hľadať");
  await search.focus();await page.keyboard.press("Tab");
  await expect(page.getByLabel("Kategória")).toBeFocused();
  for(const control of [
    search,page.getByLabel("Kategória"),page.getByLabel("Publikácia"),page.getByLabel("Urgentnosť"),
    page.getByLabel("Stav prípadu"),page.getByLabel("Organizácia / osoba"),page.getByLabel("Lokalita"),
    page.getByRole("button",{name:"Použiť filtre"}),page.getByRole("link",{name:"Adopcie",exact:true}),
  ]){
    const box=await control.boundingBox();expect(box?.height??0).toBeGreaterThanOrEqual(44);
  }

  await page.goto("/admin/pomoc/novy",{waitUntil:"domcontentloaded"});
  await expectNoHorizontalOverflow(page);await expectNoAxeViolations(page);
  for(const button of await page.locator(".admin-editor-actions button:visible").all()){
    const box=await button.boundingBox();expect(box?.height??0).toBeGreaterThanOrEqual(44);
  }

  await page.goto("/admin/import",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".admin-help-import-check")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const previewButton=page.locator(".admin-help-import-check").getByRole("button",{name:"Preview / Overiť bez importu"});
  const box=await previewButton.boundingBox();expect(box?.height??0).toBeGreaterThanOrEqual(44);
  await expectNoAxeViolations(page);
});
