import { expect, test, type Page } from "@playwright/test";

// Runs against the PR/local app. No production mutations or test-only app routes.
test.beforeEach(async ({ page, baseURL, isMobile }) => {
  expect(new URL(baseURL!).hostname, "Loading UX tests require a local PR server").toMatch(/^(localhost|127\.0\.0\.1)$/);
  // The site's desktop navigation switches at 1400px, while Playwright's
  // stock Desktop Chrome viewport is 1280px. Exercise the actual desktop and
  // mobile navigation variants explicitly in their respective projects.
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1500, height: 900 });
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

async function clearNavigationCaches(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __VINEXT_CLEAR_NAV_CACHES__?: () => void }).__VINEXT_CLEAR_NAV_CACHES__?.();
  });
}

async function dispatchPreventedClick(
  page: Page,
  selector: string,
  init: { button?: number; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean },
) {
  await page.locator(selector).first().evaluate((anchor, eventInit) => {
    // The capture listener still observes the original click properties; the
    // target listener only prevents the synthetic browser default afterwards.
    anchor.addEventListener("click", (event) => event.preventDefault(), { once: true });
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...eventInit }));
  }, init);
}

test("loading UX: internal Link gives immediate feedback without layout shift and clears on commit", async ({ page, isMobile }) => {
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/podujatia.rsc" && request.headers().rsc === "1") await gate;
    await route.continue();
  });
  await clearNavigationCaches(page);
  const link = await menuLink(page, isMobile, "/podujatia");
  await observeProgress(page);
  const before = await page.locator(".header-inner").boundingBox();
  await link.dispatchEvent("click", { button: 0 });
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
  release();
  await expect(page).toHaveURL(/\/podujatia$/);
  await expect(bar).toHaveAttribute("data-active", "false");
  await expect(bar).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
});

test("loading UX: modified clicks and non-navigation links stay idle", async ({ page, isMobile }) => {
  await ready(page);
  await menuLink(page, isMobile, "/podujatia");
  await observeProgress(page);
  const selector = `${isMobile ? "#mobile-menu" : ".desktop-nav"} a[href="/podujatia"]`;
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    await dispatchPreventedClick(page, selector, { button: 0, [modifier]: true });
  }
  await dispatchPreventedClick(page, selector, { button: 1 });
  // Native links also remain untouched. Cancel default actions at the target
  // after the document capture listener observes the original event.
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
      anchor.addEventListener("click", (event) => event.preventDefault(), { once: true });
      anchor.click();
      anchor.remove();
    }
  });
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  expect(await page.evaluate(() => (window as unknown as { loadingObservation: { starts: number } }).loadingObservation.starts)).toBe(0);
});

test("loading UX: Back/Forward and repeated quick transitions finish idle", async ({ page, isMobile }) => {
  await ready(page);
  await clearNavigationCaches(page);
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

test("loading UX: reduced motion and failed navigation finish idle", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/podujatia.rsc" && request.headers().rsc === "1") {
      await gate;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await clearNavigationCaches(page);
  await (await menuLink(page, isMobile, "/podujatia")).dispatchEvent("click", { button: 0 });
  const bar = page.locator(".navigation-progress");
  await expect(bar).toHaveAttribute("data-active", "true");
  await expect(bar.locator("span")).toHaveCSS("animation-name", "none");
  await expect(bar).toHaveCSS("pointer-events", "none");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  // Browser errors clear the indicator immediately; the unit suite separately
  // verifies the 12-second watchdog for cancelled transitions with no event.
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error")));
  await expect(bar).toHaveAttribute("data-active", "false");
  release();
  await expect(page).toHaveURL(/\/podujatia$/);
  await expect(page.locator(".navigation-progress")).toHaveAttribute("data-active", "false");
  await page.unrouteAll({ behavior: "wait" });
  // A full not-found response must not restore an old progress state.
  await page.goto("/loading-ux-missing-page");
  await expect(page.locator(".navigation-progress")).not.toHaveAttribute("data-active", "true");
});
