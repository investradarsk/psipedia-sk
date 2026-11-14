import { expect, test, type Page } from "@playwright/test";

async function selectArticleTab(page: Page, id: string, label: string) {
  const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
  const picker = nav.getByLabel("Sekcia editora");
  if (await picker.isVisible()) await picker.selectOption(id);
  else await nav.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator("#" + id)).toBeVisible();
}

test("Work round 2: article toolbar appears only on editable text tabs and stays single-row", async ({ page }, info) => {
  const widths = info.project.name === "mobile-chromium" ? [390] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await selectArticleTab(page, "article-settings", "Nastavenia");
    await expect(page.locator("[data-admin-tiptap-toolbar]")).toHaveCount(0);
    await selectArticleTab(page, "article-blocks", "Bloky článku");
    const toolbar = page.locator("[data-admin-tiptap-toolbar]");
    await expect(toolbar).toBeVisible();
    const tools = toolbar.getByRole("group", { name: "Posúvateľná lišta nástrojov formátovania" });
    await expect(tools).toHaveCSS("flex-wrap", "nowrap");
    const bounds = await toolbar.boundingBox();
    expect(bounds?.height ?? 100).toBeLessThan(85);
    await selectArticleTab(page, "article-basics", "Úvod a obsah");
    await expect(toolbar).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const label = document.querySelector('label[for="article-title"]');
      const formatting = document.querySelector("[data-admin-tiptap-toolbar]");
      return Boolean(label && formatting &&
        label.getBoundingClientRect().top >= formatting.getBoundingClientRect().bottom + 4);
    })).toBe(true);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});

test("Work round 2: breed editor keeps one title and accessible secondary menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const first = page.locator('[data-admin-breed-row] a[href^="/admin/plemena/"]').first();
  test.skip(!(await first.count()), "The test environment has no breed records");
  await first.click();
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
  await expect(page.locator("[data-editor-header] h1")).toHaveCount(0);
  const actions = page.locator("[data-breed-more-actions]");
  await expect(actions.locator("summary")).toBeVisible();
  await actions.locator("summary").click();
  await expect(actions.getByRole("button", { name: "Prejsť na FCI štandard" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Aktualizovať z Notionu" })).toBeVisible();
  const footer = page.locator("[data-editor-actionbar]");
  const published = await page.getByText("Publikované", { exact: true }).first().isVisible();
  if (published) {
    await expect(footer.getByRole("button", { name: "Uložiť zmeny", exact: true })).toHaveCount(1);
    await expect(footer.getByRole("button", { name: "Uložiť a aktualizovať" })).toHaveCount(0);
  }
});

test("Work round 2: moderation filter uses Slovak display values without changing URL enums", async ({ page }) => {
  const response = await page.goto("/admin/recenzie-profilov?status=all", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('select[name="status"]')).toHaveValue("all");
  const pending = page.locator('select[name="status"] option[value="PENDING_REVIEW"]');
  await expect(pending).toHaveText("Čaká na kontrolu");
  const removed = page.locator('select[name="status"] option[value="REMOVED"]');
  await expect(removed).toHaveText("Odstránená moderátorom");
});

test("Work round 2: review hub has small direct actions and collapsible guidance", async ({ page }) => {
  const response = await page.goto("/admin/recenzie", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Rýchle pracovné odkazy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Nový test" })).toHaveAttribute("href", "/admin/novy?sekcia=recenzie");
  await expect(page.getByRole("link", { name: "Otvoriť moderáciu" })).toHaveAttribute("href", "/admin/recenzie-profilov");
  const details = page.locator("details").filter({ has: page.getByText("Ako sa počítajú hodnotenia") });
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
});
