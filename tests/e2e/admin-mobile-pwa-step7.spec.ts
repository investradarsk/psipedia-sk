import { expect, test } from "@playwright/test";

// Read-only iPhone navigation regression: never submit, publish, or delete.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("mobile menu releases scroll lock when PWA is frozen or restored", async ({ page }) => {
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const trigger = page.locator('[data-admin-sticky-nav] button[aria-label="Menu"]');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator("#admin-mobile-menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  // Simulate iOS BFCache lifecycle without unloading or losing form state.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });

  await expect(page.locator("#admin-mobile-menu")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await expect(trigger).toBeVisible();
});

test("push intent cannot bypass unsaved edits when user follows the notification", async ({ page }) => {
  await page.goto("/admin/organizacie/novy", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Názov *", { exact: true });
  await expect(name).toBeEnabled();
  await name.fill("Rozpracovaná organizácia bez uloženia");
  await expect(page.locator("html[data-admin-unsaved-editor]")).toHaveCount(1);

  await page.evaluate(() => {
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", {
      data: { type: "psipedia-admin-push-intent", url: "/admin/clanky" },
    }));
  });
  const notice = page.locator("[data-admin-push-notice]");
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: "Otvoriť upozornenie" }).click();

  const confirm = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(name).toHaveValue("Rozpracovaná organizácia bez uloženia");
  await expect(page).toHaveURL(/\/admin\/organizacie\/novy$/);
});
