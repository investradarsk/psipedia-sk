import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const expectedMainNavigation = [
  ["Plemená", "/plemena"],
  ["Šteniatka", "/steniatka"],
  ["Zdravie a starostlivosť", "/starostlivost"],
  ["Výcvik a aktivity", "/aktivity"],
  ["Služby pre psov", "/adresar"],
  ["Pomoc psom", "/pomoc-psom"],
  ["Podujatia", "/podujatia"],
  ["Recenzie a testy", "/recenzie"],
  ["Novinky", "/novinky"],
] as const;

const expectedSubmenus = {
  steniatka: [
    ["Pred kúpou psa", "/steniatka/pred-kupou-psa"],
    ["Výber plemena", "/steniatka/vyber-plemena"],
    ["Výber chovateľa", "/steniatka/vyber-chovatela"],
    ["Prvé dni doma", "/steniatka/prve-dni"],
    ["Socializácia", "/steniatka/socializacia"],
    ["Hygiena", "/steniatka/hygiena"],
    ["Kŕmenie", "/steniatka/krmenie"],
    ["Očkovanie a zdravie", "/steniatka/ockovanie-a-zdravie"],
    ["Výcvik šteniatka", "/steniatka/vycvik-steniatka"],
    ["Rast a vývoj", "/steniatka/rast-a-vyvoj"],
    ["Puberta", "/steniatka/puberta"],
  ],
  starostlivost: [
    ["Zdravie", "/starostlivost/zdravie"],
    ["Výživa", "/starostlivost/vyziva"],
    ["Každodenná výchova", "/starostlivost/vycvik"],
    ["Správanie", "/starostlivost/spravanie"],
    ["Srsť a hygiena", "/starostlivost/srst-a-hygiena"],
    ["Psí senior", "/starostlivost/senior"],
  ],
  aktivity: [
    ["Psie športy", "/aktivity/psie-sporty"],
    ["Tréning", "/aktivity/trening"],
    ["Výlety so psom", "/aktivity/vylety-so-psom"],
    ["Dog-friendly miesta", "/aktivity/dog-friendly-miesta"],
    ["Dovolenka so psom", "/aktivity/dovolenka-so-psom"],
  ],
} as const;

const uxFoundationRoutes = [
  { path: "/starostlivost", firstContent: "[data-section-public-callout]", minGap: 14, maxGap: 28 },
  { path: "/starostlivost/vyziva", firstContent: "[data-section-public-topic-body]", minGap: 24, maxGap: 54 },
  { path: "/aktivity", firstContent: "[data-section-public-callout]", minGap: 14, maxGap: 28 },
  { path: "/aktivity/trening", firstContent: "[data-section-public-topic-body]", minGap: 24, maxGap: 54 },
  { path: "/steniatka", firstContent: "[data-section-public-callout]", minGap: 14, maxGap: 28 },
  { path: "/steniatka/pred-kupou-psa", firstContent: "[data-section-public-topic-body]", minGap: 24, maxGap: 54 },
] as const;

const compactHeaderPairs = [
  ["/steniatka", "/steniatka/pred-kupou-psa"],
  ["/starostlivost", "/starostlivost/vyziva"],
  ["/aktivity", "/aktivity/trening"],
] as const;

async function measuredBox(locator: Locator, label: string) {
  const value = await locator.boundingBox();
  expect(value, `${label}: element cannot be measured`).not.toBeNull();
  return value!;
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) => `${item.id} (${item.impact}): ${item.help}`).join("\n");
  expect(violations, `${label}: serious/critical Axe violations\n${details}`).toEqual([]);
}

test.beforeEach(async ({ page, baseURL, isMobile }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1700, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
  await page.waitForTimeout(100);
});

test("public navigation keeps order and exposes only requested submenus", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  const nav = page.locator(isMobile ? "#mobile-menu nav" : ".desktop-nav");
  const topLevelLinks = nav.locator(isMobile ? ".mobile-nav-parent > a" : ":scope > a, :scope > .nav-group > a");
  await expect(topLevelLinks).toHaveCount(expectedMainNavigation.length);
  await expect(topLevelLinks).toHaveText(expectedMainNavigation.map(([label]) => label));
  for (const [index, [, href]] of expectedMainNavigation.entries()) {
    await expect(topLevelLinks.nth(index)).toHaveAttribute("href", href);
  }
  await expect(nav.locator('a[href="/plemena"]')).toBeVisible();
  await expect(nav.locator(isMobile ? '.mobile-nav-group:has(> .mobile-nav-parent > a[href="/plemena"]) .mobile-submenu-toggle' : '.nav-group:has(> a[href="/plemena"])')).toHaveCount(0);

  for (const [id, children] of Object.entries(expectedSubmenus)) {
    const toggle = nav.locator(`[aria-controls="${isMobile ? "mobile" : "desktop"}-submenu-${id}"]`);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    if (isMobile) await toggle.click();
    else await toggle.dispatchEvent("click");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const submenu = nav.locator(`#${isMobile ? "mobile" : "desktop"}-submenu-${id}`);
    for (const [label, href] of children) await expect(submenu.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }

  expect(await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".site-header")!;
    return header.scrollWidth <= header.clientWidth;
  })).toBe(true);
});

test("header brand stays collision-free from 390px through narrow desktop", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1180, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const geometry = await page.evaluate(() => {
      const rect = (element: Element | null) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || box.width === 0 || box.height === 0) return null;
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      const intersects = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
        Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      const brand = rect(document.querySelector("[data-header-brand]"));
      const secondary = rect(document.querySelector("[data-header-secondary]"));
      const nav = rect(document.querySelector(".desktop-nav"));
      const actions = rect(document.querySelector(".header-actions"));
      const hamburger = rect(document.querySelector('button[aria-controls="mobile-menu"]'));
      const header = document.querySelector<HTMLElement>(".site-header")!;
      return {
        brand,
        secondary,
        nav,
        actions,
        hamburger,
        brandSecondaryOverlap: intersects(brand, secondary),
        brandNavOverlap: intersects(brand, nav),
        brandActionsOverlap: intersects(brand, actions),
        brandHamburgerOverlap: intersects(brand, hamburger),
        overflow: header.scrollWidth - header.clientWidth,
      };
    });

    expect(geometry.brand, `${viewport.width}px: brand missing`).not.toBeNull();
    expect(geometry.brandSecondaryOverlap, `${viewport.width}px: secondary text overlaps brand`).toBe(false);
    expect(geometry.brandNavOverlap, `${viewport.width}px: desktop nav overlaps brand`).toBe(false);
    expect(geometry.brandActionsOverlap, `${viewport.width}px: utility actions overlap brand`).toBe(false);
    expect(geometry.brandHamburgerOverlap, `${viewport.width}px: hamburger overlaps brand`).toBe(false);
    expect(geometry.overflow, `${viewport.width}px: header horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test("desktop dropdown supports hover and keyboard focus without submenu accent line", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop-only interaction");
  const group = page.locator('.nav-group:has(> a[href="/steniatka"])');
  const toggle = group.getByRole("button");
  const submenuLink = group.locator(".nav-submenu a").first();

  await group.hover();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(submenuLink).toBeVisible();
  expect(await submenuLink.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");

  await page.locator("main").hover();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.focus();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(submenuLink).toBeVisible();
  await submenuLink.focus();
  await expect(submenuLink).toBeFocused();
  expect(await submenuLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("mobile menu scrolls to the final items with Šteniatka expanded", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only scroll regression");

  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  const menu = page.locator("#mobile-menu");
  const nav = menu.locator(":scope > nav");
  const puppyToggle = nav.locator('[aria-controls="mobile-submenu-steniatka"]');
  const puppySubmenu = nav.locator("#mobile-submenu-steniatka");

  await puppyToggle.click();
  await expect(puppyToggle).toHaveAttribute("aria-expanded", "true");

  const transitionMs = await puppySubmenu.evaluate((element) => {
    const style = getComputedStyle(element);
    const toMilliseconds = (value: string) => value.trim().endsWith("ms")
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
    const durations = style.transitionDuration.split(",").map(toMilliseconds);
    const delays = style.transitionDelay.split(",").map(toMilliseconds);
    return Math.max(0, ...durations.map((duration, index) => duration + (delays[index] ?? delays[0] ?? 0)));
  });
  await page.waitForTimeout(transitionMs + 50);

  const metrics = await nav.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowY: style.overflowY,
    };
  });

  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await expect.poll(async () => nav.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
  })).toBe(true);
  await expect(menu.getByRole("link", { name: "Kontakt", exact: true })).toBeInViewport();
});

test("PortalHub and PortalTopic share gutters, spacing and visible SectionTabs", async ({ page, isMobile }) => {
  for (const route of uxFoundationRoutes) {
    await page.goto(route.path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expectNoHorizontalOverflow(page, route.path);

    const headerContainer = page.locator("[data-section-public-header]").first();
    const breadcrumbs = headerContainer.locator(".page-breadcrumbs");
    const tabs = page.locator(".portal-section-tabs");
    const tabsInner = tabs.locator(".section-tabs-inner");
    const firstContent = page.locator(route.firstContent).first();

    await expect(headerContainer, `${route.path}: compact public header container missing`).toBeVisible();
    await expect(breadcrumbs, `${route.path}: shared Breadcrumbs missing`).toBeVisible();
    await expect(tabs, `${route.path}: SectionTabs missing`).toBeVisible();
    await expect(firstContent, `${route.path}: first content block missing`).toBeVisible();

    const activeTab = tabs.locator('.section-tab[aria-current="page"]');
    await expect(activeTab, `${route.path}: active tab missing`).toHaveCount(1);
    await activeTab.scrollIntoViewIfNeeded();
    await expect(activeTab).toBeVisible();

    const activeBox = await measuredBox(activeTab, `${route.path}: active tab`);
    expect(activeBox.height, `${route.path}: section tab touch target`).toBeGreaterThanOrEqual(44);
    const activeHit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".section-tab")), {
      x: activeBox.x + activeBox.width / 2,
      y: activeBox.y + activeBox.height / 2,
    });
    expect(activeHit, `${route.path}: active tab is covered`).toBe(true);

    const tabsBox = await measuredBox(tabs, `${route.path}: section tabs`);
    const contentTarget = firstContent.locator(":scope > *").first();
    const contentBox = await measuredBox(contentTarget, `${route.path}: content after tabs`);
    const flowGap = contentBox.y - (tabsBox.y + tabsBox.height);
    expect(flowGap, `${route.path}: tabs/content spacing`).toBeGreaterThanOrEqual(route.minGap);
    expect(flowGap, `${route.path}: tabs/content spacing`).toBeLessThanOrEqual(route.maxGap);

    const headerPublicBox = await measuredBox(headerContainer, `${route.path}: public header container`);
    const tabsInnerBox = await measuredBox(tabsInner, `${route.path}: tabs container`);

    if (isMobile) {
      const siteHeaderBox = await measuredBox(page.locator(".header-inner"), `${route.path}: site header`);
      const contentShellBox = await measuredBox(firstContent, `${route.path}: content shell`);
      const viewportWidth = page.viewportSize()!.width;
      for (const [label, measured] of [
        ["site header", siteHeaderBox],
        ["section header", headerPublicBox],
        ["tabs", tabsInnerBox],
        ["content", contentShellBox],
      ] as const) {
        expect(Math.abs(measured.x - 16), `${route.path}: ${label} left gutter`).toBeLessThanOrEqual(1);
        expect(Math.abs(viewportWidth - (measured.x + measured.width) - 16), `${route.path}: ${label} right gutter`).toBeLessThanOrEqual(1);
      }
      const breadcrumbBox = await measuredBox(breadcrumbs, `${route.path}: breadcrumbs`);
      expect(Math.abs(breadcrumbBox.x - 16), `${route.path}: breadcrumbs gutter`).toBeLessThanOrEqual(1);
    } else {
      expect(headerPublicBox.width, `${route.path}: desktop header container exceeds 1180px`).toBeLessThanOrEqual(1180.5);
      expect(tabsInnerBox.width, `${route.path}: desktop tabs exceed 1180px`).toBeLessThanOrEqual(1180.5);
    }
  }
});

test("structured parent and child pages share the compact section header system", async ({ page }) => {
  for (const pair of compactHeaderPairs) {
    for (const path of pair) {
      await page.goto(path);
      const headerContainer = page.locator("[data-section-public-header]").first();
      await expect(headerContainer, `${path}: compact public header missing`).toBeVisible();
      await expect(headerContainer.locator(".page-breadcrumbs"), `${path}: breadcrumbs missing from compact header`).toBeVisible();
      await expect(headerContainer.locator("h1"), `${path}: compact header title missing`).toBeVisible();
      await expect(page.locator(".portal-section-hero"), `${path}: legacy portal hero must stay removed`).toHaveCount(0);
      await expect(page.locator(".section-hero-photo"), `${path}: category/detail must not render a legacy photo hero`).toHaveCount(0);
      await expectNoHorizontalOverflow(page, path);
    }
  }
});

test("mobile hamburger and menu align to the public gutter with safe targets", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only UX-1A regression");
  await page.goto("/starostlivost");
  await expect(page.getByText(/Psie meniny:/)).toHaveCount(0);

  const menuTrigger = page.locator('button[aria-controls="mobile-menu"]:visible');
  await expect(menuTrigger).toHaveAttribute("aria-label", "Otvoriť menu");
  const triggerBox = await measuredBox(menuTrigger, "menu trigger");
  expect(triggerBox.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(triggerBox.x - 16), "hamburger left gutter").toBeLessThanOrEqual(1);

  await menuTrigger.focus();
  await expect(menuTrigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
  const mobileNav = page.locator("#mobile-menu > nav");
  await expect(mobileNav).toBeVisible();
  const navBox = await measuredBox(mobileNav, "mobile menu shell");
  expect(Math.abs(navBox.x - 16), "mobile menu left gutter").toBeLessThanOrEqual(1);
  expect(Math.abs(390 - (navBox.x + navBox.width) - 16), "mobile menu right gutter").toBeLessThanOrEqual(1);

  const visibleTargets = mobileNav.locator("a:visible, button:visible");
  for (let index = 0; index < await visibleTargets.count(); index += 1) {
    const targetBox = await visibleTargets.nth(index).boundingBox();
    if (targetBox) expect(targetBox.height, `mobile menu target ${index}`).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalOverflow(page, "/starostlivost mobile menu");

  await page.keyboard.press("Tab");
  await expect(mobileNav.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuTrigger).toBeFocused();
  await expect(menuTrigger).toHaveAttribute("aria-expanded", "false");
});

test("representative PortalHub and PortalTopic pages stay Axe-clean", async ({ page }) => {
  for (const route of uxFoundationRoutes) {
    await page.goto(route.path);
    await expectAxeClean(page, route.path);
  }
});
