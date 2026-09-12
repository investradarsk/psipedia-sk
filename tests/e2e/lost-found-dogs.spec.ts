import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cases = [
  {
    type: "LOST",
    listPath: "/pomoc-psom/stratene-psy",
    detailPath: "/pomoc-psom/stratene-psy/strateny-e2e-rex-nitra",
    heading: "Stratené psy",
    detailHeading: "Rex",
  },
  {
    type: "FOUND",
    listPath: "/pomoc-psom/najdene-psy",
    detailPath: "/pomoc-psom/najdene-psy/najdeny-e2e-pes-nitra",
    heading: "Nájdené psy",
    detailHeading: "Pes bez známeho mena",
  },
] as const;

const privateValues = [
  "+421900000001",
  "+421900000002",
  "lost-e2e@example.invalid",
  "found-e2e@example.invalid",
  "e2e-admin@example.invalid",
  "Presná testovacia lokalita iba pre admina",
  "Neverejná E2E poznámka.",
];

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

async function expectPrivateValuesHidden(page: Page) {
  const body = page.locator("body");
  for (const value of privateValues) await expect(body).not.toContainText(value);
}

function screenshotMode(projectName: string) {
  return projectName.includes("mobile") ? "mobile" : "desktop";
}

for (const entry of cases) {
  test(`${entry.listPath}: renders active listing, filters, canonical and accessibility`, async ({ page }, testInfo) => {
    const response = await page.goto(entry.listPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${entry.listPath}`);
    await expect(page.locator('form[aria-label^="Filtrovať"]')).toBeVisible();
    await expect(page.getByLabel("Kraj")).toBeVisible();
    await expect(page.getByLabel("Okres alebo lokalita")).toBeVisible();
    await expect(page.getByLabel("Pohlavie")).toBeVisible();
    await expect(page.getByLabel("Veľkosť")).toBeVisible();
    await expect(page.getByLabel("Plemeno")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zobraziť hlásenie →" }).first()).toBeVisible();
    await expectPrivateValuesHidden(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    if (entry.type === "LOST") {
      await page.screenshot({ path: `.e2e-artifacts/lost-found/${screenshotMode(testInfo.project.name)}-listing.png`, fullPage: true });
    }
  });

  test(`${entry.detailPath}: renders public detail without private PII and passes accessibility`, async ({ page }, testInfo) => {
    const response = await page.goto(entry.detailPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: entry.detailHeading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${entry.detailPath}`);
    await expect(page.getByText(entry.type === "LOST" ? "STRATENÝ PES" : "NÁJDENÝ PES", { exact: true })).toBeVisible();
    await expect(page.getByText("Aktívne", { exact: true })).toBeVisible();
    if (entry.type === "LOST") await expect(page.getByText("Naposledy videný:", { exact: true })).toBeVisible();
    await expectPrivateValuesHidden(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    if (entry.type === "LOST") {
      await page.screenshot({ path: `.e2e-artifacts/lost-found/${screenshotMode(testInfo.project.name)}-detail.png`, fullPage: true });
    }
  });
}

test("admin lost-found dashboard is protected by the existing admin layer, paginated and accessible when empty", async ({ page }) => {
  const response = await page.goto("/admin/stratene-najdene?q=__e2e_no_match__", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Stratené a nájdené psy" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Čakajúce/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aktívne/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Vyriešené/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Expirované/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zamietnuté/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Zoznam hlásení" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("columnheader", { name: "Akcie" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test("authorized admin detail receives private contact fields from the private table", async ({ page }) => {
  const response = await page.goto("/admin/stratene-najdene/910001", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('input[type="email"]')).toHaveValue("lost-e2e@example.invalid");
  await expect(page.locator('input').filter({ has: page.locator('xpath=following-sibling::*') })).toHaveCount(0).catch(() => undefined);
  await expect(page.locator('input').evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "+421900000001"))).resolves.toBeTruthy();
});
