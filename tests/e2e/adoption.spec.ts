import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const catalogPath = "/pomoc-psom/adopcia";
const rexPath = `${catalogPath}/e2e-adoption-rex-active`;
const privatePath = `${catalogPath}/e2e-adoption-draft-private`;
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

test("private adoption fixture has no public detail", async ({ page }) => {
  const response = await page.goto(privatePath, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Draft Private" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
