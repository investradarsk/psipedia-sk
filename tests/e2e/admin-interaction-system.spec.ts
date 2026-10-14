import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  const url = new URL(baseURL!);
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(url.hostname), "FOUNDATION-ADMIN interaction coverage runs only against isolated local admin fixtures.");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("shared bulk interaction hierarchy is accessible on desktop and mobile", async ({ page }, testInfo) => {
  const response = await page.goto("/admin", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  const rowCheckbox = page.getByRole("checkbox", { name: /^Vybrať článok / }).first();
  await expect(rowCheckbox).toBeVisible();
  await rowCheckbox.check();

  const toolbar = page.locator("[data-admin-bulk-toolbar]");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toContainText("Upravíš 1 vybranú položku");

  const primary = toolbar.getByRole("button", { name: "Skontrolovať publikovanie", exact: true });
  const secondary = toolbar.getByRole("button", { name: "Skontrolovať presun do konceptov", exact: true });
  const clear = toolbar.getByRole("button", { name: "Zrušiť výber", exact: true });

  await expect(primary).toHaveAttribute("data-admin-action", "primary");
  await expect(secondary).toHaveAttribute("data-admin-action", "secondary");
  await expect(clear).toHaveAttribute("data-admin-action", "link");

  for (const control of [primary, secondary, clear]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await primary.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toContainText("1 článkov");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(primary).toBeFocused();

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expectAxeClean(page);

  await mkdir(".e2e-artifacts/admin-interaction-system", { recursive: true });
  await toolbar.screenshot({
    path: `.e2e-artifacts/admin-interaction-system/bulk-toolbar-${testInfo.project.name}.png`,
  });
});

test("modal loops Tab and Shift+Tab without focusing the inert background", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("checkbox", { name: /^Vybrať článok / }).first().check();
  const opener = page.getByRole("button", { name: "Skontrolovať publikovanie", exact: true });
  await opener.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();

  const focusable = dialog.locator('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    .filter({ visible: true });
  const count = await focusable.count();
  expect(count).toBeGreaterThan(1);
  const first = focusable.first();
  const last = focusable.last();

  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();

  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("modal ignores hidden and disabled controls and does not steal nested modal focus", async ({ page }) => {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("checkbox", { name: /^Vybrať článok / }).first().check();
  const opener = page.getByRole("button", { name: "Skontrolovať publikovanie", exact: true });
  await opener.click();
  const outer = page.locator("dialog[open]").first();
  await expect(outer).toBeVisible();

  await outer.evaluate((element) => {
    const disabled = document.createElement("button");
    disabled.textContent = "Disabled fixture";
    disabled.disabled = true;
    element.append(disabled);
    const hidden = document.createElement("button");
    hidden.textContent = "Hidden fixture";
    hidden.style.display = "none";
    element.append(hidden);
  });
  const lastReal = outer.locator('button:not([disabled])').filter({ visible: true }).last();
  await lastReal.focus();
  await page.keyboard.press("Tab");
  await expect(outer.getByRole("button", { name: "Zavrieť dialóg" })).toBeFocused();

  await outer.evaluate((element) => {
    const inner = document.createElement("dialog");
    inner.setAttribute("aria-label", "Nested fixture");
    inner.innerHTML = '<button type="button">First nested</button><button type="button">Last nested</button>';
    element.append(inner);
    inner.showModal();
  });
  const inner = page.getByRole("dialog", { name: "Nested fixture" });
  await expect(inner).toBeVisible();
  await inner.getByRole("button", { name: "Last nested" }).focus();
  await page.keyboard.press("Tab");
  await expect(inner.getByRole("button", { name: "First nested" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inner).toBeHidden();
  await expect(outer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(outer).toBeHidden();
  await expect(opener).toBeFocused();
});
