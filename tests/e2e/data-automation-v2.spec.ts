import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => item.id + ": " + item.help).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("automation source management is responsive and axe-clean on admin desktop/mobile projects", async ({ page }) => {
  const response = await page.goto("/admin/operations/automation/sources", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Zdroje a discovery", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stav automatizácie", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("manual source lifecycle covers create edit review enable test run-now and disable", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const sourceKey = ("e2e-manual-" + suffix).slice(0, 70);
  const label = "E2E Manual " + testInfo.project.name;

  const response = await page.goto("/admin/operations/automation/sources", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const form = page.getByRole("form", { name: "Pridať automation source" });
  await form.getByLabel("Source key").fill(sourceKey);
  await form.getByLabel("Názov").fill(label);
  await form.getByLabel("Entity type").selectOption("DIRECTORY");
  await form.getByLabel("Connector").selectOption("MANUAL_IMPORT");
  await form.getByLabel("Source URL").fill("");
  await form.getByLabel("Mapping / config JSON").fill("{}");
  await form.getByRole("button", { name: "Vytvoriť vypnutý zdroj" }).click();

  await expect(page.getByRole("status")).toContainText("čaká na explicitné review");
  const sourceLink = page.getByRole("link", { name: label, exact: true });
  await expect(sourceLink).toBeVisible();
  await sourceLink.click();

  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  const editedLabel = label + " edited";
  await page.getByLabel("Názov").fill(editedLabel);
  await page.getByRole("button", { name: "Uložiť konfiguráciu" }).click();
  await expect(page.getByRole("status")).toContainText("Zmena bola uložená");
  await expect(page.getByRole("heading", { name: editedLabel, exact: true })).toBeVisible();

  await page.getByLabel("Poznámka reviewera").fill("E2E explicit source review");
  await page.getByRole("button", { name: "Schváliť zdroj" }).click();
  await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();

  const enable = page.getByRole("button", { name: "Zapnúť" });
  await expect(enable).toBeEnabled();
  await enable.click();
  await expect(page.getByText("ENABLED", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Otestovať zdroj" }).click();
  await expect(page.getByRole("heading", { name: "Výsledok testu zdroja" })).toBeVisible();
  await expect(page.getByText(/Writes: observations 0, findings 0, canonical 0, publications 0/)).toBeVisible();

  await page.getByRole("button", { name: "Spustiť kontrolu teraz" }).click();
  await expect(page.getByRole("heading", { name: "Run now summary" })).toBeVisible();
  await expect(page.getByText(/SUCCESS.*checked 0.*new findings 0.*errors 0/)).toBeVisible();

  await page.getByRole("button", { name: "Vypnúť" }).click();
  await expect(page.getByText("DISABLED", { exact: true }).first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
