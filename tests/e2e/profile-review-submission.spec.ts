import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const REVIEW_COOKIE = "__Host-psipedia_review_author_session";
const PARTNER_COOKIE = "__Host-psipedia_partner_session";
const DIRECTORY_PROFILE = "/adresar/dalsie-sluzby/e2e-services-detail-minimum";
const DIRECTORY_RESOURCE = "reviews-2b-directory-resource";
const ORGANIZATION_PROFILE = "/organizacie/reviews-2b-e2e-organizacia";
const ORGANIZATION_RESOURCE = "reviews-2b-org-resource";

const reviewerSessions = {
  desktop: "reviews-2b-session-desktop-000000000000000001",
  mobile: "reviews-2b-session-mobile-0000000000000000002",
  organization: "reviews-2b-session-org-0000000000000000000003",
  already: "reviews-2b-session-already-000000000000000004",
  suspended: "reviews-2b-session-suspended-0000000000000005",
  partner: "reviews-2b-partner-session-000000000000000001",
} as const;

async function setCookie(context: BrowserContext, name: string, value: string) {
  await context.addCookies([{
    name,
    value,
    url: "https://localhost:5173",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  }]);
}

async function installTurnstileMock(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      ready(callback: () => void) { callback(); },
      render(_container: HTMLElement, options: Record<string, unknown>) {
        const callback = options.callback as ((token: string) => void) | undefined;
        queueMicrotask(() => callback?.("reviews-2b-turnstile-token"));
        return "reviews-2b-turnstile-widget";
      },
      remove() {},
    };
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, label).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

async function openDirectoryForm(page: Page) {
  const response = await page.goto(DIRECTORY_PROFILE, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.getByText("Zatiaľ bez recenzií", { exact: true })).toBeVisible();
  const cta = reviews.getByRole("link", { name: "Napísať recenziu" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/recenzia/napisat?resourceId=" + DIRECTORY_RESOURCE);
  await cta.click();
  await expect(page).toHaveURL(new RegExp("/recenzia/napisat\\?resourceId=" + DIRECTORY_RESOURCE + "$"));
  await expect(page.getByRole("heading", { name: "Napísať recenziu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await installTurnstileMock(page);
});

test("directory reviewer completes config-driven submission form and receives pending confirmation", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop canonical submission flow");
  await setCookie(context, REVIEW_COOKIE, reviewerSessions.desktop);

  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/review-author/reviews", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        reviewId: "reviews-2b-browser-created",
        status: "PENDING_REVIEW",
        profileHref: DIRECTORY_PROFILE,
        message: "Ďakujeme za recenziu. Po kontrole ju môžeme zverejniť na profile.",
      }),
    });
  });

  await openDirectoryForm(page);

  const firstOverall = page.locator('input[name="overallRating"][value="1"]');
  await firstOverall.focus();
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("ArrowRight");
  await expect(page.locator('input[name="overallRating"][value="5"]')).toBeChecked();

  await page.locator('input[name="dimension-communication"][value="4"]').check({ force: true });
  await page.locator('input[name="dimension-service_quality"][value="5"]').check({ force: true });
  const directoryBody = page.getByLabel("Text recenzie");
  const directoryBodyValue = "Veľmi dobrá skúsenosť so službou, jasná komunikácia a profesionálny prístup.";
  await directoryBody.fill(directoryBodyValue);
  await expect(directoryBody).toHaveValue(directoryBodyValue);
  await page.getByLabel("Mesiac využitia služby").fill("2026-09");

  const submit = page.getByRole("button", { name: "Odoslať recenziu" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole("heading", { name: "Ďakujeme za recenziu" })).toBeVisible();
  await expect(page.getByText("Recenzia zatiaľ nie je verejná a čaká na kontrolu.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Späť na profil" })).toHaveAttribute("href", DIRECTORY_PROFILE);

  expect(submitted).not.toBeNull();
  expect(submitted?.resourceId).toBe(DIRECTORY_RESOURCE);
  expect(submitted?.overallRating).toBe(5);
  expect(submitted?.serviceMonth).toBe("2026-09");
  expect(submitted?.ratingSchemaVersion).toBe(1);
  expect(submitted).not.toHaveProperty("authorId");
  expect(submitted).not.toHaveProperty("status");
  expect(submitted).not.toHaveProperty("serviceTypeKey");
});

test("organization reuses the same canonical reviewer form flow", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single reusable organization contract");
  await setCookie(context, REVIEW_COOKIE, reviewerSessions.organization);

  await page.route("**/api/review-author/reviews", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    expect(payload.resourceId).toBe(ORGANIZATION_RESOURCE);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        reviewId: "reviews-2b-org-browser-created",
        status: "PENDING_REVIEW",
        profileHref: ORGANIZATION_PROFILE,
        message: "Ďakujeme za recenziu. Po kontrole ju môžeme zverejniť na profile.",
      }),
    });
  });

  const response = await page.goto(ORGANIZATION_PROFILE, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const cta = page.locator("#recenzie").getByRole("link", { name: "Napísať recenziu" });
  await expect(cta).toHaveAttribute("href", "/recenzia/napisat?resourceId=" + ORGANIZATION_RESOURCE);
  await cta.click();
  await expect(page.getByRole("heading", { name: "Napísať recenziu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toBeEnabled();
  await expect(page.getByRole("group", { name: "Komunikácia" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Kvalita služby" })).toBeVisible();

  await page.locator('input[name="overallRating"][value="4"]').check({ force: true });
  const organizationBody = page.getByLabel("Text recenzie");
  const organizationBodyValue = "Organizácia komunikovala jasne a celý priebeh bol dobre zorganizovaný.";
  await organizationBody.fill(organizationBodyValue);
  await expect(organizationBody).toHaveValue(organizationBodyValue);
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toBeEnabled();
  await page.getByRole("button", { name: "Odoslať recenziu" }).click();
  await expect(page.getByRole("heading", { name: "Ďakujeme za recenziu" })).toBeVisible();
});

test("existing pending review shows safe already-reviewed state and never opens a second form", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single duplicate UX contract");
  await setCookie(context, REVIEW_COOKIE, reviewerSessions.already);

  await page.goto("/recenzia/napisat?resourceId=" + DIRECTORY_RESOURCE, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tento profil ste už ohodnotili" })).toBeVisible();
  await expect(page.getByText(/čaká na kontrolu/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toHaveCount(0);
});

test("Partner session alone never unlocks reviewer submission", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Partner/reviewer isolation contract");
  await setCookie(context, PARTNER_COOKIE, reviewerSessions.partner);

  await page.goto("/recenzia/napisat?resourceId=" + DIRECTORY_RESOURCE, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/recenzia\/prihlasenie\?returnTo=/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toBe("/recenzia/napisat?resourceId=" + DIRECTORY_RESOURCE);
  await expect(page.getByRole("heading", { name: "Najprv overíme váš e-mail" })).toBeVisible();
});

test("malicious review text remains inert and server validation error is associated with body", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "XSS browser contract");
  await setCookie(context, REVIEW_COOKIE, reviewerSessions.desktop);
  await page.addInitScript(() => { (window as unknown as { reviews2bXss: number }).reviews2bXss = 0; });

  await page.route("**/api/review-author/reviews", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    expect(String(payload.body)).toContain("<script>");
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Text recenzie musí byť obyčajný text bez HTML alebo spustiteľného obsahu.",
        code: "UNSAFE_BODY",
        field: "body",
      }),
    });
  });

  await openDirectoryForm(page);
  await page.locator('input[name="overallRating"][value="5"]').check({ force: true });
  const xssBody = page.getByLabel("Text recenzie");
  const xssBodyValue = "<script>window.reviews2bXss=1</script> Toto je dostatočne dlhý testovací text recenzie.";
  await xssBody.fill(xssBodyValue);
  await expect(xssBody).toHaveValue(xssBodyValue);
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toBeEnabled();
  await page.getByRole("button", { name: "Odoslať recenziu" }).click();

  await expect(page.getByRole("alert")).toContainText("obyčajný text bez HTML");
  await expect(page.getByLabel("Text recenzie")).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { reviews2bXss: number }).reviews2bXss)).toBe(0);
});

test("mobile 390x844 review form is keyboard-accessible, axe-clean and has no document overflow", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "390x844 mobile submission contract");
  await context.clearCookies();
  await setCookie(context, REVIEW_COOKIE, reviewerSessions.mobile);
  await page.setViewportSize({ width: 390, height: 844 });

  await openDirectoryForm(page);
  await expectNoHorizontalOverflow(page, "review submission form 390x844");

  const firstOverall = page.locator('input[name="overallRating"][value="1"]');
  await firstOverall.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('input[name="overallRating"][value="2"]')).toBeChecked();

  await expect(page.getByLabel("Text recenzie")).toBeVisible();
  await expect(page.getByLabel("Mesiac využitia služby")).toBeVisible();
  await expect(page.getByRole("button", { name: "Odoslať recenziu" })).toBeVisible();
  await expectAxeClean(page);
});
