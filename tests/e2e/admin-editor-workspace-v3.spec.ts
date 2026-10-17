import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("desktop/mobile: edit persistence, discard guard, focus restoration and accessibility", async ({ page }, info) => {
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/admin/editor-workspace-preview");
  expect(response?.status()).toBe(200);
  const opener = page.getByRole("button", { name: "Otvoriť testovací editor" });
  await opener.click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Názov profilu").fill("Test bez zápisov");
  if (info.project.name === "mobile-chromium") {
    await editor.getByLabel("Sekcia editora").selectOption("demo-contact");
    await editor.getByRole("button", { name: "Náhľad" }).click();
    await expect(editor.getByRole("region", { name: "Náhľad profilu" })).toContainText("Test bez zápisov");
    await editor.getByRole("button", { name: "Späť na úpravy" }).click();
  } else {
    await editor.getByRole("button", { name: "Kontakt", exact: true }).click();
  }
  await expect(editor.getByLabel("Názov profilu")).toHaveValue("Test bez zápisov");
  expect(await editor.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThanOrEqual(page.viewportSize()!.width);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(audit.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);

  await editor.getByRole("button", { name: "Zavrieť dialóg" }).click();
  const guard = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Zavrieť dialóg" }).click();
  await guard.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(editor).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("saving stays draft-only; publishing requires separate explicit confirmation", async ({ page }) => {
  await page.goto("/admin/editor-workspace-preview");
  await page.getByRole("button", { name: "Otvoriť testovací editor" }).click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await editor.getByLabel("Názov profilu").fill("Uložený koncept");
  await editor.getByRole("button", { name: "Uložiť koncept" }).click();
  await expect(editor.getByText("Nezverejnený koncept")).toBeVisible();
  await expect(editor.getByText("Koncept uložený iba do lokálneho stavu.")).toBeVisible();
  await editor.getByRole("button", { name: "Publikovať…" }).click();
  const confirm = page.getByRole("dialog", { name: "Potvrdiť publikovanie?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Zrušiť" }).click();
  await expect(editor.getByText("Nezverejnený koncept")).toBeVisible();
  await editor.getByRole("button", { name: "Publikovať…" }).click();
  await confirm.getByRole("button", { name: "Potvrdiť lokálne publikovanie" }).click();
  await expect(editor.getByText("Lokálne publikované")).toBeVisible();
});

test("same composition supports page layout", async ({ page }) => {
  await page.goto("/admin/editor-workspace-preview");
  await page.getByLabel("Zobrazenie").selectOption("page");
  await expect(page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" })).toHaveCount(0);
  const root = page.locator("[data-editor-page]");
  await expect(root.getByRole("heading", { name: "Upraviť koncept — lokálna ukážka" })).toBeVisible();
  await root.getByLabel("Názov profilu").fill("Stránkový editor");
  await expect(root.getByRole("region", { name: "Náhľad profilu" })).toContainText("Stránkový editor");
});

test("320px narrow mobile keeps footer actions accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto("/admin/editor-workspace-preview");
  await page.getByRole("button", { name: "Otvoriť testovací editor" }).click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await expect(editor.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Publikovať…" })).toBeVisible();
  expect(await editor.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(320);
});
