import { expect, test, type Page } from "@playwright/test";

// Simulate a single-finger gesture in the mobile menu only.
// Page-level history gestures belong exclusively to the browser.
async function touchSwipe(page: Page, selector: string, start: [number, number], end: [number, number]) {
  await page.locator(selector).first().evaluate((element, { start, end }) => {
    const touch = (coords: [number, number]) => new Touch({
      identifier: 1,
      target: element,
      clientX: coords[0],
      clientY: coords[1],
    });
    const down = touch(start as [number, number]);
    element.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true, touches: [down], targetTouches: [down], changedTouches: [down],
    }));
    const up = touch(end as [number, number]);
    for (let step = 1; step <= 6; step++) {
      const portion = step / 6;
      const point = touch([
        Math.round(start[0] + (end[0] - start[0]) * portion),
        Math.round(start[1] + (end[1] - start[1]) * portion),
      ]);
      element.dispatchEvent(new TouchEvent("touchmove", {
        bubbles: true, cancelable: true, touches: [point], targetTouches: [point], changedTouches: [point],
      }));
    }
    element.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true, touches: [], targetTouches: [], changedTouches: [up],
    }));
  }, { start, end });
}

// CDP drives Chrome's touch input stack (including scrolling and touchcancel),
// unlike synthetic TouchEvent dispatch which bypasses the browser's recognizer.
async function chromeFingerSwipe(page: Page, start: [number, number], end: [number, number]) {
  const session = await page.context().newCDPSession(page);
  const id = 1;
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: start[0], y: start[1], id }],
    });
    for (let step = 1; step <= 12; step += 1) {
      const fraction = step / 12;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: Math.round(start[0] + (end[0] - start[0]) * fraction),
          y: Math.round(start[1] + (end[1] - start[1]) * fraction),
          id,
        }],
      });
      await page.waitForTimeout(12);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

test.beforeEach(async ({ page, baseURL, isMobile }) => {
  test.skip(!isMobile, "Single-finger navigation gestures are mobile-only");
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
});

test("pulling the visible grip dismisses the menu while content scrolling stays native", async ({ page }) => {
  const open = page.getByRole("button", { name: "Otvoriť menu", exact: true });
  const menu = page.locator("#mobile-menu");
  const nav = menu.locator(":scope > nav");
  await open.click();
  await expect(menu).toHaveClass(/is-open/);

  const puppyToggle = nav.locator('[aria-controls="mobile-submenu-steniatka"]');
  await puppyToggle.click();
  await expect(puppyToggle).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(250);

  await touchSwipe(page, "#mobile-menu > nav", [250, 290], [250, 160]);
  await expect(menu).toHaveClass(/is-open/);

  // A downward swipe in the middle of a scrolled list is not a dismiss gesture.
  await nav.evaluate((element) => { element.scrollTop = 120; });
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await touchSwipe(page, "#mobile-menu > nav", [250, 220], [250, 355]);
  await expect(menu).toHaveClass(/is-open/);

  // A downward touch on the list does not accidentally close the drawer.
  await nav.evaluate((element) => { element.scrollTop = 0; });
  await touchSwipe(page, "#mobile-menu > nav", [250, 220], [250, 345]);
  await expect(menu).toHaveClass(/is-open/);
  await touchSwipe(page, "[data-menu-dismiss-grip]", [250, 100], [250, 235]);
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(open).toHaveAttribute("aria-expanded", "false");
});

test("vertical article scroll and horizontal scrolling areas do not trigger in-site navigation", async ({ page }) => {
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await page.locator('#mobile-menu a[href="/starostlivost"]').first().click();
  await expect(page).toHaveURL(/\/starostlivost$/);

  await touchSwipe(page, "main", [310, 400], [270, 270]);
  await expect(page).toHaveURL(/\/starostlivost$/);

  await page.locator("main").first().evaluate((main) => {
    const scroller = document.createElement("div");
    scroller.id = "swipe-gesture-scroll-test";
    Object.assign(scroller.style, { overflowX: "auto", width: "100px", height: "40px" });
    const wide = document.createElement("div");
    wide.style.width = "500px";
    wide.textContent = "Vodorovná navigácia";
    scroller.append(wide);
    main.prepend(scroller);
  });
  await touchSwipe(page, "#swipe-gesture-scroll-test", [315, 400], [190, 400]);
  await expect(page).toHaveURL(/\/starostlivost$/);
});

test("real Chrome touch: dragging the marked grip closes the menu", async ({ page }) => {
  const menu = page.locator("#mobile-menu");
  const nav = menu.locator(":scope > nav");
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await expect(menu).toHaveClass(/is-open/);
  await page.waitForTimeout(260);
  const rect = await menu.locator("[data-menu-dismiss-grip]").boundingBox();
  expect(rect).not.toBeNull();
  const x = Math.round(rect!.x + rect!.width * 0.50);
  const y = Math.round(rect!.y + rect!.height * 0.50);
  await chromeFingerSwipe(page, [x, y], [x, y + 115]);
  await expect(menu).not.toHaveClass(/is-open/);
  await expect(page).toHaveURL(/\/$/);
});

test("real Chrome touch: an upward swipe keeps the long menu available", async ({ page }) => {
  const menu = page.locator("#mobile-menu");
  const nav = menu.locator(":scope > nav");
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await nav.locator('[aria-controls="mobile-submenu-steniatka"]').click();
  await page.waitForTimeout(260);
  const rect = await nav.boundingBox();
  expect(rect).not.toBeNull();
  const x = Math.round(rect!.x + rect!.width * 0.63);
  const y = Math.round(rect!.y + Math.min(290, rect!.height * 0.6));
  await chromeFingerSwipe(page, [x, y], [x, Math.max(rect!.y + 75, y - 150)]);
  await expect(menu).toHaveClass(/is-open/);
  await expect(nav.locator('[aria-controls="mobile-submenu-steniatka"]')).toHaveAttribute("aria-expanded", "true");
});

test("scrolling the menu never dismisses it; tapping the backdrop does", async ({ page }) => {
  const menu = page.locator("#mobile-menu");
  const nav = menu.locator(":scope > nav");
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await nav.locator('[aria-controls="mobile-submenu-steniatka"]').click();
  await page.waitForTimeout(260);
  await nav.evaluate((element) => { element.scrollTop = 130; });
  await expect.poll(() => nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await expect(menu).toHaveClass(/is-open/);
  // After collapsing a long submenu, there is visible space below the drawer
  // for the overlay; dragging the list itself must not close the menu.
  await nav.locator('[aria-controls="mobile-submenu-steniatka"]').click();
  await nav.evaluate((element) => { element.scrollTop = 0; });
  await page.locator("button[aria-label='Zavrieť navigáciu klepnutím mimo menu']").click({ position: { x: 12, y: 820 } });
  await expect(menu).not.toHaveClass(/is-open/);
});

test("mobile header has no redundant back arrow; brand still opens home", async ({ page }) => {
  await page.goto("/o-nas");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
  await expect(page.getByRole("button", { name: "Späť na predchádzajúcu stránku Psipedie" })).toHaveCount(0);
  await page.locator("[data-header-brand]").click();
  await expect(page).toHaveURL(/\/$/);
});


test("native browser back and forward traverse homepage → article → homepage", async ({ page }) => {
  const article = page.locator("[data-home-latest] [data-article-list-item]").first();
  await expect(article).toBeVisible();
  const href = await article.getAttribute("href");
  expect(href).toBeTruthy();
  const articleUrl = new URL(href!, page.url()).toString();
  await article.click();
  await expect(page).toHaveURL(articleUrl);

  // This is Chrome/Safari's own history, not a website touchend handler.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-home-latest]")).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(articleUrl);
  await expect(page.locator("[data-article-reading-start]")).toBeVisible();
});

test("native browser history returns from article to magazine and then homepage", async ({ page }) => {
  await page.goto("/clanky");
  const article = page.locator('.article-browser a[role="listitem"]').first();
  await expect(article).toBeVisible();
  const url = new URL((await article.getAttribute("href"))!, page.url()).toString();
  await article.click();
  await expect(page).toHaveURL(url);

  await page.goBack();
  await expect(page).toHaveURL(/\/clanky$/);
  await expect(page.locator(".article-browser")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("reloading an article preserves browser history without inventing a custom back route", async ({ page }) => {
  const article = page.locator("[data-home-latest] [data-article-list-item]").first();
  await expect(article).toBeVisible();
  const url = new URL((await article.getAttribute("href"))!, page.url()).toString();
  await article.click();
  await expect(page).toHaveURL(url);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(url);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("site does not install a global touchend redirect or additional back button", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Späť na predchádzajúcu stránku Psipedie" })).toHaveCount(0);
  await expect(page.locator("[data-article-safe-back]")).toHaveCount(0);
  await page.goto("/o-nas");
  await expect(page).toHaveURL(/\/o-nas$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});


async function emulateChromeOnIphone(page: Page) {
  // Real-device Chrome iOS behaviour cannot be fully emulated by desktop
  // Chromium; the test validates our app's iOS-specific link policy.
  await page.addInitScript(() => {
    const chromeIosUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
    Object.defineProperty(navigator, "userAgent", {
      configurable: true, get: () => chromeIosUA,
    });
    const key = "psipedia:e2e:document-loads";
    sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? "0") + 1));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-native-history-navigation", "chrome-ios");
}

async function loadCount(page: Page) {
  return page.evaluate(() => Number(sessionStorage.getItem("psipedia:e2e:document-loads") ?? "0"));
}

test("sitewide Chrome iPhone: homepage → events → contact → back twice stays on Psipedia", async ({ page }) => {
  await emulateChromeOnIphone(page);
  const homepageCount = await loadCount(page);
  await page.locator('[data-home-search] a[href="/podujatia"]').click();
  await expect(page).toHaveURL(/\/podujatia$/);
  expect(await loadCount(page)).toBeGreaterThan(homepageCount);

  const entryCount = await loadCount(page);
  // This history regression must not depend on live event inventory in the local D1 fixture.
  // Exercise a deterministic second page instead of assuming an event card exists.
  await page.goto("/kontakt", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/kontakt$/);
  expect(await loadCount(page)).toBeGreaterThan(entryCount);

  await page.goBack();
  await expect(page).toHaveURL(/\/podujatia$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-home-search]")).toBeVisible();
});

test("sitewide Chrome iPhone: homepage → magazine → article → two browser backs", async ({ page }) => {
  await emulateChromeOnIphone(page);
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await page.locator('#mobile-menu a[href="/clanky"]').first().click();
  await expect(page).toHaveURL(/\/clanky$/);
  const beforeArticle = await loadCount(page);
  const article = page.locator('.article-browser a[role="listitem"]').first();
  await expect(article).toBeVisible();
  await article.click();
  await expect(page).not.toHaveURL(/\/clanky$/);
  expect(await loadCount(page)).toBeGreaterThan(beforeArticle);

  await page.goBack();
  await expect(page).toHaveURL(/\/clanky$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("sitewide Chrome iPhone: calendar month changes stay client-side", async ({ page }) => {
  await emulateChromeOnIphone(page);
  await page.locator('[data-home-search] a[href="/podujatia"]').click();
  await expect(page).toHaveURL(/\/podujatia$/);
  const loads = await loadCount(page);
  const month = page.getByRole("link", { name: "Nasledujúci mesiac" });
  await expect(month).toBeVisible();
  await month.click();
  await expect(page.locator("[data-public-calendar]")).toBeVisible();
  expect(await loadCount(page)).toBe(loads);
  await expect(page.locator("[data-public-calendar]")).toHaveAttribute("aria-busy", "false");
});

test("other browsers retain normal client-side navigation policy", async ({ page }) => {
  await expect(page.locator("html")).not.toHaveAttribute("data-native-history-navigation", "chrome-ios");
  await page.locator('[data-home-search] a[href="/podujatia"]').click();
  await expect(page).toHaveURL(/\/podujatia$/);
});
