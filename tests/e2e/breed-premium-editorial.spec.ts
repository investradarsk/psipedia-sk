import { expect, test } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440, 1920];
const profile = "/plemena/ovciarske-a-pastierske/biely-svajciarsky-ovciak";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("premium breed templates retain readable content at six viewport widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of ["/plemena", profile, profile + "/fci-standard", "/porovnat-plemena"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route + " at " + width).toBeLessThanOrEqual(1);
      if (route === profile) {
        const mobile = page.getByTestId("breed-quick-facts-mobile");
        const desktop = page.getByTestId("breed-quick-facts");
        if (width <= 800) {
          await expect(mobile).toBeVisible();
          await expect(desktop).toBeHidden();
          const order = await page.evaluate(() => {
            const about = document.getElementById("breed-about");
            const facts = document.querySelector('[data-testid="breed-quick-facts-mobile"]');
            return Boolean(about && facts && (about.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING));
          });
          expect(order).toBe(true);
        } else {
          await expect(desktop).toBeVisible();
          await expect(mobile).toBeHidden();
        }
      }
      if (route === "/porovnat-plemena") {
        await expect(page.locator(".compare-breed-heading")).toHaveCount(2);
        for (const heading of await page.locator(".compare-breed-heading h2").all()) {
          await expect(heading).toBeVisible();
          expect(await heading.evaluate(el => getComputedStyle(el).fontFamily)).toContain("Psipedia Newsreader");
        }
        expect(await page.locator(".compare-swap").evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
