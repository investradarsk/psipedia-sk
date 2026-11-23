import { expect, test } from "@playwright/test";

/**
 * Isolated, read-only visual evidence for the editorial sections surfaces.
 * Screenshots are review material, NOT pixel-diff approval of the design.
 */
test("desktop admin sections and puppies at 1280 and 1440 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "Desktop screenshots run once in the desktop project.");
  const writes: string[] = [];
  page.on("request", request => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));

  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path, marker] of [
      ["sections", "/admin/sekcie", '[data-testid="admin-section-management"]'],
      ["puppy-coverage", "/admin/steniatka/pokrytie", '[data-testid="admin-puppy-coverage"]'],
      ["puppy-editorial", "/admin/sekcie?sekcia=steniatka", '[data-testid="admin-section-management"]'],
    ] as const) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${path}: HTTP status`).toBeLessThan(400);
      expect(new URL(page.url()).pathname, `${path}: unexpected redirect`).toBe(new URL(path, "https://psipedia.sk").pathname);
      await expect(page.locator(marker).first()).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${name}: unexpected horizontal overflow at ${width}px`,
      ).toBe(true);
      await testInfo.attach(`admin-${name}-${width}px`, {
        body: await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      });
    }
  }
  expect(writes, "visual capture must never mutate records").toEqual([]);
});
