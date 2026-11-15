import { expect, test, type Page } from "@playwright/test";

// Isolated read-only admin verification. Never interact with live records.
test.beforeEach(async ({ page, baseURL }) => {
  const host = new URL(baseURL!).hostname;
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Requires isolated local admin fixtures");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoDocumentDrift(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll, "Document overflow at " + width + "px").toBeLessThanOrEqual(dimensions.client + 1);
}

test("step 7: mobile editor drops sticky navigation and footer during text focus", async ({ page }) => {
  const response = await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();

  const field = page.getByLabel("Názov plemena", { exact: true });
  const navigation = page.locator('[data-editor-page] [data-editor-navigation]');
  const actionbarParent = page.locator('[data-editor-page] [data-editor-actionbar]').locator("xpath=..");
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await field.focus();
    await expect(navigation).toHaveCSS("position", width <= 820 ? "static" : "sticky");
    await expect(actionbarParent).toHaveCSS("position", width <= 820 ? "static" : "sticky");
    await expect(field).toBeInViewport();
    await expectNoDocumentDrift(page, width);
    await field.evaluate((node) => (node as HTMLInputElement).blur());
    await expect(actionbarParent).toHaveCSS("position", "sticky");
  }
});

test("step 7: article rich text and palette stay within the 320px viewport", async ({ page }) => {
  const response = await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const navigation = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
  await expect(navigation).toHaveAttribute("data-admin-editor-nav-ready", "true");

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const sectionPicker = navigation.getByRole("combobox", { name: "Sekcia editora" });
    if (await sectionPicker.isVisible()) await sectionPicker.selectOption("article-basics");
    else await navigation.getByRole("button", { name: "Úvod a obsah", exact: true }).click();
    await expect(page.locator('#article-intro[data-editor-ready="true"]')).toHaveCount(1);

    const proseMirror = page.locator("#article-intro");
    await proseMirror.focus();
    const actionbarParent = page.locator('[data-editor-page] [data-editor-actionbar]').locator("xpath=..");
    await expect(actionbarParent).toHaveCSS("position", "static");
    await expectNoDocumentDrift(page, width);

    await page.getByRole("button", { name: "Celá paleta farieb textu" }).click();
    const palette = page.locator('[data-tiptap-color-panel="text"]');
    await expect(palette).toBeVisible();
    const bounds = await palette.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(-1);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width + 1);
    const swatch = palette.getByRole("button", { name: /^Použiť farbu/ }).first();
    const box = await swatch.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const hex = palette.getByRole("textbox", { name: /HEX/ });
    await expect(hex).toHaveCSS("font-size", "16px");
    await expectNoDocumentDrift(page, width);
    await page.getByRole("button", { name: "Zavrieť výber farby" }).click();
  }
});

test("step 7: breed secondary-actions disclosure cannot extend past phone edge", async ({ page }) => {
  const response = await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
  const details = page.locator("[data-breed-more-actions]");
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    if (await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator("summary").click();
    await details.locator("summary").click();
    const panel = details.locator("div").first();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("position", "fixed");
    const rect = await panel.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect?.x ?? -1).toBeGreaterThanOrEqual(-1);
    expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(width + 1);
    await expect(details.getByRole("button", { name: "Prejsť na FCI štandard" })).toBeVisible();
    await expectNoDocumentDrift(page, width);
    await details.locator("summary").click();
  }
});
