import { expect, test } from "@playwright/test";

for (const width of [1280, 1440]) {
  test(`fundraiser detail separates raised and target amounts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 936 });
    await page.goto("/pomoc-psom/zbierky/e2e-zbierka");
    const financials = page.locator("[data-help-financial-progress]");
    await expect(financials).toBeVisible();
    const amounts = financials.locator(":scope > div:first-child > span");
    await expect(amounts).toHaveCount(2);
    await expect(amounts.nth(0)).toContainText("Vyzbierané");
    await expect(amounts.nth(1)).toContainText("Cieľ");
    const raised = await amounts.nth(0).boundingBox();
    const target = await amounts.nth(1).boundingBox();
    expect(raised).not.toBeNull();
    expect(target).not.toBeNull();
    if (!raised || !target) throw new Error("Missing visible fundraiser amounts");
    // Both a horizontal gap and wrapping onto a separate row are valid.
    const horizontalGap = target.x - (raised.x + raised.width);
    const verticalGap = target.y - (raised.y + raised.height);
    expect(horizontalGap >= 8 || verticalGap >= 8).toBe(true);
    await expect(financials.getByRole("progressbar", { name: "Priebeh zbierky" })).toHaveAttribute(
      "aria-valuenow",
      "35",
    );
  });
}
