import { expect, test } from "@playwright/test";

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

  await puppyToggle.click();
  await expect(puppyToggle).toHaveAttribute("aria-expanded", "true");

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

  await nav.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const bottom = await nav.evaluate((element) => ({
    scrollTop: element.scrollTop,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(bottom.scrollTop + bottom.clientHeight).toBeGreaterThanOrEqual(bottom.scrollHeight - 1);
  await expect(menu.getByRole("link", { name: "Kontakt", exact: true })).toBeInViewport();
});
