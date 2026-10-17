import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

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
  const category = page.getByLabel("Kategória", { exact: true });
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
  const maximum = page.getByLabel("Max. nových konceptov");
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
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: ".e2e-artifacts/gemini-dashboard-v3/mobile-320.png",
      fullPage: true,
    });
  }
});
