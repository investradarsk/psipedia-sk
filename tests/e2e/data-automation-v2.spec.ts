import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => item.id + ": " + item.help).join("\n")).toEqual([]);
}

const replacementGemini = "/admin/automatizacie-gemini";
const replacementQuality = "/admin/kvalita";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("retired legacy source management and old category links redirect to Gemini", async ({ page }) => {
  for (const legacyPath of [
    "/admin/automatizacie",
    "/admin/automatizacie/zdroje",
    "/admin/automatizacie/podujatia",
    "/admin/automatizacie/veterinari",
    "/admin/automatizacie/zmeny-stavu",
    "/admin/operations/automation/sources",
  ]) {
    const response = await page.goto(legacyPath, { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(replacementGemini + "/?$"));
    await expect(page.getByRole("heading", { name: "Automatizácie Gemini", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pokročilé — všetky zdroje a discovery" })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("retired address review redirects to independent Quality workflow", async ({ page }) => {
  for (const legacyPath of ["/admin/automatizacie/adresy", "/admin/automatizacie/adresy/123"]) {
    const response = await page.goto(legacyPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(replacementQuality + "/?$"));
    await expect(page.getByRole("heading", { name: "Kvalita údajov", exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("retired legacy API refuses source creation, review, and manual runs with HTTP 410", async ({ request }) => {
  const methods: Array<{
    method: "get" | "post" | "put";
    path: string;
    data?: Record<string, unknown>;
  }> = [
    { method: "post", path: "/api/admin/automation-sources", data: { sourceKey: "should-not-be-created" } },
    { method: "put", path: "/api/admin/automation-sources/123", data: { action: "enable" } },
    { method: "post", path: "/api/admin/automation-sources/123/run", data: {} },
    { method: "get", path: "/api/admin/automation-sources/123/run" },
    { method: "post", path: "/api/admin/automation-sources/123/test", data: {} },
    { method: "post", path: "/api/admin/automation-categories/veterinari/search", data: {} },
    { method: "put", path: "/api/admin/automation-source-candidates/123", data: { action: "approve" } },
    { method: "post", path: "/api/admin/automation-lifecycle/123", data: { action: "approve" } },
  ];
  for (const item of methods) {
    const response = await request[item.method](item.path, {
      headers: { origin: "http://localhost:5173", "content-type": "application/json" },
      ...(item.data ? { data: item.data } : {}),
    });
    expect(response.status(), item.method.toUpperCase() + " " + item.path).toBe(410);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json() as { error: string; replacement: string };
    expect(body.error).toContain("vyradené");
    expect(body.replacement).toBe(replacementGemini);
  }
});

test("retired historical detail and source links cannot reopen Tavily screens", async ({ page }) => {
  for (const legacyPath of [
    "/admin/operations/automation/123",
    "/admin/automatizacie/zdroje/123",
    "/admin/automatizacie/podujatia/discovery/123",
  ]) {
    const response = await page.goto(legacyPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(replacementGemini + "/?$"));
    await expect(page.getByRole("heading", { name: "Automatizácie Gemini", exact: true })).toBeVisible();
  }
});
