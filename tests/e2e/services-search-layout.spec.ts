import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("public services search layout", () => {
  test("keeps the search controls inside the mobile public shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout contract");
    await page.setViewportSize({ width: 390, height: 844 });

    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-main-search");
    const controls = form.locator("select, input, button");
    await expect(form).toBeVisible();
    await expect(controls).toHaveCount(3);

    const formBox = await form.boundingBox();
    expect(formBox).not.toBeNull();
    expect(formBox!.x).toBeGreaterThanOrEqual(15);
    expect(390 - (formBox!.x + formBox!.width)).toBeGreaterThanOrEqual(15);

    const controlBoxes = await controls.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    for (const box of controlBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(formBox!.x);
      expect(box.right).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
      expect(box.width).toBeGreaterThan(0);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page })
      .include(".directory-main-search")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const seriousOrCritical = accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
  });

  test("retains the desktop three-column search layout without overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop layout contract");
    await page.setViewportSize({ width: 1366, height: 900 });

    const response = await page.goto("/adresar", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const form = page.locator(".directory-main-search");
    const controls = form.locator("select, input, button");
    await expect(controls).toHaveCount(3);
    const tops = await controls.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
