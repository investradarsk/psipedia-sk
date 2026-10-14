import { expect, test, type Locator, type Page } from "@playwright/test";

const selector = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Evaluate inside the actual mounted React AdminDrawer/AdminModalDialog;
// do not insert an unrelated native dialog into another application's DOM.
async function expectWrappedFocus(page: Page, dialog: Locator) {
  const candidates = dialog.locator(selector);
  const indices = await candidates.evaluateAll((elements) => elements
    .map((el, index) => ({ el: el as HTMLElement, index }))
    .filter(({ el }) => el.tabIndex >= 0 && !el.matches(":disabled")
      && getComputedStyle(el).visibility !== "hidden"
      && !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0)
    .map(({ index }) => index));
  expect(indices.length).toBeGreaterThan(1);
  const first = candidates.nth(indices[0]);
  const last = candidates.nth(indices[indices.length - 1]);
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  expect(await page.evaluate(() => (document.activeElement?.closest("dialog") as HTMLDialogElement | null)?.open)).toBe(true);
}

test.beforeEach(async ({ page, baseURL }) => {
  const host = new URL(baseURL!).hostname;
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Only isolated local D1 fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("real AdminDrawer in new breed editor traps focus, skips disabled/hidden and preserves unsaved fields", async ({ page }) => {
  await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.admin-breed-editor[data-admin-breed-editor-ready="true"]')).toBeVisible();
  const name = page.getByLabel("Názov plemena");
  await name.fill("E2E unsaved breed");
  const opener = page.getByRole("button", { name: "Nastavenia, FCI a SEO" });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Nastavenia plemena" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("FCI PDF URL")).toBeVisible();
  await expectWrappedFocus(page, drawer);
  await drawer.evaluate((root) => {
    const disabled = document.createElement("button");
    disabled.disabled = true;
    disabled.textContent = "Disabled fixture";
    const hidden = document.createElement("button");
    hidden.hidden = true;
    hidden.textContent = "Hidden fixture";
    root.append(disabled, hidden);
  });
  await expectWrappedFocus(page, drawer);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(name).toHaveValue("E2E unsaved breed");
});

test("real AdminModalDialog in breeds bulk publishing traps focus and restores opener without publishing", async ({ page }) => {
  await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Plemená", exact: true })).toBeVisible();
  await page.getByLabel("Publikovanie").selectOption("draft");
  const row = page.getByRole("article").filter({ has: page.locator('input[type="checkbox"][aria-label^="Vybrať "]') }).first();
  await row.getByRole("checkbox").check();
  const opener = page.getByRole("button", { name: "Publikovať", exact: true }).first();
  await opener.click();
  const modal = page.getByRole("dialog", { name: "Publikovať vybrané plemená" });
  await expect(modal).toBeVisible();
  await expectWrappedFocus(page, modal);
  await modal.evaluate((root) => {
    const disabled = document.createElement("button");
    disabled.disabled = true;
    disabled.textContent = "Disabled fixture";
    root.append(disabled);
  });
  await expectWrappedFocus(page, modal);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(opener).toBeFocused();
});
