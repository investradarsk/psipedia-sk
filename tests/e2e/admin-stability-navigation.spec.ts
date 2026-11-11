import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("Ctrl+K opens Admin search only, without the public search overlay", async ({ page }) => {
  await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-sidebar][data-admin-hydrated='true']")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.locator("[data-admin-quick-navigation]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("mobile navigation unlocks the drawer before the next section finishes loading", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Checks the mobile drawer only");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-sidebar][data-admin-hydrated='true']")).toBeAttached();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Navigácia administrácie" });
  await expect(drawer).toBeVisible();

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/admin/podujatia.rsc*", async route => {
    await gate;
    await route.continue();
  });
  try {
    await drawer.getByRole("link", { name: "Podujatia", exact: true }).click({ noWaitAfter: true });
    await expect(drawer).toBeHidden();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(page).toHaveURL(/\/admin\/podujatia(?:\?.*)?$/);
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
});

test("stalled transition offers a nonblocking safe exit without reloading the editor", async ({ page }) => {
  await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-sidebar][data-admin-hydrated='true']")).toBeAttached();
  await page.clock.install();
  const startingUrl = page.url();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("psipedia:admin-navigation-start", {
      detail: { href: "/admin/plemena", navigationType: "push" },
    }));
  });
  await page.clock.fastForward(12_001);
  const notice = page.locator("[data-admin-navigation-recovery]");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: "Otvoriť v novej karte" })).toHaveAttribute("target", "_blank");
  await expect(notice.getByRole("button", { name: "Skúsiť znova" })).toBeVisible();
  expect(page.url()).toBe(startingUrl);
  await notice.getByRole("button", { name: "Zavrieť upozornenie" }).click();
  await expect(notice).toHaveCount(0);
});

test("consecutive Admin soft navigations remain usable with browser Back and Forward", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop sidebar and router history sequence");
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-sidebar][data-admin-hydrated='true']")).toBeVisible();

  await page.locator('[data-admin-shell] a[href="/admin/plemena"]:visible').first().click();
  await expect(page).toHaveURL(new RegExp("/admin/plemena$"));
  await expect(page.locator("[data-admin-shell]")).toBeVisible();

  await page.locator('[data-admin-sidebar] a[href="/admin/clanky"]').click();
  await expect(page).toHaveURL(new RegExp("/admin/clanky$"));
  await expect(page.locator("[data-admin-shell]")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/admin/plemena$"));
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp("/admin/clanky$"));
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
});
