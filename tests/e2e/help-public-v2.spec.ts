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
  await expect(categoryNav.getByRole("link", { name: /Stratené a nájdené psy/ })).toHaveAttribute("href", "/pomoc-psom/stratene-a-najdene");
  await expect(categoryNav.getByRole("link", { name: /Útulky a organizácie/ })).toHaveAttribute("href", "/pomoc-psom/utulky");

  const overviewSections = page.locator("[data-help-overview-section]");
  await expect(overviewSections).toHaveCount(6);
  const previewCounts = await overviewSections.evaluateAll((sections) =>
    sections.map((section) => section.querySelectorAll("[data-help-overview-card]").length),
  );
  for (const count of previewCounts) expect(count).toBeLessThanOrEqual(6);
  await expect(page.getByRole("link", { name: "Zobraziť všetky" }).first()).toBeVisible();

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
  expect(new URL(page.url()).pathname).toBe("/pomoc-psom/stratene-a-najdene");
  await expect(page.getByRole("heading", { level: 1, name: "Stratené a nájdené psy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zobraziť stratené psy" })).toHaveAttribute("href", "/pomoc-psom/stratene-psy");
  await expect(page.getByRole("link", { name: "Zobraziť nájdené psy" })).toHaveAttribute("href", "/pomoc-psom/najdene-psy");
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
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 65");
  await expect(page.locator(".admin-help-row")).toHaveCount(50);
  const moduleLinks=page.getByRole("navigation",{name:"Samostatné admin moduly"}).first();
  await expect(moduleLinks.getByRole("link",{name:"Adopcie",exact:true})).toHaveAttribute("href","/admin/adopcie");
  await expect(moduleLinks.getByRole("link",{name:"Stratené / nájdené",exact:true})).toHaveAttribute("href","/admin/stratene-najdene");
  await expect(moduleLinks.getByRole("link",{name:"Organizácie",exact:true})).toHaveAttribute("href","/admin/organizacie");
  await page.getByRole("link",{name:"Ďalšia →"}).click();
  await expect(page.locator(".admin-help-row")).toHaveCount(15);

  await page.goto("/admin/pomoc?q=zlty");
  await expect(page.locator(".admin-help-results")).toContainText("Nájdené: 1");
  await expect(page.getByRole("heading",{name:"E2E bulk Žltý koncept"})).toBeVisible();
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

  const titleInput=page.getByLabel("Názov prípadu alebo výzvy");
  await page.waitForFunction(() => {
    const input = document.querySelector("#help-title");
    return Boolean(input && Object.keys(input).some((key) => key.startsWith("__reactProps$")));
  });
  await titleInput.fill("E2E Help Admin Created – upravený");
  await titleInput.press("Tab");
  await expect(titleInput).toHaveValue("E2E Help Admin Created – upravený");
  await page.getByRole("checkbox",{name:/Urgentné/}).check();
  await expect(titleInput).toHaveValue("E2E Help Admin Created – upravený");

  // Persist the content edit first, then exercise publication separately. This
  // verifies both edit persistence and the DRAFT -> published lifecycle.
  await page.getByRole("button",{name:"Uložiť koncept"}).click();
  await expect(page.getByRole("status")).toContainText("Koncept");
  await expect.poll(async () => {
    api=await page.request.get(`/api/admin/help/${id}`);item=(await api.json()).item;
    return {status:item.status,urgent:item.urgent,title:item.title};
  }, {message:"Help draft edit did not persist"}).toEqual({
    status:"draft",
    urgent:true,
    title:"E2E Help Admin Created – upravený",
  });

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
    page.getByRole("button",{name:"Použiť filtre"}),page.getByRole("navigation",{name:"Samostatné admin moduly"}).first().getByRole("link",{name:"Adopcie",exact:true}),
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
