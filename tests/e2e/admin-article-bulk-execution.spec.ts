import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("ADMIN-2E article bulk execution", () => {
  test.describe.configure({ mode: "serial" });

  const rowFor = (page: import("@playwright/test").Page, title: string) =>
    page.locator(".admin-article-row").filter({ hasText: title });

  test("keeps explicit selection across pagination and publishes only selected eligible articles", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Vybrať článok ADMIN-2E Draft A").check();
    await expect(page.getByText("Vybrané: 1")).toBeVisible();

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/\/admin\?page=2$/);
    await expect(page.getByText("Vybrané: 1")).toBeVisible();
    await page.getByLabel("Vybrať článok ADMIN-2E Page 001").check();
    await expect(page.getByText("Vybrané: 2")).toBeVisible();

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    const dialog = page.getByRole("dialog", { name: "Publikovať 2 článkov?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 2 eligible / 0 by boli preskočené");
    await dialog.getByRole("button", { name: "Potvrdiť a vykonať: publikovať" }).click();
    await expect(dialog).toContainText("Hotovo: 2 zmenených / 0 preskočených / 0 zlyhaní");
    await expect(dialog).toContainText("Výber bol vyčistený");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();

    await expect(rowFor(page, "ADMIN-2E Page 001")).toContainText("Publikovaný");
    await page.getByRole("link", { name: "← Predchádzajúca" }).click();
    await expect(rowFor(page, "ADMIN-2E Draft A")).toContainText("Publikovaný");
    await expect(page.getByText("Vybrané: 2")).toHaveCount(0);
  });

  test("reports mixed publish result and then moves published and scheduled lifecycle records to draft", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Vybrať článok ADMIN-2E Scheduled B").check();
    await page.getByLabel("Vybrať článok ADMIN-2E Published C").check();

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    let dialog = page.getByRole("dialog", { name: "Publikovať 2 článkov?" });
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 1 eligible / 1 by boli preskočené");
    await expect(dialog).toContainText("už sú v cieľovom stave");
    await dialog.getByRole("button", { name: "Potvrdiť a vykonať: publikovať" }).click();
    await expect(dialog).toContainText("Hotovo: 1 zmenených / 1 preskočených / 0 zlyhaní");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();

    await expect(rowFor(page, "ADMIN-2E Scheduled B")).toContainText("Publikovaný");
    await expect(rowFor(page, "ADMIN-2E Published C")).toContainText("Publikovaný");

    await page.getByLabel("Vybrať článok ADMIN-2E Scheduled B").check();
    await page.getByLabel("Vybrať článok ADMIN-2E Published C").check();
    await page.getByRole("button", { name: "Skontrolovať presun do konceptov" }).click();
    dialog = page.getByRole("dialog", { name: "Presunúť do konceptov 2 článkov?" });
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 2 eligible / 0 by boli preskočené");
    await dialog.getByRole("button", { name: "Potvrdiť a vykonať: presunúť do konceptov" }).click();
    await expect(dialog).toContainText("Hotovo: 2 zmenených / 0 preskočených / 0 zlyhaní");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();

    await expect(rowFor(page, "ADMIN-2E Scheduled B")).toContainText("Koncept");
    await expect(rowFor(page, "ADMIN-2E Published C")).toContainText("Koncept");
  });

  test("selection, confirmation dialog and result controls stay keyboard-operable, axe-clean and overflow-free", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const checkbox = page.getByLabel("Vybrať článok ADMIN-2E Draft A");
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();

    const toolbarScan = await new AxeBuilder({ page })
      .include('aside[aria-label="Hromadný výber"]')
      .analyze();
    expect(toolbarScan.violations).toEqual([]);

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    const dialog = page.getByRole("dialog", { name: "Publikovať 1 článkov?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Spustiť preflight" })).toBeFocused();

    const dialogScan = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(dialogScan.violations).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (!box || !viewport) throw new Error("Dialog or viewport was not measurable.");
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

    await dialog.getByRole("button", { name: "Zavrieť" }).click();
  });
});
