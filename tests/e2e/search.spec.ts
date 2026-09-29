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
    await expect(page.getByRole("link", { name: "Zrušiť filter typu Veterinári" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zrušiť filter lokality Trnava" })).toBeVisible();
  }
});

test("type and location filters are URL-addressable and survive reload, back and forward", async ({ page }) => {
  await page.goto(`/hladat?q=${encodeURIComponent("veterinár v Trnave")}`);

  const typeFilter = page.getByLabel("Typ výsledku");
  const locationFilter = page.getByLabel("Lokalita");
  await expect(typeFilter).toHaveValue("veterinari");
  await expect(locationFilter).toHaveValue("Trnava");

  await typeFilter.selectOption("treneri");
  await locationFilter.fill("Trnava");
  await page.getByRole("button", { name: "Upraviť výsledky" }).click();

  await expect(page).toHaveURL(/\/hladat\?.*typ=treneri.*lokalita=Trnava/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Tréner Trnava/ })).toBeVisible();
  await expect(page.getByText("Trnava · Trnavský kraj", { exact: true }).first()).toBeVisible();
  const mapLink = page.getByRole("link", { name: "Zobraziť na mape" });
  await expect(mapLink).toHaveAttribute(
    "href",
    "/mapa?category=services&subcategory=treneri&region=Trnavsk%C3%BD+kraj&district=Trnava&city=Trnava",
  );

  await page.reload();
  await expect(page.getByLabel("Typ výsledku")).toHaveValue("treneri");
  await expect(page.getByLabel("Lokalita")).toHaveValue("Trnava");
  await expect(page.getByRole("link", { name: /SEARCH E2E Tréner Trnava/ })).toBeVisible();

  await page.getByLabel("Lokalita").fill("Nitra");
  await page.getByRole("button", { name: "Upraviť výsledky" }).click();
  await expect(page).toHaveURL(/\/hladat\?.*typ=treneri.*lokalita=Nitra/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Tréner Nitra/ })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/lokalita=Trnava/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Tréner Trnava/ })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/lokalita=Nitra/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Tréner Nitra/ })).toBeVisible();
});

test("zero-result local intent keeps filters and offers bounded broader scopes", async ({ page }) => {
  await page.goto(
    `/hladat?q=${encodeURIComponent("search2-no-match")}&typ=veterinari&lokalita=${encodeURIComponent("mesto:Trnava")}`,
  );
  await expect(page.getByRole("heading", { name: "Nenašli sme presnú zhodu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zrušiť filter typu Veterinári" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zrušiť filter lokality Trnava" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rozšíriť na okres Trnava" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rozšíriť na Trnavský kraj" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hľadať bez obmedzenia lokality" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hľadať vo všetkých typoch výsledkov" })).toBeVisible();
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
  const searchResults = page.locator("main#obsah");
  await expect(searchResults.getByRole("heading", { name: "Nenašli sme presnú zhodu" })).toBeVisible();
  await expect(searchResults.getByText(/momentálne nemáme zodpovedajúci publikovaný výsledok/)).toBeVisible();
  // Global navigation/footer may legitimately link to all articles. The zero-result
  // search surface itself must not inject unrelated popular-content fallbacks.
  await expect(searchResults.getByRole("link", { name: "Všetky články" })).toHaveCount(0);
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
  await expect(trigger).toHaveAttribute("data-search-ready", "true");
  await trigger.focus();
  await trigger.press("Enter");
  const input = page.getByRole("textbox", { name: "Hľadaný výraz" });
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  // Target the focused trigger directly so the test exercises native keyboard
  // activation without racing React's modal-unmount focus restoration.
  await trigger.press("Enter");
  await expect(input).toBeFocused();
  await input.fill("veterinár v Trnave");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/hladat\?q=veterin%C3%A1r%20v%20Trnave/);
  await expect(page.getByRole("link", { name: /SEARCH E2E Ambulancia 001/ })).toBeVisible();
});
