import { expect, test, type Page } from "@playwright/test";

// Simulate a single-finger gesture using actual DOM Touch events so React's
// delegated menu handlers and the document-level back gesture both run.
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

test("leftward content swipe returns to the previous Psipedia page without leaving the site", async ({ page }) => {
  // The link must run through client-side routing, as do the article cards.
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await page.locator('#mobile-menu a[href="/starostlivost"]').first().click();
  await expect(page).toHaveURL(/\/starostlivost$/);
  await expect(page.locator("#mobile-menu")).not.toHaveClass(/is-open/);

  await touchSwipe(page, "main", [315, 400], [190, 406]);
  await expect(page).toHaveURL(/\/$/);
  // On the home page another swipe must not navigate to an external referrer.
  await touchSwipe(page, "main", [315, 400], [190, 406]);
  await expect(page).toHaveURL(/\/$/);
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

test("direct entry falls back to Psipedia home rather than browser history", async ({ page }) => {
  await page.goto("/o-nas");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
  await touchSwipe(page, "main", [315, 400], [190, 405]);
  await expect(page).toHaveURL(/\/$/);
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

test("mobile back button is in-site and falls back to home on direct entry", async ({ page }) => {
  await page.goto("/o-nas");
  await page.waitForFunction(() => Boolean((window as unknown as { __VINEXT_HYDRATED_AT?: number }).__VINEXT_HYDRATED_AT));
  await page.getByRole("button", { name: "Späť na predchádzajúcu stránku Psipedie" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("real Chrome touch: inward left swipe returns to the previous internal route", async ({ page }) => {
  await page.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
  await page.locator('#mobile-menu a[href="/starostlivost"]').first().click();
  await expect(page).toHaveURL(/\/starostlivost$/);
  // Browser-level touch on a clear area, outside horizontal carousels.
  await page.evaluate(() => {
    const zone = document.createElement("div");
    zone.setAttribute("data-e2e-gesture-zone", "");
    Object.assign(zone.style, {
      position: "fixed", left: "195px", top: "265px", width: "130px",
      height: "200px", zIndex: "49", pointerEvents: "auto",
    });
    document.body.append(zone);
  });
  await chromeFingerSwipe(page, [280, 380], [125, 380]);
  await expect(page).toHaveURL(/\/$/);
});

