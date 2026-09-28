import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) => `${item.id} (${item.impact}): ${item.help}`).join("\n");
  expect(violations, `${label}: serious/critical Axe violations\n${details}`).toEqual([]);
}

test.beforeEach(async ({ page, baseURL, isMobile }) => {
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("local veterinarian intent works with preposition and without diacritics", async ({ page }) => {
  for (const query of ["veterinár Trnava", "veterinár v Trnave", "veterinar trnava", "veterina Trnava"]) {
    await page.goto(`/hladat?q=${encodeURIComponent(query)}`);
    await expect(page.getByRole("heading", { name: `„${query}“` })).toBeVisible();
    await expect(page.getByRole("link", { name: /SEARCH E2E Ambulancia 001/ })).toBeVisible();
    await expect(page.getByText("Veterinár", { exact: true }).first()).toBeVisible();
  }
});

test("exact directory profile remains searchable beyond 500 published rows", async ({ page }) => {
  await page.goto(`/hladat?q=${encodeURIComponent("SEARCH E2E Zzz Veterina 506")}`);
  const target = page.getByRole("link", { name: /SEARCH E2E Zzz Veterina 506/ });
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute("href", "/adresar/veterinari/search-e2e-target-506");
  await expect(page.getByText("Overené", { exact: true })).toHaveCount(0);
});

test("zero-result state is actionable without unrelated popular content", async ({ page }) => {
  await page.goto(`/hladat?q=${encodeURIComponent("zzzxxyy-no-search-result")}`);
  await expect(page.getByRole("heading", { name: "Nenašli sme presnú zhodu" })).toBeVisible();
  await expect(page.getByText(/momentálne nemáme zodpovedajúci publikovaný výsledok/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Všetky články" })).toHaveCount(0);
});

test("search page is keyboard-accessible, responsive and axe-clean", async ({ page, isMobile }) => {
  await page.goto(`/hladat?q=${encodeURIComponent("veterinár Trnava")}`);
  await expect(page.getByRole("link", { name: /SEARCH E2E Ambulancia 001/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, isMobile ? "390px search" : "desktop search");
  await expectAxeClean(page, isMobile ? "390px search" : "desktop search");

  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedTag).not.toBe("BODY");
});

test("header search restores focus after Escape and submits the shared query contract", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop keyboard modal contract is covered once; mobile result layout is tested separately");
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Otvoriť vyhľadávanie" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Hľadaný výraz" });
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await input.fill("veterinár v Trnave");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/hladat\?q=veterin%C3%A1r%20v%20Trnave/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Ambulancia 001/ })).toBeVisible();
});
