import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const ORIGIN = (process.env.E2E_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const JSON_HEADERS = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

const credentials = {
  "desktop-chromium": {
    token: "partner-e2e-magic-desktop-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    email: "partner-desktop-e2e@example.sk",
  },
  "mobile-chromium": {
    token: "partner-e2e-magic-mobile-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    email: "partner-mobile-e2e@example.sk",
  },
} as const;

function projectCredentials(testInfo: TestInfo) {
  const value = credentials[testInfo.project.name as keyof typeof credentials];
  if (!value) throw new Error("Partner E2E credentials are missing for " + testInfo.project.name);
  return value;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function consumeMagicLink(request: APIRequestContext, token: string) {
  return request.post("/api/partner/auth/consume", {
    headers: JSON_HEADERS,
    data: { token },
  });
}

for (const path of ["/partner/registracia", "/partner/prihlasenie"]) {
  test(path + " is usable, accessible and overflow-safe", async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expect(page.getByLabel("Pracovný e-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať prihlasovací odkaz" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("invalid verification link has a safe recovery state", async ({ page }) => {
  await page.goto("/partner/overenie");
  await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vyžiadať nový odkaz" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("anonymous Partner shell and settings redirect to login", async ({ page }) => {
  await page.goto("/partner");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
  await page.goto("/partner/nastavenia");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
});

test.describe.serial("Partner auth D1 integration", () => {
  let rawSessionToken = "";

  test("one-time magic link activates account and creates hardened fresh session", async ({ page, request }, testInfo) => {
    const account = projectCredentials(testInfo);
    const response = await consumeMagicLink(request, account.token);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const setCookie = response.headers()["set-cookie"] || "";
    expect(setCookie).toContain("__Host-psipedia_partner_session=");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) expect(setCookie).toContain(flag);
    expect(setCookie).not.toMatch(/Domain=/i);

    const match = /__Host-psipedia_partner_session=([^;]+)/.exec(setCookie);
    expect(match?.[1]).toBeTruthy();
    rawSessionToken = match?.[1] || "";
    expect(rawSessionToken).not.toBe(account.token);

    await page.context().addCookies([{
      name: "__Host-psipedia_partner_session",
      value: rawSessionToken,
      url: ORIGIN,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    }]);

    await page.goto("/partner");
    await expect(page.getByRole("heading", { name: "Partner účet je pripravený" })).toBeVisible();
    await page.goto("/partner/nastavenia");
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await expect(page.getByText("Aktívny", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("reused, used, revoked, expired and malformed magic links fail safely", async ({ request }, testInfo) => {
    const account = projectCredentials(testInfo);
    const cases = [
      account.token,
      "partner-e2e-magic-used-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "partner-e2e-magic-revoked-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "partner-e2e-magic-expired-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "not valid!",
    ];
    for (const token of cases) {
      const response = await consumeMagicLink(request, token);
      expect(response.status()).toBe(400);
      const body = await response.json() as { error?: string };
      expect(body.error).toMatch(/neplatný|expiroval/i);
    }
  });

  test("logout revokes the server session and clears browser access", async ({ page, request }) => {
    expect(rawSessionToken).toBeTruthy();
    await page.getByRole("button", { name: "Odhlásiť sa" }).click();
    await expect(page).toHaveURL(/\/partner\/prihlasenie$/);

    const stale = await request.get("/partner", {
      headers: { cookie: "__Host-psipedia_partner_session=" + rawSessionToken },
    });
    expect(stale.url()).toMatch(/\/partner\/prihlasenie$/);
  });
});

test("suspended and deactivated sessions cannot authorize Partner pages", async ({ request }) => {
  for (const session of [
    "partner-e2e-suspended-session-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "partner-e2e-deactivated-session-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ]) {
    const response = await request.get("/partner", {
      headers: { cookie: "__Host-psipedia_partner_session=" + session },
    });
    expect(response.url()).toMatch(/\/partner\/prihlasenie$/);
  }
});
