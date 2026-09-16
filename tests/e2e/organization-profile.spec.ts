import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("organization public profile", () => {
  test("@production canonical route fails closed for an ineligible legacy-only slug", async ({ page }) => {
    const response = await page.goto("/organizacie/e2e-organizacia");

    expect(response?.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe("/organizacie/e2e-organizacia");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/e2e organizacia/i);
    await expectNoHorizontalOverflow(page);
  });
});
