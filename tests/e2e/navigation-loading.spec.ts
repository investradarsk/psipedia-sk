import { expect, test, type Page } from "@playwright/test";

// Runs against the PR/local app. No production mutations or test-only app routes.
test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname, "Loading UX tests require a local PR server").toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function ready(page: Page) {
  await page.goto("/o-nas");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
  await page.waitForTimeout(100);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
}

async function menuLink(page: Page, isMobile: boolean, href: string) {
  if (isMobile && await page.getByRole("button", { name: "Otvoriť menu", exact: true }).count()) {
    await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  }
  return page.locator(`${isMobile ? "#mobile-menu" : ".desktop-nav"} a[href="${href}"]`).first();
}

async function observeProgress(page: Page) {
  await page.evaluate(() => {
    const bar = document.querySelector(".navigation-progress")!;
    const state = { clicked: 0, first: 0, starts: 0 };
    (window as unknown as { loadingObservation: typeof state }).loadingObservation = state;
    document.addEventListener("click", () => { state.clicked = performance.now(); }, { capture: true });
    new MutationObserver(() => {
      if (bar.getAttribute("data-active") === "true") {
        state.starts++;
        state.first ||= performance.now();
      }
    }).observe(bar, { attributes: true, attributeFilter: ["data-active"] });
  });
}

test("loading UX: internal Link gives immediate feedback without layout shift and clears on commit", async ({ page, isMobile }) => {
  await ready(page);
  await page.route(/\/podujatia(?:\.rsc|\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  const link = await menuLink(page, isMobile, "/podujatia");
  await observeProgress(page);
  const before = await page.locator(".header-inner").boundingBox();
  await link.click();
  const bar = page.locator(".navigation-progress");
  await expect(bar).toHaveAttribute("data-active", "true");
  await expect(bar).toBeVisible();
  const latency = await page.evaluate(() => {
    const state = (window as unknown as { loadingObservation: { clicked: number; first: number } }).loadingObservation;
    return state.first - state.clicked;
  });
  expect(latency).toBeGreaterThanOrEqual(0);
  expect(latency).toBeLessThan(100);
  expect(await page.locator(".header-inner").boundingBox()).toEqual(before);
  await expect(page).toHaveURL(/\/podujatia$/);
  await expect(bar).toHaveAttribute("data-active", "false");
  await expect(bar).toBeHidden();
});

test("loading UX: modified clicks and non-navigation links stay idle", async ({ page, isMobile }) => {
  await ready(page);
  const link = await menuLink(page, isMobile, "/podujatia");
  await observeProgress(page);
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    await link.dispatchEvent("click", { button: 0, [modifier]: true });
  }
  await link.dispatchEvent("click", { button: 1 });
  // Native links also remain untouched. Cancel default actions after the event
  // reaches the document to avoid launching mail/phone apps or external tabs.
  await page.evaluate(() => {
    const cases = [
      { href: "https://example.com" }, { href: "mailto:test@example.com" },
      { href: "tel:+421900123456" }, { href: "javascript:void(0)" },
      { href: "/o-nas" }, { href: "#obsah" },
      { href: "/podujatia", target: "_blank" }, { href: "/podujatia", download: "file" },
    ];
    for (const attributes of cases) {
      const anchor = document.createElement("a");
      for (const [key, value] of Object.entries(attributes)) anchor.setAttribute(key, value);
      document.body.append(anchor);
      document.addEventListener("click", (event) => event.preventDefault(), { once: true });
      anchor.click();
      anchor.remove();
    }
  });
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  expect(await page.evaluate(() => (window as unknown as { loadingObservation: { starts: number } }).loadingObservation.starts)).toBe(0);
});

test("loading UX: Back/Forward and repeated quick transitions finish idle", async ({ page, isMobile }) => {
  await ready(page);
  await (await menuLink(page, isMobile, "/podujatia")).click();
  await expect(page).toHaveURL(/\/podujatia$/);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  await page.goBack();
  await expect(page).toHaveURL(/\/o-nas$/);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  await page.goForward();
  await expect(page).toHaveURL(/\/podujatia$/);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  // dispatchEvent exercises two real Link handlers in the same tick even when
  // the first mobile click closes the menu.
  await page.evaluate((mobile) => {
    const prefix = mobile ? "#mobile-menu" : ".desktop-nav";
    for (const href of ["/adresar", "/recenzie"]) document.querySelector<HTMLAnchorElement>(`${prefix} a[href="${href}"]`)!.click();
  }, isMobile);
  await expect(page).toHaveURL(/\/recenzie$/);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
});

test("loading UX: reduced motion, failed navigation and bounded stuck-state cleanup", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/podujatia(?:\.rsc|\?|$)/, async (route) => { await gate; await route.abort(); });
  await page.clock.install();
  await (await menuLink(page, isMobile, "/podujatia")).click();
  const bar = page.locator(".navigation-progress");
  await expect(bar).toHaveAttribute("data-active", "true");
  await expect(bar.locator("span")).toHaveCSS("animation-name", "none");
  await expect(bar).toHaveCSS("pointer-events", "none");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.clock.fastForward(12_100);
  await expect(bar).toHaveAttribute("data-active", "false");
  release();
  await page.unrouteAll({ behavior: "wait" });
  // A full not-found response must not restore an old progress state.
  await page.goto("/loading-ux-missing-page");
  await expect(page.locator(".navigation-progress")).not.toHaveAttribute("data-active", "true");
});
