import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

function monthUrl(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `/admin/clanky/kalendar?mesiac=${year}-${month}`;
}

async function scheduledCalendar(page: Page) {
  const seeded = new Date(Date.now() + 3 * 86_400_000);
  return calendarForMonth(page, seeded);
}

async function calendarForMonth(page: Page, date: Date) {
  const response = await page.goto(monthUrl(date), { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  const calendar = page.getByRole("region", { name: "Redakčný kalendár" });
  // Server-rendered controls can be visible before React hydration.
  await expect(calendar).toHaveAttribute("data-interactive", "true");
  return calendar;
}

async function openFromDay(page: Page, calendar: ReturnType<Page["getByRole"]>, id: number, title: string) {
  const lookup = await page.request.get(`/api/admin/articles/${id}`);
  expect(lookup.ok()).toBe(true);
  const { article } = await lookup.json() as { article: { publishedAt: string } };
  const date = await page.evaluate((stamp: string) => {
    const value = new Date(stamp);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }, article.publishedAt);
  const dayButton = calendar.locator(`button[class*="dayButton"]:has(time[datetime="${date}"])`);
  await expect(dayButton).toBeVisible();
  await dayButton.click();
  const dayDetail = calendar.locator('[aria-labelledby="calendar-day-detail"]');
  await expect(dayDetail).toBeVisible();
  const entry = dayDetail.getByRole("button", { name: new RegExp(title) });
  await entry.click();
  const detail = calendar.locator('[aria-labelledby="calendar-article-detail"]');
  await expect(detail.getByRole("heading", { name: title })).toBeVisible();
  return { dayDetail, entry, detail };
}

test("opens the concrete article without navigation, multi-article day and keyboard focus return", async ({ page }) => {
  const calendar = await scheduledCalendar(page);
  const { dayDetail, entry, detail } = await openFromDay(page, calendar, 974102, "CALENDAR E2E scheduled B");
  await expect(dayDetail.getByRole("button", { name: /CALENDAR E2E scheduled A/ })).toBeVisible();
  // The desktop/mobile reschedule scenarios intentionally change other fixture
  // articles between months. Only the two stable seeded articles are required
  // to verify this multi-article-day interaction.
  await expect(detail.getByRole("link", { name: "Otvoriť v editore" })).toHaveAttribute("href", "/admin/clanky/974102");
  await expect(page).toHaveURL(/\/admin\/clanky\/kalendar/);
  await detail.getByRole("heading").focus();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(entry).toBeFocused();
});

test("published article stays read-only and works in 390px/430px viewports", async ({ page }) => {
  const published = new Date(Date.now() - 86_400_000);
  const calendar = await calendarForMonth(page, published);
  const { detail } = await openFromDay(page, calendar, 974103, "CALENDAR E2E published");
  await expect(detail.getByText("Publikovaný článok: dátum a čas sú tu iba na čítanie.")).toBeVisible();
  await expect(detail.locator('input[type="date"], input[type="time"]')).toHaveCount(0);
  await expect(detail.getByRole("link", { name: "Otvoriť v editore" })).toHaveAttribute("href", "/admin/clanky/974103");
  for (const width of [1280, 430, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("invalid time and backend errors keep the editor open and calendar item unchanged", async ({ page }) => {
  const calendar = await scheduledCalendar(page);
  const { entry, detail } = await openFromDay(page, calendar, 974101, "CALENDAR E2E scheduled A");
  const originalDate = await detail.getByLabel("Dátum publikovania").inputValue();
  await detail.getByLabel("Dátum publikovania").fill("2020-01-01");
  await detail.getByRole("button", { name: "Uložiť termín" }).click();
  await expect(detail.getByRole("alert")).toContainText("budúci dátum");
  await detail.getByLabel("Dátum publikovania").fill(originalDate);
  await page.route("**/api/admin/articles/974101", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Článok sa medzičasom zmenil." }) });
    } else await route.continue();
  });
  await detail.getByRole("button", { name: "Uložiť termín" }).click();
  await expect(detail.getByRole("alert")).toContainText("medzičasom zmenil");
  await expect(entry).toBeVisible();
  await expect(detail).toBeVisible();
});

test("reschedule persists on the server, removes the old item and links to the new month", async ({ page }, testInfo) => {
  const initial = new Date(Date.now() + 3 * 86_400_000);
  const calendar = await scheduledCalendar(page);
  const mobile = testInfo.project.name.includes("mobile");
  const targetId = mobile ? 974105 : 974104;
  const title = mobile ? "CALENDAR E2E reschedule mobile" : "CALENDAR E2E reschedule desktop";
  const { detail } = await openFromDay(page, calendar, targetId, title);
  const target = new Date(initial.getFullYear(), initial.getMonth() + 1, 12, 14, 30);
  const isoDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-12`;
  await detail.getByLabel("Dátum publikovania").fill(isoDate);
  await detail.getByLabel("Čas publikovania").fill("14:30");
  await detail.getByRole("button", { name: "Uložiť termín" }).click();
  await expect(detail.getByRole("status")).toContainText("Termín publikovania bol uložený");
  await expect(detail.getByText("Článok sa už v tomto mesiaci nezobrazuje.")).toBeVisible();
  await expect(calendar.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  await detail.getByRole("link", { name: "Prejsť na nový mesiac" }).click();
  await expect(page).toHaveURL(new RegExp(`mesiac=${isoDate.slice(0, 7)}`));
  const newCalendar = page.getByRole("region", { name: "Redakčný kalendár" });
  await expect(newCalendar).toHaveAttribute("data-interactive", "true");
  const response = await page.request.get(`/api/admin/articles/${targetId}`);
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(new Date(json.article.publishedAt).getTime()).toBeGreaterThan(Date.now());
  await openFromDay(page, newCalendar, targetId, title);
  await expect(page.getByLabel("Dátum publikovania")).toHaveValue(isoDate);
  await expect(page.getByLabel("Čas publikovania")).toHaveValue("14:30");
});
