import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const visualPath = ".e2e-artifacts/admin-editor-v3";
async function screenshot(page: import("@playwright/test").Page, name: string) {
  mkdirSync(visualPath, { recursive: true });
  await page.screenshot({ path: visualPath + "/" + name + ".png", animations: "disabled" });
}
async function verifyNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const bounds = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(bounds.scrollWidth, "Document has unwanted horizontal overflow").toBeLessThanOrEqual(bounds.clientWidth + 1);
}
async function expectHydrated(page: import("@playwright/test").Page) {
  await expect(page.locator("[data-demo-hydrated]")).toHaveAttribute("data-demo-hydrated", "true");
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("desktop/mobile: edit persistence, discard guard, focus restoration and accessibility", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "mobile-chromium" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const response = await page.goto("/admin/editor-workspace-preview");
  expect(response?.status()).toBe(200);
  await expectHydrated(page);
  const opener = page.getByRole("button", { name: "Otvoriť testovací editor" });
  await opener.click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await expect(editor).toBeVisible();
  await screenshot(page, info.project.name === "mobile-chromium" ? "mobile-390-editor" : "desktop-1440-editor");
  await verifyNoHorizontalOverflow(page);
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
  if (info.project.name !== "mobile-chromium") await screenshot(page, "unsaved-changes-dialog");
  await page.keyboard.press("Escape");
  await expect(guard).not.toBeVisible();
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Zavrieť dialóg" }).click();
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Zavrieť dialóg" }).click();
  await guard.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(editor).not.toBeVisible();
  await expect(opener).toBeFocused();
  await verifyNoHorizontalOverflow(page);
});

test("saving stays draft-only; publishing requires separate explicit confirmation", async ({ page }) => {
  await page.goto("/admin/editor-workspace-preview");
  await expectHydrated(page);
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
  await expectHydrated(page);
  await page.getByLabel("Zobrazenie").selectOption("page");
  await expect(page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" })).toHaveCount(0);
  const root = page.locator("[data-editor-page]");
  await expect(root.getByRole("heading", { name: "Upraviť koncept — lokálna ukážka" })).toBeVisible();
  await root.getByLabel("Názov profilu").fill("Stránkový editor");
  if (test.info().project.name === "mobile-chromium") {
    // On mobile the preview is a separate panel; verify the required explicit switch.
    await root.getByRole("button", { name: "Náhľad" }).click();
  }
  await expect(root.getByRole("region", { name: "Náhľad profilu" })).toContainText("Stránkový editor");
  await verifyNoHorizontalOverflow(page);
  await screenshot(page, "standalone-page-" + (test.info().project.name === "mobile-chromium" ? "mobile-390" : "desktop-1440"));
});

test("320px narrow mobile keeps footer actions accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto("/admin/editor-workspace-preview");
  await expectHydrated(page);
  await page.getByRole("button", { name: "Otvoriť testovací editor" }).click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await expect(editor.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Publikovať…" })).toBeVisible();
  expect(await editor.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(320);
  await verifyNoHorizontalOverflow(page);
  await screenshot(page, "mobile-320-editor-" + test.info().project.name);
});

test("clean editor closes via Escape and returns focus to opener", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "mobile-chromium" ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto("/admin/editor-workspace-preview");
  await expectHydrated(page);
  const opener = page.getByRole("button", { name: "Otvoriť testovací editor" });
  await opener.click();
  const editor = page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" });
  await expect(editor).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await editor.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await editor.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("browser console has no page errors and opening editor causes no writes", async ({ page }) => {
  const pageErrors: string[] = [];
  const writeRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writeRequests.push(request.url());
  });
  await page.goto("/admin/editor-workspace-preview");
  await expectHydrated(page);
  await page.getByRole("button", { name: "Otvoriť testovací editor" }).click();
  await expect(page.getByRole("dialog", { name: "Upraviť koncept — lokálna ukážka" })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(writeRequests).toEqual([]);
});
