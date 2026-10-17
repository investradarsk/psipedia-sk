import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function verifyCompactLayout(page: Page, width: number) {
  const mobile = width <= 760;
  const h1 = page.getByRole("heading", { name: "Automatizácie Gemini", exact: true });
  const heading = page.locator(".admin-heading");
  const metrics = page.getByLabel("Súhrn Gemini automatizácií");
  const history = page.getByRole("heading", { name: "História behov" }).locator("xpath=../..");
  const category = page.getByRole("combobox", { name: "Kategória", exact: true });
  const computed = await h1.evaluate(element => ({
    size: getComputedStyle(element).fontSize,
    family: getComputedStyle(element).fontFamily,
  }));
  expect(computed.size).toBe(mobile ? "24px" : "32px");
  expect(computed.family).not.toMatch(/Georgia|Times New Roman/i);
  expect(await heading.evaluate(element => getComputedStyle(element).paddingBottom))
    .toBe(mobile ? "8px" : "12px");
  const gap = mobile && width <= 540 ? "10px" : "12px";
  expect(await metrics.evaluate(element => getComputedStyle(element).gap)).toBe(gap);
  expect(await history.evaluate(element => getComputedStyle(element).paddingTop))
    .toBe(mobile ? "12px" : "14px");
  await expect(page.getByRole("link", { name: /Prompty kategórií/ })).toBeVisible();
  if (mobile) {
    const controlHeight = await category.evaluate(element => element.getBoundingClientRect().height);
    expect(controlHeight).toBeGreaterThanOrEqual(44);
    const minTapSize = await page.getByRole("button", { name: "Zaradiť vyhľadávanie", exact: true })
      .evaluate(element => element.getBoundingClientRect().height);
    expect(minTapSize).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Measure real computed foreground/background colors in the rendered browser.
  // Keep axe's complete WCAG color-contrast rule enabled below.
  const colorSamples = await page.evaluate(() => {
    const selectors = [
      [".panelHeader span", "Panel heading metadata"],
      [".dashboard .fields label small", "Form secondary guidance"],
      [".microcopy", "Compact explanatory text"],
    ] as const;
    const channels = (color: string): number[] => {
      const match = color.match(/[0-9]+(?:\\.[0-9]+)?/g);
      if (!match || match.length < 3) throw new Error("Unparseable browser color: " + color);
      return match.slice(0, 3).map(Number);
    };
    const luminance = (color: string) => {
      const components = channels(color).map((part) => {
        const value = part / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
    };
    const backgroundFor = (element: Element) => {
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const background = getComputedStyle(parent).backgroundColor;
        const match = background.match(/[0-9]+(?:\\.[0-9]+)?/g);
        if (match && match.length === 3) return background;
        if (match && match.length > 3 && Number(match[3]) >= 1) return background;
      }
      return "rgb(255, 255, 255)";
    };
    return selectors.map(([selector, label]) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Missing accessible secondary text: " + selector);
      const foreground = getComputedStyle(element).color;
      const background = backgroundFor(element);
      const a = luminance(foreground);
      const b = luminance(background);
      return { label, foreground, background, contrast: Number(
        ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2),
      ) };
    });
  });
  for (const sample of colorSamples) {
    console.log("Gemini contrast measured: " + JSON.stringify(sample));
    expect(sample.contrast, sample.label + " text contrast").toBeGreaterThanOrEqual(5);
  }

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = accessibility.violations.filter(item =>
    item.impact === "critical" || item.impact === "serious");
  expect(serious, serious.map(item => item.id + ": " + item.help).join("; ")).toEqual([]);
}

// Isolated local Cloudflare D1, preview-only admin identity, no provider credentials.
// The test NEVER confirms a paid action or issues the Gemini POST.
test("Gemini V3 dashboard: 22 categories, safe confirmation, no overflow, real screenshots", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  let paidPosts = 0;
  await page.route("**/api/admin/gemini-automation/run", (route) => {
    if (route.request().method() === "POST") paidPosts++;
    return route.abort();
  });
  const response = await page.goto("/admin/automatizacie-gemini", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Automatizácie Gemini", exact: true })).toBeVisible();
  const category = page.getByRole("combobox", { name: "Kategória", exact: true });
  await expect(category.locator("option")).toHaveCount(22);
  await expect(page.getByRole("heading", { name: "História behov" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Koncepty z automatizácie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "FIFO fronta" })).toBeVisible();

  const values = await category.locator("option").evaluateAll((elements) =>
    elements.map((element) => (element as HTMLOptionElement).value),
  );
  expect(new Set(values).size).toBe(22);
  await category.selectOption("directory.veterinari");
  await expect(category).toHaveValue("directory.veterinari");
  await expect(page.getByRole("link", { name: "Upraviť prompt" })).toHaveAttribute(
    "href", /stable_key=directory\.veterinari/,
  );
  await expect(page.getByRole("button", { name: /Koncepty z automatizácie/ })).toBeVisible();
  await verifyCompactLayout(page, mobile ? 390 : 1440);
  await category.focus();
  await expect(category).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(category).not.toBeFocused();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: mobile ? ".e2e-artifacts/gemini-dashboard-v3/mobile-390.png" :
      ".e2e-artifacts/gemini-dashboard-v3/desktop-1440.png",
    fullPage: true,
  });

  // First manual click only enters the confirm state. It cannot enqueue work.
  const manual = page.getByRole("button", { name: "Zaradiť vyhľadávanie", exact: true });
  await expect(manual).toBeEnabled();
  await manual.click();
  await expect(page.getByText("Potvrď zaradenie do poradovníka.", { exact: false })).toBeVisible();
  expect(paidPosts).toBe(0);
  await page.getByRole("button", { name: "Zrušiť", exact: true }).click();

  // Unsaved settings require an explicit cancellation/approval before category unmount.
  const maximum = page.getByRole("spinbutton", { name: "Max. nových konceptov" });
  const previous = await maximum.inputValue();
  await maximum.fill(previous === "2" ? "3" : "2");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("neuložené nastavenia");
    await dialog.dismiss();
  });
  await category.selectOption(values.find((value) => value !== "directory.veterinari")!);
  await expect(category).toHaveValue("directory.veterinari");
  expect(paidPosts).toBe(0);

  if (mobile) {
    // Capture a pristine 320px viewport, not a page scrolled to the dirty form.
    // Sticky navigation must start at the top of the full-page screenshot.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("heading", { name: "Automatizácie Gemini", exact: true })).toBeVisible();
    await verifyCompactLayout(page, 320);
    await page.screenshot({
      path: ".e2e-artifacts/gemini-dashboard-v3/mobile-320.png",
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
