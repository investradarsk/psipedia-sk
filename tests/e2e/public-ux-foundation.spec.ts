import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const routes = [
  { path: "/starostlivost", firstContent: ".care-urgent" },
  { path: "/starostlivost/vyziva", firstContent: ".portal-topic-body" },
  { path: "/aktivity", firstContent: ".activity-fit" },
  { path: "/aktivity/trening", firstContent: ".portal-topic-body" },
  { path: "/steniatka", firstContent: ".puppy-start" },
] as const;

async function box(locator: Locator, label: string) {
  const value = await locator.boundingBox();
  expect(value, `${label}: element cannot be measured`).not.toBeNull();
  return value!;
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(overflow, `${path}: horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectAxeClean(page: Page, path: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) => `${item.id} (${item.impact}): ${item.help}`).join("\n");
  expect(violations, `${path}: serious/critical Axe violations\n${details}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("PortalHub and PortalTopic share the public layout foundation", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expectNoHorizontalOverflow(page, route.path);

    const heroContainer = page.locator(".section-hero > .page-container").first();
    const breadcrumbs = heroContainer.locator(".page-breadcrumbs");
    const tabs = page.locator(".portal-section-tabs");
    const tabsInner = tabs.locator(".section-tabs-inner");
    const firstContent = page.locator(route.firstContent).first();

    await expect(heroContainer, `${route.path}: shared SectionHero/PageContainer missing`).toBeVisible();
    await expect(breadcrumbs, `${route.path}: shared Breadcrumbs missing`).toBeVisible();
    await expect(tabs, `${route.path}: SectionTabs missing`).toBeVisible();
    await expect(firstContent, `${route.path}: first content block missing`).toBeVisible();

    const activeTab = tabs.locator('.section-tab[aria-current="page"]');
    await expect(activeTab, `${route.path}: active tab missing`).toHaveCount(1);
    await activeTab.scrollIntoViewIfNeeded();
    await expect(activeTab).toBeVisible();

    const activeBox = await box(activeTab, `${route.path}: active tab`);
    expect(activeBox.height, `${route.path}: section tab touch target`).toBeGreaterThanOrEqual(44);
    const activeHit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".section-tab")), {
      x: activeBox.x + activeBox.width / 2,
      y: activeBox.y + activeBox.height / 2,
    });
    expect(activeHit, `${route.path}: active tab is covered`).toBe(true);

    const tabsBox = await box(tabs, `${route.path}: section tabs`);
    const contentTarget = route.firstContent === ".portal-topic-body"
      ? firstContent.locator(":scope > *").first()
      : firstContent;
    const contentBox = await box(contentTarget, `${route.path}: content after tabs`);
    const flowGap = contentBox.y - (tabsBox.y + tabsBox.height);
    expect(flowGap, `${route.path}: tabs/content spacing`).toBeGreaterThanOrEqual(18);
    expect(flowGap, `${route.path}: tabs/content spacing`).toBeLessThanOrEqual(24);

    const heroBox = await box(heroContainer, `${route.path}: hero container`);
    const tabsInnerBox = await box(tabsInner, `${route.path}: tabs container`);

    if (isMobile) {
      const headerBox = await box(page.locator(".header-inner"), `${route.path}: header`);
      const firstContentShell = route.firstContent === ".portal-topic-body" ? firstContent : page.locator(route.firstContent).first();
      const contentShellBox = await box(firstContentShell, `${route.path}: content shell`);
      const viewportWidth = page.viewportSize()!.width;
      for (const [label, measured] of [
        ["header", headerBox],
        ["hero", heroBox],
        ["tabs", tabsInnerBox],
        ["content", contentShellBox],
      ] as const) {
        expect(Math.abs(measured.x - 16), `${route.path}: ${label} left gutter`).toBeLessThanOrEqual(1);
        expect(Math.abs(viewportWidth - (measured.x + measured.width) - 16), `${route.path}: ${label} right gutter`).toBeLessThanOrEqual(1);
      }

      const breadcrumbBox = await box(breadcrumbs, `${route.path}: breadcrumbs`);
      expect(Math.abs(breadcrumbBox.x - 16), `${route.path}: breadcrumbs gutter`).toBeLessThanOrEqual(1);
    } else {
      expect(heroBox.width, `${route.path}: desktop container exceeds 1180px`).toBeLessThanOrEqual(1180.5);
      expect(tabsInnerBox.width, `${route.path}: desktop tabs exceed 1180px`).toBeLessThanOrEqual(1180.5);
    }
  }
});

test("mobile header and menu keep the public gutter and safe touch targets", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only UX-1A regression");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/starostlivost");

  const menuTrigger = page.getByRole("button", { name: "Otvoriť menu", exact: true });
  const triggerBox = await box(menuTrigger, "menu trigger");
  expect(triggerBox.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(390 - (triggerBox.x + triggerBox.width) - 16), "hamburger right gutter").toBeLessThanOrEqual(1);

  await menuTrigger.click();
  const mobileNav = page.locator("#mobile-menu > nav");
  await expect(mobileNav).toBeVisible();
  const navBox = await box(mobileNav, "mobile menu shell");
  expect(Math.abs(navBox.x - 16), "mobile menu left gutter").toBeLessThanOrEqual(1);
  expect(Math.abs(390 - (navBox.x + navBox.width) - 16), "mobile menu right gutter").toBeLessThanOrEqual(1);

  const visibleTargets = mobileNav.locator("a:visible, button:visible");
  for (let index = 0; index < await visibleTargets.count(); index += 1) {
    const target = visibleTargets.nth(index);
    const targetBox = await target.boundingBox();
    if (targetBox) expect(targetBox.height, `mobile menu target ${index}`).toBeGreaterThanOrEqual(44);
  }

  await expectNoHorizontalOverflow(page, "/starostlivost mobile menu");
});

test("representative portal pages stay Axe-clean", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  for (const route of routes) {
    await page.goto(route.path);
    await expectAxeClean(page, route.path);
  }
});
