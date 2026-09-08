import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
}

async function expectHealthyPage(page: Page, path: string) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|googletagmanager|Google Analytics/i.test(text)) return;
    consoleErrors.push(text);
  });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No navigation response for ${path}`).not.toBeNull();
  expect(response?.status(), `${path} returned HTTP ${response?.status()}`).toBeLessThan(400);
  await expect(page.locator("body"), `${path} rendered an empty document`).not.toBeEmpty();
  await page.waitForTimeout(150);
  expect(pageErrors, `JavaScript errors on ${path}:\n${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `Console errors on ${path}:\n${consoleErrors.join("\n")}`).toEqual([]);
}

async function firstPublicLink(page: Page, container: string, pattern: RegExp) {
  const links = page.locator(`${container} a[href]`);
  for (let index = 0; index < await links.count(); index += 1) {
    const href = await links.nth(index).getAttribute("href");
    if (href && pattern.test(href)) return href;
  }
  throw new Error(`No public detail link matching ${pattern} found in ${container}`);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) =>
    `${item.id} (${item.impact}): ${item.help}\n${item.nodes.slice(0, 5).map((node) => `  ${node.target.join(" ")} – ${node.failureSummary ?? "failed"}`).join("\n")}`
  ).join("\n\n");
  expect(violations, `${label} accessibility violations:\n${details}`).toEqual([]);
}

test.beforeEach(async ({ page }) => useNecessaryCookies(page));

test("@production homepage search, CTA and Plemeno dňa work without JS errors", async ({ page }) => {
  await expectHealthyPage(page, "/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Všetky novinky/ })).toHaveAttribute("href", "/novinky");
  const search = page.getByRole("search").filter({ has: page.locator("#home-search") });
  await search.locator("input[name=q]").fill("labrador");
  await Promise.all([page.waitForURL(/\/hladat\?q=labrador/), search.getByRole("button", { name: "Nájsť všetko" }).click()]);
  await expect(page.locator("h1")).toContainText(/Hľadať|Výsledky/i);
  await page.goto("/");
  const breedSection = page.locator(".home-breed-day-section");
  await expect(breedSection).toBeVisible();
  await expect(breedSection.locator("h3")).not.toHaveText("");
  await expect(breedSection.locator("dd").first()).not.toHaveText("");
});

test("@production breed listing filters, detail, 404 and comparison work", async ({ page }) => {
  await page.goto("/plemena");
  await expect(page.locator("h1")).toBeVisible();
  await page.getByPlaceholder("Hľadať plemeno, krajinu alebo FCI skupinu").fill("labrador");
  await expect(page.locator(".breed-card")).toHaveCount(1);
  const detailHref = await firstPublicLink(page, ".breed-grid", /^\/plemena\/(?!vyber-plemena$)[^/?#]+$/);
  await page.goto(detailHref);
  await expect(page.locator("h1")).toBeVisible();
  const missing = await page.goto("/plemena/neexistujuce-plemeno-e2e");
  expect(missing?.status(), "Unknown breed must return HTTP 404").toBe(404);
  await page.goto("/porovnat-plemena");
  await expect(page.locator("h1")).toContainText(/Porovnanie plemien/i);
});

test("@production directory listing, veterinarians, profile and filters work", async ({ page }) => {
  await page.goto("/adresar");
  await expect(page.locator("h1")).toBeVisible();
  await page.goto("/adresar/veterinari");
  await expect(page.locator("h1")).toContainText("Veterinári");
  const filter = page.locator(".directory-results form").first();
  await filter.locator('input[name="q"]').fill("Nitra");
  await Promise.all([page.waitForURL(/q=Nitra/i), filter.getByRole("button", { name: "Zobraziť výsledky" }).click()]);
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/adresar/veterinari");
  const detailHref = await firstPublicLink(page, ".directory-grid", /^\/adresar\/veterinari\/[^/?#]+$/);
  await page.goto(detailHref);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production events listing, detail and past/upcoming separation work", async ({ page }) => {
  await page.goto("/podujatia");
  await expect(page.locator("h1")).toBeVisible();
  const upcomingLinks = await page.locator('.event-grid a[href^="/podujatia/"]').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)))]);
  expect(upcomingLinks.length, "Upcoming event listing is empty").toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ukončené" }).click();
  const pastLinks = await page.locator('.event-grid a[href^="/podujatia/"]').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)))]);
  expect(upcomingLinks.filter((href) => pastLinks.includes(href)).length, "A past event also appears among upcoming events").toBe(0);
  await page.goto(upcomingLinks[0]!);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production help listing and an existing case detail work", async ({ page }) => {
  await page.goto("/pomoc-psom");
  await expect(page.locator("h1")).toBeVisible();
  if (await page.locator(".help-card").count() === 0) {
    await page.getByRole("checkbox", { name: "Len aktívne prípady" }).uncheck();
  }
  const detailHref = await firstPublicLink(page, ".help-card", /^\/pomoc-psom\/[^/?#]+\/[^/?#]+$/);
  await page.goto(detailHref);
  await expect(page.locator("h1")).toBeVisible();
});

test("@production robots and sitemaps are available and valid", async ({ request }) => {
  const checks = [["/robots.txt", /User-agent:/i], ["/sitemap.xml", /<urlset|<sitemapindex/i], ["/news-sitemap.xml", /<urlset/i]] as const;
  for (const [path, content] of checks) {
    const response = await request.get(path);
    expect(response.status(), `${path} returned HTTP ${response.status()}`).toBe(200);
    expect(await response.text(), `${path} has unexpected content`).toMatch(content);
  }
});

test("@production cookie banner is operable and navigation works before consent", async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.removeItem(key), [CONSENT_KEY]);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Tvoje súkromie na Psipedii" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
  await Promise.all([page.waitForURL(/\/plemena$/), page.locator(".home-search-shortcuts").getByRole("link", { name: "Plemená", exact: true }).click()]);
  await expect(page.locator("h1")).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Odmietnuť analytiku" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(([key]) => localStorage.getItem(key), [CONSENT_KEY])).toBe("necessary");
});

test("@production key public pages have no serious axe violations", async ({ page }) => {
  await page.goto("/");
  await expectAxeClean(page, "Homepage");
  await page.goto("/plemena");
  await page.goto(await firstPublicLink(page, ".breed-grid", /^\/plemena\/(?!vyber-plemena$)[^/?#]+$/));
  await expectAxeClean(page, "Breed detail");
  await page.goto("/adresar/veterinari");
  await page.goto(await firstPublicLink(page, ".directory-grid", /^\/adresar\/veterinari\/[^/?#]+$/));
  await expectAxeClean(page, "Directory detail");
  await page.goto("/podujatia");
  await expectAxeClean(page, "Event listing");
});
