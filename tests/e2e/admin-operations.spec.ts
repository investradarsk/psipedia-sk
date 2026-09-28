import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("alerts center, shared bell and active/history controls are accessible and responsive", async ({ page }) => {
  const response = await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aktívne upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automatizačné zdroje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automatizácie na kontrolu", exact: true })).toBeVisible();
  await expect(page.getByTestId("admin-attention-queue")).toBeVisible();

  const bell = page.getByTestId("admin-notification-bell");
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("href", "/admin/operations");
  await expect(bell).toHaveAttribute("aria-label", /^Upozornenia:/);
  const bellBox = await bell.boundingBox();
  expect(bellBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(bellBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await bell.focus();
  await expect(bell).toBeFocused();

  const filter = page.getByRole("form", { name: "Filtrovať upozornenia" });
  await expect(filter).toHaveAttribute("method", "get");
  await expect(filter.getByLabel("Zobrazenie")).toHaveValue("active");
  await expect(filter.getByLabel("Zdroj")).toHaveValue("all");
  await expect(filter.getByLabel("Priorita")).toHaveValue("all");

  await expect(page.getByRole("link", { name: "Upozornenia", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mapy", exact: true })).toHaveAttribute("href", "/admin/mapy");
  await expect(page.getByRole("link", { name: "Nástroje", exact: true })).toHaveAttribute("href", "/admin/nastroje");
  await expect(page.getByRole("link", { name: "Operácie", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lokality pre budúcu mapu", exact: true })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("Attention pagination reaches items beyond the former source cap and distinguishes empty from unavailable", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  let response = await page.goto("/admin/operations?source=NEWS_TIP", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const filter = page.getByRole("form", { name: "Filtrovať upozornenia" });
  await expect(filter.getByLabel("Zdroj")).toHaveValue("NEWS_TIP");
  const firstPageCards = page.locator('[data-source="NEWS_TIP"]');
  await expect(firstPageCards).toHaveCount(24);
  const resultStatus = page.getByRole("status").filter({ hasText: "Nájdené" });
  const initialResultText = await resultStatus.textContent();
  const initialResultCount = Number(initialResultText?.match(/Nájdené(?: v dostupných zdrojoch)?:\s*(\d+)/)?.[1] ?? 0);
  expect(initialResultCount).toBeGreaterThan(50);
  const initialBellLabel = await page.getByTestId("admin-notification-bell").getAttribute("aria-label");
  const initialBellCount = Number(initialBellLabel?.match(/(\d+)/)?.[1] ?? 0);
  expect(initialBellCount).toBeGreaterThanOrEqual(initialResultCount);

  const firstTitles = await firstPageCards.locator("h2").allTextContents();
  const next = page.getByRole("link", { name: "Ďalšia strana →" });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page).toHaveURL(/source=NEWS_TIP.*cursor=/);

  const secondPageCards = page.locator('[data-source="NEWS_TIP"]');
  await expect(secondPageCards).toHaveCount(24);
  const secondTitles = await secondPageCards.locator("h2").allTextContents();
  expect(secondTitles.some((title) => firstTitles.includes(title))).toBe(false);

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/operations\?source=NEWS_TIP(?:#centrum-pozornosti)?$/);
  await expect(page.getByRole("form", { name: "Filtrovať upozornenia" }).getByLabel("Zdroj")).toHaveValue("NEWS_TIP");
  await expect(page.locator('[data-source="NEWS_TIP"]')).toHaveCount(24);
  expect(await page.locator('[data-source="NEWS_TIP"] h2').allTextContents()).toEqual(firstTitles);

  response = await page.goto("/admin/operations?source=NEWS_TIP&cursor=not-a-valid-cursor", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("alert").filter({ hasText: "Odkaz na stránku už nie je platný" })).toBeVisible();
  await expect(page.locator('[data-source="NEWS_TIP"]')).toHaveCount(24);

  const canonicalLink = page.locator('[data-source="NEWS_TIP"]').first().getByRole("link", { name: "Otvoriť" });
  await canonicalLink.click();
  await expect(page).toHaveURL(/\/admin\/tipy#tip-\d+$/);
  const tipHash = new URL(page.url()).hash;
  const canonicalTip = page.locator(tipHash);
  await canonicalTip.scrollIntoViewIfNeeded();
  await canonicalTip.getByRole("button", { name: "Spracovaný", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tip je označený" })).toContainText("Spracovaný");

  response = await page.goto("/admin/operations?source=NEWS_TIP", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  const resolvedResultText = await page.getByRole("status").filter({ hasText: "Nájdené" }).textContent();
  const resolvedResultCount = Number(resolvedResultText?.match(/Nájdené(?: v dostupných zdrojoch)?:\s*(\d+)/)?.[1] ?? -1);
  expect(resolvedResultCount).toBe(initialResultCount - 1);
  const resolvedBellLabel = await page.getByTestId("admin-notification-bell").getAttribute("aria-label");
  const resolvedBellCount = Number(resolvedBellLabel?.match(/(\d+)/)?.[1] ?? -1);
  expect(resolvedBellCount).toBe(initialBellCount - 1);

  response = await page.goto("/admin/operations?source=PROFILE_REVIEW_MODERATION", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Zvolený zdroj nemá otvorené položky" })).toBeVisible();

  response = await page.goto("/admin/operations?source=DIRECTORY_CHANGE_REQUEST", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Zvolený zdroj je momentálne nedostupný" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Výsledky nie sú úplné" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("technical tools and maps have separate working admin entries without horizontal overflow", async ({ page }) => {
  let response = await page.goto("/admin/nastroje", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Nástroje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import dát", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profilový outreach", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);

  response = await page.goto("/admin/mapy", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Mapy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Geo lokality na kontrolu", exact: true })).toHaveAttribute("href", "/admin/operations?source=GEO_LOCATION_ISSUE");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  response = await page.goto("/admin/operations/geo", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/admin\/mapy$/);
});
