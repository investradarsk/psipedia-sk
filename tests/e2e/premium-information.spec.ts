import { expect, test } from "@playwright/test";

const routes = ["/kontakt", "/o-nas", "/podmienky-pouzivania", "/pravne-informacie", "/sukromie", "/cookies", "/zasady-obsahu", "/opravy-a-podnety", "/novinky/poslat-tip"];

for (const route of routes) {
  test(`V2-13 ${route}: readable, responsive local premium content`, async ({ page }, testInfo) => {
    const widths = testInfo.project.name === "mobile-chromium" ? [320, 390, 768] : [1024, 1440, 1920];
    await page.setViewportSize({ width: widths[0], height: 900 });
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main#obsah h1")).toHaveCount(1);
    const local = route === "/kontakt" ? page.locator("[data-contact-routes]") :
      route === "/novinky/poslat-tip" ? page.locator(".news-tip-form") :
      page.locator("main#obsah .prose-page");
    await expect(local).toBeVisible();
    const heading = local.locator("h2, h3").first();
    await expect(heading).toHaveCSS("font-family", /Psipedia Newsreader/);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const fits = await page.evaluate(() => {
        const main = document.querySelector("main#obsah");
        return !!main && main.scrollWidth <= main.clientWidth + 1;
      });
      expect(fits, `${route} at ${width}px`).toBe(true);
    }
    if (route === "/kontakt") {
      await expect(local.locator("[data-contact-route]").first()).toHaveCSS("border-radius", "14px");
      await expect(local.locator("[data-contact-route]")).toHaveCount(10);
    } else if (route === "/novinky/poslat-tip") {
      await expect(local).toHaveCSS("border-radius", "14px");
      await expect(local.getByRole("textbox", { name: "Krátky názov tipu" })).toHaveCSS("border-radius", "9px");
      await expect(local.getByRole("checkbox")).toBeVisible();
      await expect(local.getByRole("button", { name: "Odoslať tip redakcii" })).toBeEnabled();
    } else if (route === "/cookies") {
      await expect(local.getByRole("button", { name: "Vymazať obľúbené z tohto zariadenia" })).toBeVisible();
      await expect(local.getByRole("button", { name: /Povoliť Google Maps|Vypnúť Google Maps/ })).toBeVisible();
    }
  });
}
