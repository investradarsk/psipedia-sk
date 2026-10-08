import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("CONTENT-HUB CTA is bounded, within the feed, and leaves pillar and article cards intact", async ({ page }) => {
  for (const path of ["/starostlivost/zdravie", "/steniatka/prve-dni", "/aktivity/trening"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const list = page.locator("[data-section-content-list] [role=list]");
    const articles = list.locator("[data-article-list-item]");
    const ctas = list.locator("[data-contextual-hub-cta]");
    const count = await articles.count();
    expect(await ctas.count()).toBe(count >= (path === "/starostlivost/zdravie" ? 1 : 4) ? 1 : 0);
    if (await ctas.count()) {
      expect(await ctas.first().locator("a").count()).toBeGreaterThan(0);
      expect(await ctas.first().locator("a").count()).toBeLessThanOrEqual(2);
      expect(await ctas.first().evaluate((node) => node.closest("[role=list]") !== null)).toBe(true);
    }
    if (path.startsWith("/steniatka/")) {
      expect(await page.locator("[data-content-hub-pillar]").count()).toBeLessThanOrEqual(1);
    }
  }
});

test("CONTENT-HUB health CTA has exact safety text and destinations", async ({ page }) => {
  await page.goto("/starostlivost/zdravie");
  const cta = page.locator("[data-contextual-hub-cta][data-cta-key=health-urgent]");
  test.skip(await cta.count() === 0, "Fixture has no published health article.");
  await expect(cta.getByRole("heading", { name: "Keď ide o čas" })).toBeVisible();
  await expect(cta.getByText("Má pes akútny problém?")).toBeVisible();
  await expect(cta.getByText("Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.")).toBeVisible();
  await expect(cta.getByRole("link", { name: "Kedy ísť k veterinárovi" })).toHaveAttribute("href", "/starostlivost/kedy-ist-so-psom-k-veterinarovi");
  await expect(cta.getByRole("link", { name: "Nájsť veterinára" })).toHaveAttribute("href", "/adresar/veterinari");
});

for (const width of [1440, 430, 390]) {
  test(`CONTENT-HUB CTA responsive and keyboard/accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/starostlivost/zdravie");
    const size = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    const cta = page.locator("[data-contextual-hub-cta]");
    if (await cta.count()) {
      const firstLink = cta.first().locator("a").first();
      await firstLink.focus();
      await expect(firstLink).toBeFocused();
      const result = await new AxeBuilder({ page }).include("[data-contextual-hub-cta]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    }
  });
}
