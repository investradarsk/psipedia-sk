import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const migrationManifest = JSON.parse(readFileSync("data/imports/adoptions-ready-2026-09-13.json", "utf8")) as { ready: Array<{ slug: string; dogName: string }> };

const catalogPath = "/pomoc-psom/adopcia";
const rexPath = `${catalogPath}/e2e-adoption-rex-active`;
const nonPublicCanonicalPaths = [
  "e2e-adoption-draft-private",
  "e2e-adoption-adopted-private",
  "e2e-adoption-archived-private",
];
const privateNames = ["E2E Draft Private", "E2E Adopted Private", "E2E Archived Private"];

async function expectNoCriticalAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const critical = result.violations.filter((violation) => violation.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("seeded adoption catalogue, filters and detail stay public-safe and accessible", async ({ page }) => {
  const response = await page.goto(catalogPath, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Psy na adopciu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Luna", exact: true })).toBeVisible();
  for (const name of privateNames) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expectNoCriticalAxeViolations(page);
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("Hľadať").fill("E2E Rex");
  await page.getByRole("button", { name: "Filtrovať" }).click();
  await expect(page).toHaveURL(/q=E2E(?:\+|%20)Rex/);
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Luna", exact: true })).toHaveCount(0);

  await page.goto(`${catalogPath}?stav=RESERVED`, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Stav")).toHaveValue("RESERVED");
  await expect(page.getByRole("link", { name: "E2E Luna", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toHaveCount(0);

  await page.goto(catalogPath, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "E2E Rex", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${rexPath}$`));
  await expect(page.getByRole("heading", { level: 1, name: "E2E Rex" })).toBeVisible();
  await expect(page.getByText("Na adopciu", { exact: true })).toBeVisible();
  await expect(page.getByText("Labradorský retriever", { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E útulok Nitra/)).toBeVisible();
  await expectNoCriticalAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});

test("non-public canonical lifecycle never falls back to matching published legacy adoption", async ({ page }) => {
  for (const slug of nonPublicCanonicalPaths) {
    const response = await page.goto(`${catalogPath}/${slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), slug).toBe(404);
    await expect(page.locator('[data-adoption-source="canonical"]')).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});

test("missing canonical adoption never falls back to an existing published legacy adoption", async ({ page }) => {
  const response = await page.goto(`${catalogPath}/e2e-adopcia`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "E2E adopcia psa" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("all 36 activated migration profiles resolve to canonical detail", async ({ request }) => {
  expect(migrationManifest.ready).toHaveLength(36);
  for (const dog of migrationManifest.ready) {
    const response = await request.get(`${catalogPath}/${dog.slug}`);
    expect(response.status(), dog.slug).toBe(200);
    const html = await response.text();
    expect(html, dog.slug).toContain('data-adoption-source="canonical"');
    expect(html, dog.slug).toContain(dog.dogName);
  }
});
