import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only isolated localhost fixtures only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function fitsViewport(page: Page, width: number) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  "document overflow at " + width + "px").toBe(true);
}

test("step 11: events list, calendar link and filters fit 320–1440px", async ({ page }) => {
  const res = await page.goto("/admin/podujatia", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Podujatia", level: 1, exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Verejný kalendár" })).toHaveAttribute("href", "/podujatia");
  const list = page.locator('[data-admin-content-module="events-list"]');
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("data-hydrated", "true");
  const filters = list.locator('[data-admin-list-filters]');
  await expect(filters).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(filters).toBeVisible();
    await expect(list.locator("[data-admin-list-results]")).toBeVisible();
    const pager = list.locator("[data-admin-list-pagination]");
    await expect(pager).toBeVisible();
    const previous = pager.getByRole("button", { name: "Predchádzajúca" });
    const next = pager.getByRole("button", { name: "Nasledujúca" });
    expect(await previous.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await next.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    if (width <= 760) {
      const toggle = list.getByRole("button", { name: "Ďalšie filtre" });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(list.locator("#admin-event-advanced-filters")).toBeVisible();
      await list.getByRole("button", { name: "Skryť filtre" }).click();
    }
    await fitsViewport(page, width);
  }
});

test("step 11: event table retains an accessible sticky actions column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const res = await page.goto("/admin/podujatia", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  const list = page.locator('[data-admin-content-module="events-list"]');
  const table = list.locator('[data-sticky-actions="true"]');
  test.skip(!(await table.count()), "No event rows in isolated admin fixture");
  await expect(table).toBeVisible();
  const actions = table.locator('th[data-column-id="actions"], td[data-column-id="actions"]');
  await expect(actions.first()).toBeVisible();
  await expect(actions.first()).toHaveCSS("position", "sticky");
});

test("step 11: new event editor has one heading and no redundant toolbar", async ({ page }) => {
  const res = await page.goto("/admin/podujatia/nove", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Pridaj termín do kalendára", level: 1 })).toHaveCount(1);
  const editor = page.locator("[data-event-editor-v3]");
  await expect(editor).toBeVisible();
  await expect(editor.locator("[data-editor-header] h1")).toHaveCount(0);
  await expect(editor.locator("#event-title")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Publikovať podujatie" })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await editor.locator("#event-title").focus();
    await fitsViewport(page, width);
  }
});

test("step 11: existing event has Notion and lifecycle actions in compact disclosure", async ({ page }) => {
  const res = await page.goto("/admin/podujatia", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  const firstHref = await page.locator('a[href^="/admin/podujatia/"]').evaluateAll((links) =>
    links.map(link => link.getAttribute("href")).find(href => /^\/admin\/podujatia\/\d+(?:\?|$)/.test(href ?? "")) ?? null);
  test.skip(!firstHref, "No event fixture available");
  await page.goto(firstHref!, { waitUntil: "domcontentloaded" });
  const editor = page.locator("[data-event-editor-v3]");
  await expect(editor).toBeVisible();
  const more = editor.locator("[data-admin-event-more-actions]");
  await expect(more.locator("summary")).toBeVisible();
  await more.locator("summary").click();
  await expect(more.getByRole("button", { name: "Aktualizovať z Notionu" })).toBeVisible();
  await expect(more.locator("button").first()).toBeVisible();
  await fitsViewport(page, 1280);
});
