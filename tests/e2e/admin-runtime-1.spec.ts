import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminNavigationItems } from "../../lib/admin-navigation";

const primaryRoutes = adminNavigationItems.map((item) => item.href);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("all primary admin routes render without Worker/runtime crashes", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  for (const route of primaryRoutes) {
    const pageErrors: string[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    page.on("pageerror", onPageError);

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, route).not.toBeNull();
    expect(response?.status(), route).toBeLessThan(500);
    expect(new URL(page.url()).pathname, route).not.toBe("/admin/nepovoleny");
    await expect(page.locator("main#obsah"), route).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body, route).not.toMatch(/Error 1101|Worker threw exception|Application error: a server-side exception/i);
    expect(pageErrors, `${route}: ${pageErrors.join(" | ")}`).toEqual([]);
    page.off("pageerror", onPageError);
  }
});

test("data quality is responsive, accessible and exposes safe pagination", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto("/admin/kvalita?page=1&mediaPage=1", { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(500);
  expect(new URL(page.url()).pathname).toBe("/admin/kvalita");
  await expect(page.getByRole("heading", { name: "Kvalita údajov", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skontrolovať teraz" })).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Error 1101|Worker threw exception|SELECT .* FROM|at .*\(.+\.tsx?:\d+/i);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
});

test("representative existing directory detail loads from isolated fixture", async ({ page }) => {
  const response = await page.goto("/admin/adresar?q=Directory+Admin+Editor+Fixture", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);

  const detail = page.getByRole("link", { name: "Directory Admin Editor Fixture", exact: true }).first();
  await expect(detail).toBeVisible();
  const detailHref = await detail.getAttribute("href");
  expect(detailHref).toMatch(/^\/admin\/adresar\/\d+$/);

  const detailResponse = await page.goto(detailHref!, { waitUntil: "domcontentloaded" });
  expect(detailResponse).not.toBeNull();
  expect(detailResponse?.status()).toBeLessThan(500);
  expect(new URL(page.url()).pathname).toMatch(/^\/admin\/adresar\/\d+$/);
  await expect(page.getByRole("heading", { name: /Directory Admin Editor Fixture/i }).first()).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/Error 1101|Worker threw exception/i);
});

test("representative missing admin details fail safely without Worker crashes", async ({ page }) => {
  for (const route of [
    "/admin/adresar/999999999",
    "/admin/organizacie/999999999",
    "/admin/podujatia/999999999",
    "/admin/adopcie/999999999",
    "/admin/pomoc/999999999",
    "/admin/stratene-najdene/999999999",
    "/admin/recenzie-profilov/999999999",
  ]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, route).not.toBeNull();
    expect(response?.status(), route).toBeLessThan(500);
    expect(new URL(page.url()).pathname, route).not.toBe("/admin/nepovoleny");
    expect(await page.locator("body").innerText(), route).not.toMatch(/Error 1101|Worker threw exception/i);
  }
});
