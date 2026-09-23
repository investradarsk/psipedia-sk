import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const TOKENS = {
  "desktop-chromium": "review-e2e-auth-token-desktop-000000000000000001",
  "mobile-chromium": "review-e2e-auth-token-mobile-0000000000000000002",
} as const;

const PROFILE = "/adresar/dalsie-sluzby/e2e-services-detail-minimum";
const RETURN_TO = PROFILE + "#recenzie";

async function installTurnstileMock(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      ready(callback: () => void) { callback(); },
      render(_container: HTMLElement, options: Record<string, unknown>) {
        const callback = options.callback as ((token: string) => void) | undefined;
        queueMicrotask(() => callback?.("review-e2e-turnstile-token"));
        return "review-e2e-widget";
      },
      remove() {},
    };
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await installTurnstileMock(page);
});

test("new reviewer starts from profile, sees generic success, consumes magic link and returns to profile", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof TOKENS;
  const token = TOKENS[project];
  expect(token).toBeTruthy();

  await page.route("**/api/review-author/auth/request-link", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Ak je možné pokračovať, poslali sme vám overovací odkaz e-mailom.",
      }),
    });
  });

  const profileResponse = await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
  expect(profileResponse?.status()).toBe(200);
  const reviews = page.locator("#recenzie");
  await expect(reviews.getByText("Zatiaľ bez recenzií", { exact: true })).toBeVisible();
  await reviews.getByRole("link", { name: "Napísať recenziu" }).click();

  await expect(page).toHaveURL(/\/recenzia\/prihlasenie\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Najprv overíme váš e-mail" })).toBeVisible();
  const submitButton = page.getByRole("button", { name: "Poslať overovací odkaz" });
  await expect(submitButton).toBeEnabled();

  const emailInput = page.getByLabel("E-mail");
  const email = project === "desktop-chromium" ? "new-desktop@example.sk" : "new-mobile@example.sk";
  await emailInput.fill(email);
  await expect(emailInput).toHaveValue(email);

  await submitButton.click();
  await expect(page.getByRole("status")).toContainText("Ak je možné pokračovať");

  await page.unroute("**/api/review-author/auth/request-link");
  await page.goto(
    "/recenzia/overenie#token=" + encodeURIComponent(token) +
    "&returnTo=" + encodeURIComponent(RETURN_TO),
  );
  await expect(page).toHaveURL(new RegExp(PROFILE + "#recenzie$"));
  await expect(page.locator("#recenzie").getByText("Zatiaľ bez recenzií", { exact: true })).toBeVisible();

  await page.goto("/recenzia/prihlasenie?returnTo=" + encodeURIComponent(RETURN_TO));
  await expect(page.getByRole("heading", { name: "E-mail je overený" })).toBeVisible();
  await expect(page.getByText(/formulár na vytvorenie recenzie bude súčasťou nasledujúcej fázy/i)).toBeVisible();

  await page.goto(
    "/recenzia/overenie#token=" + encodeURIComponent(token) +
    "&returnTo=" + encodeURIComponent(RETURN_TO),
  );
  await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
  await expect(page.getByText(/už bol použitý|neplatný|expirovaný/)).toBeVisible();
});

for (const [label, token, expected] of [
  ["used", "review-e2e-auth-token-used-000000000000000000003", /už bol použitý|neplatný|expirovaný/],
  ["expired", "review-e2e-auth-token-expired-0000000000000000004", /už bol použitý|neplatný|expirovaný/],
  ["suspended", "review-e2e-auth-token-suspended-000000000000000005", /nemôže pokračovať/],
] as const) {
  test("unusable reviewer link fails safely: " + label, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "single project is enough for lifecycle error contract");
    await page.goto(
      "/recenzia/overenie#token=" + encodeURIComponent(token) +
      "&returnTo=" + encodeURIComponent(RETURN_TO),
    );
    await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
    await expect(page.getByText(expected)).toBeVisible();
    await expect(page.getByRole("link", { name: "Poslať nový odkaz" })).toBeVisible();
  });
}

test("external return URL is rejected and never becomes an open redirect", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single project is enough for redirect security contract");
  const token = "review-e2e-auth-token-openredirect-0000000000000006";
  await page.goto(
    "/recenzia/overenie#token=" + encodeURIComponent(token) +
    "&returnTo=" + encodeURIComponent("https://evil.example/phish"),
  );
  await expect(page).toHaveURL(/\/$/);
  expect(new URL(page.url()).hostname).not.toBe("evil.example");
});

test("reviewer logout revokes session cookie independently of Partner auth", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single project is enough for logout contract");
  const token = "review-e2e-auth-token-logout-00000000000000000007";

  await page.goto(
    "/recenzia/overenie#token=" + encodeURIComponent(token) +
    "&returnTo=" + encodeURIComponent(RETURN_TO),
  );
  await expect(page).toHaveURL(new RegExp(PROFILE));

  const result = await page.evaluate(async () => {
    const response = await fetch("/api/review-author/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return { ok: response.ok, body: await response.json() };
  });
  expect(result.ok).toBe(true);

  await page.goto("/recenzia/prihlasenie?returnTo=" + encodeURIComponent(RETURN_TO));
  await expect(page.getByRole("heading", { name: "Najprv overíme váš e-mail" })).toBeVisible();
});

test("reviewer auth is accessible and has no horizontal overflow at 390x844", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "390px mobile contract");
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/recenzia/prihlasenie?returnTo=" + encodeURIComponent(RETURN_TO), { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Poslať overovací odkaz" })).toBeVisible();
  await expectNoHorizontalOverflow(page, "review author auth 390x844");

  const accessibility = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});
