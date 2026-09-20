import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function resetAdminArticleFixtures() {
  if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== "1") {
    throw new Error("ADMIN-2E focused E2E fixture reset is restricted to the isolated local bootstrap environment.");
  }

  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      "tests/fixtures/article-admin-bulk-e2e.sql",
    ],
    { stdio: "inherit", env: process.env },
  );
}

test.describe("ADMIN-2E article bulk execution", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    resetAdminArticleFixtures();
  });

  const rowFor = (page: import("@playwright/test").Page, title: string) =>
    page.locator(".admin-article-row").filter({ hasText: title });

  async function findArticleRowAcrossPages(page: import("@playwright/test").Page, title: string) {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      const row = rowFor(page, title);
      if ((await row.count()) > 0) return row;
      const next = page.getByRole("link", { name: "Ďalšia →" });
      if ((await next.count()) === 0) break;
      const nextHref = await next.getAttribute("href");
      if (!nextHref) break;
      await page.goto(nextHref, { waitUntil: "domcontentloaded" });
    }
    throw new Error(`Article row "${title}" was not found in admin pagination.`);
  }

  test("scopes explicit selection to the current page and publishes only the current-view selection", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Vybrať článok ADMIN-2E Draft A").check();
    await expect(page.getByText("Vybrané: 1")).toBeVisible();

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/\/admin\?page=2$/);
    await expect(page.getByText("Vybrané: 1")).toHaveCount(0);

    await page.getByLabel("Vybrať článok ADMIN-2E Page 001").check();
    await expect(page.getByText("Vybrané: 1")).toBeVisible();

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    const dialog = page.getByRole("dialog", { name: "Publikovať 1 článkov?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("1 výsledkov / 1 eligible / 0 by boli preskočené");
    await dialog.getByRole("button", { name: "Potvrdiť a vykonať: publikovať" }).click();
    await expect(dialog).toContainText("Hotovo: 1 zmenených / 0 preskočených / 0 zlyhaní");
    await expect(dialog).toContainText("Výber bol vyčistený");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();

    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Page 001")).toContainText("Publikovaný");
    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Draft A")).toContainText("Koncept");
  });

  test("select-all visible exposes indeterminate state and clear resets the current view", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const selectAll = page.getByLabel("Vybrať všetky články na tejto strane");
    await selectAll.check();
    await expect(selectAll).toBeChecked();

    const firstSelected = page.getByRole("checkbox", { name: /^Vybrať článok / }).first();
    await expect(firstSelected).toBeChecked();
    await firstSelected.uncheck();
    expect(await selectAll.evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(true);

    await page.getByRole("button", { name: "Zrušiť výber" }).click();
    await expect(selectAll).not.toBeChecked();
    expect(await selectAll.evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(false);
    await expect(page.locator("[data-admin-bulk-toolbar]")).toHaveCount(0);

    await page.getByLabel("Vybrať článok ADMIN-2E Draft A").check();
    await page.getByRole("button", { name: "Koncepty", exact: true }).click();
    await expect(page.locator("[data-admin-bulk-toolbar]")).toHaveCount(0);
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

    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Scheduled B")).toContainText("Publikovaný");
    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Published C")).toContainText("Publikovaný");

    for (const title of ["ADMIN-2E Scheduled B", "ADMIN-2E Published C"]) {
      await findArticleRowAcrossPages(page, title);
      await page.getByLabel(`Vybrať článok ${title}`).check();
      await expect(page.getByText("Vybrané: 1")).toBeVisible();
      await page.getByRole("button", { name: "Skontrolovať presun do konceptov" }).click();
      dialog = page.getByRole("dialog", { name: "Presunúť do konceptov 1 článkov?" });
      await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
      await expect(dialog).toContainText("1 výsledkov / 1 eligible / 0 by boli preskočené");
      await dialog.getByRole("button", { name: "Potvrdiť a vykonať: presunúť do konceptov" }).click();
      await expect(dialog).toContainText("Hotovo: 1 zmenených / 0 preskočených / 0 zlyhaní");
      await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();
    }

    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Scheduled B")).toContainText("Koncept");
    await expect(await findArticleRowAcrossPages(page, "ADMIN-2E Published C")).toContainText("Koncept");
  });

  test("bulk endpoint rejects a request without admin authentication", async ({ request }) => {
    const response = await request.post("http://127.0.0.1:5173/api/admin/bulk/preflight", {
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      data: {
        module: "articles",
        action: "publish",
        selection: { mode: "explicit", ids: [1], filter: {} },
      },
    });
    expect(response.status()).toBe(401);
  });

  test("selection, confirmation dialog and result controls stay keyboard-operable, axe-clean and overflow-free", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const checkbox = page.getByLabel("Vybrať článok ADMIN-2E Draft A");
    await expect(checkbox).toBeEnabled();
    await checkbox.focus();
    await expect(checkbox).toBeFocused();
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
