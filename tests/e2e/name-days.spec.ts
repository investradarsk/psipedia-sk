import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

function bratislavaParts() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", month: "numeric", day: "numeric" }).formatToParts(new Date());
  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

test.beforeEach(async ({ page, baseURL }) => {
  const host = new URL(baseURL!).hostname;
  test.skip(!["localhost", "127.0.0.1"].includes(host), "NAME-DAY-1 write coverage runs only against isolated local D1.");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("admin create/edit/publish/archive drives the fail-closed public header", async ({ page }, testInfo) => {
  const uniqueName = `TEST-NAME-DAY-${testInfo.project.name}-${Date.now()}`;
  const { month, day } = bratislavaParts();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/admin/meniny");
  await expect(page.getByRole("heading", { name: "Canonical psie meniny" })).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole("button", { name: "+ Nové meno" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Mesiac").selectOption(String(month));
  await dialog.getByLabel("Deň").fill(String(day));
  await dialog.getByLabel("Meno").fill(uniqueName);
  await dialog.getByLabel("Zdroj / proveniencia").fill("E2E fixture only — not canonical production data");
  await dialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(page.getByText("Záznam bol vytvorený.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: uniqueName })).toBeVisible();

  await page.getByRole("button", { name: "+ Nové meno" }).click();
  const duplicateDialog = page.locator("dialog[open]");
  await duplicateDialog.getByLabel("Mesiac").selectOption(String(month));
  await duplicateDialog.getByLabel("Deň").fill(String(day));
  await duplicateDialog.getByLabel("Meno").fill(uniqueName);
  await duplicateDialog.getByLabel("Zdroj / proveniencia").fill("E2E duplicate check");
  await duplicateDialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("už pre rovnaký deň existuje");
  await duplicateDialog.getByRole("button", { name: "Zrušiť" }).click();

  await page.goto("/");
  await expect(page.getByText(/Psie meniny:/)).toHaveCount(0);

  await page.goto("/admin/meniny");
  const row = page.getByRole("row").filter({ hasText: uniqueName });
  await row.getByRole("button", { name: "Upraviť" }).click();
  const editDialog = page.locator("dialog[open]");
  await editDialog.getByLabel("Stav").selectOption("published");
  await editDialog.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(page.getByText("Záznam bol upravený.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(uniqueName, { exact: true })).toBeVisible();
  await expectAxeClean(page);

  await page.goto("/admin/meniny");
  const publishedRow = page.getByRole("row").filter({ hasText: uniqueName });
  await publishedRow.getByRole("button", { name: "Archivovať" }).click();
  const confirm = page.locator("dialog[open]");
  await confirm.getByRole("button", { name: "Archivovať", exact: true }).click();
  await expect(page.getByText("Záznam bol archivovaný a nie je verejne eligible.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(uniqueName, { exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
