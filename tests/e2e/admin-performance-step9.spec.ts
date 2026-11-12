import { expect, test } from "@playwright/test";

/**
 * Read-only navigation diagnostics. Authenticated E2E_BASE_URL or local
 * dev-auth is required; the test fails rather than faking Admin availability.
 *
 * Times describe the tested browser and network only. They are never compared
 * with a made-up production SLA or reported as live iPhone p95.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("psipedia-cookie-consent", "necessary");
    window.__adminStep9LongTasks = [];
    if ("PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__adminStep9LongTasks.push({ durationMs: entry.duration, startTimeMs: entry.startTime });
        }
      }).observe({ entryTypes: ["longtask"] });
    }
  });
});

declare global {
  interface Window {
    __adminStep9LongTasks: Array<{ durationMs: number; startTimeMs: number }>;
  }
}

test("desktop consecutive soft navigations, Back and Forward remain usable", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "Desktop-only soft router diagnostic; mobile has its own PWA scenarios");
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-admin-sidebar][data-admin-hydrated="true"]')).toBeVisible();

  const timings: Array<{ route: string; durationMs: number; kind: string }> = [];
  for (const href of ["/admin/clanky", "/admin/recenzie", "/admin/plemena", "/admin/clanky"]) {
    const link = page.locator('[data-admin-sidebar] a[href="' + href + '"]');
    await expect(link).toBeVisible();
    const start = performance.now();
    await link.click();
    await expect(page).toHaveURL(new RegExp(href.replaceAll("/", "\\/") + "(?:\\?.*)?$"));
    await expect(page.locator("[data-admin-shell]")).toBeVisible();
    timings.push({ route: href, durationMs: Number((performance.now() - start).toFixed(1)), kind: "client-route" });
  }
  const startBack = performance.now();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/plemena(?:\?.*)?$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
  timings.push({ route: "/admin/plemena", durationMs: Number((performance.now() - startBack).toFixed(1)), kind: "back" });

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/clanky(?:\?.*)?$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();

  const longTasks = await page.evaluate(() => window.__adminStep9LongTasks ?? []);
  await testInfo.attach("admin-navigation-step9.json", {
    body: JSON.stringify({
      kind: "authenticated-browser-run-not-production-benchmark",
      platform: "desktop-chromium",
      timings,
      longTasks,
    }, null, 2),
    contentType: "application/json",
  });
});

test("mobile menu unblocks touches across routes and browser history", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Mobile-only drawer diagnostic");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menu).toBeVisible();

  const durations: Array<{ route: string; durationMs: number }> = [];
  for (const href of ["/admin/clanky", "/admin/plemena"]) {
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Navigácia administrácie" });
    await expect(drawer).toBeVisible();
    const start = performance.now();
    await drawer.locator('a[href="' + href + '"]').click();
    await expect(page).toHaveURL(new RegExp(href.replaceAll("/", "\\/") + "(?:\\?.*)?$"));
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await expect(menu).toBeVisible();
    durations.push({ route: href, durationMs: Number((performance.now() - start).toFixed(1)) });
  }
  await testInfo.attach("admin-mobile-navigation-step9.json", {
    body: JSON.stringify({ platform: "mobile-chromium-emulation", durations }, null, 2),
    contentType: "application/json",
  });
});
