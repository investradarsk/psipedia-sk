import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";
const CAMPAIGN_ID = "e2e-monetization-global-bottom";

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.describe("MONETIZATION-1 public foundation", () => {
  test("active direct campaign is labeled, tracked and mobile-safe", async ({ page }) => {
    await page.addInitScript(([key]) => localStorage.setItem(key, "analytics"), [CONSENT_KEY]);
    await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    const events: string[] = [];
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/monetization/event")) return;
      const body = request.postData() ?? "";
      if (body.includes(CAMPAIGN_ID)) events.push(body);
    });

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);

    const slot = page.locator('[data-ad-placement="home_bottom"]');
    await expect(slot).toBeVisible();
    await expect(slot.getByText("Reklama", { exact: true })).toBeVisible();
    const link = slot.getByRole("link", { name: /Reklama: Test reklamného placementu/ });
    await expect(link).toHaveAttribute("rel", /sponsored/);

    await expect.poll(() => events.some((body) => body.includes('"eventType":"impression"'))).toBe(true);

    await page.evaluate(() => {
      document.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        if (target?.closest('[data-ad-placement] a')) event.preventDefault();
      }, true);
    });
    const clickResponsePromise = page.waitForResponse((candidate) =>
      candidate.url().endsWith("/api/monetization/event")
      && candidate.request().postData()?.includes('"eventType":"click"') === true,
    );
    await link.click();
    const clickResponse = await clickResponsePromise;
    expect(clickResponse.status()).toBe(202);

    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expectAxeClean(page);
  });

  test("necessary consent suppresses measurement and programmatic script; analytics still suppresses programmatic", async ({ page }) => {
    const measurementRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/monetization/event")) measurementRequests.push(request.postData() ?? "");
    });
    await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    expect(measurementRequests).toEqual([]);
    await expect(page.locator("script[data-psipedia-programmatic-ads]")).toHaveCount(0);

    await page.route("https://www.googletagmanager.com/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }));
    await page.evaluate(([key]) => localStorage.setItem(key, "analytics"), [CONSENT_KEY]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("script[data-psipedia-programmatic-ads]")).toHaveCount(0);
  });
});
