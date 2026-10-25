import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const migrationManifest = JSON.parse(readFileSync("data/imports/adoptions-ready-2026-09-13.json", "utf8")) as { ready: Array<{ slug: string; dogName: string }> };

test.beforeEach(async ({ page }) => {
  // The catalogue journeys intentionally test adoption, not undecided cookies.
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

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


test("adoption editor keeps unsaved input on cancelled navigation and discards only on confirmation", async ({ page }) => {
  const response = await page.goto("/admin/adopcie/novy", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const form = page.locator("form.admin-event-editor");
  await expect(form).toHaveAttribute("data-hydrated", "true");

  const name = form.locator("#adoption-name");
  await name.fill("Rozpracovaný adopčný profil");
  await expect(form.locator("[data-editor-status]")).toContainText("Neuložené zmeny");
  const writes: string[] = [];
  page.on("request", request => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
        request.url().includes("/api/admin/adoptions")) writes.push(request.url());
  });

  await form.getByRole("link", { name: "Zrušiť", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(dialog).toBeVisible();
  const stay = dialog.getByRole("button", { name: "Pokračovať v úpravách" });
  await expect(stay).toBeFocused();
  await stay.click();
  await expect(name).toHaveValue("Rozpracovaný adopčný profil");
  await expect(page).toHaveURL(/\/admin\/adopcie\/novy$/);

  await form.getByRole("link", { name: "Zrušiť", exact: true }).click();
  await dialog.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(page).toHaveURL(/\/admin\/adopcie$/);
  expect(writes).toEqual([]);
});

test("seeded adoption catalogue, filters and detail stay public-safe and accessible", async ({ page }) => {
  const response = await page.goto(catalogPath, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Psy na adopciu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Rex", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Luna", exact: true })).toBeVisible();
  for (const name of privateNames) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expectNoCriticalAxeViolations(page);
  await expectNoHorizontalOverflow(page);

  const heroSearch = page.locator('[data-unified-hero-portal-search] [data-public-search-form="adoptions"]');
  await expect(heroSearch).toHaveCount(1);
  await heroSearch.getByRole("textbox", { name: "Hľadať psa na adopciu" }).fill("E2E Rex");
  await heroSearch.getByRole("button", { name: "Hľadať", exact: true }).click();
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
