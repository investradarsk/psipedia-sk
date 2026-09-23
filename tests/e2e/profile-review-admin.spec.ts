import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_LIST = "/admin/recenzie-profilov";
const PUBLIC_PROFILE = "/adresar/veterinari/health-fixture-vet-rich";
const APPROVE_REVIEW = "e2e-review-vet-pending";
const REJECT_REVIEW = "e2e-review-admin-risk-pending";

async function acceptNextDialog(page: Page) {
  page.once("dialog", async (dialog) => dialog.accept());
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, label).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAdminAxeClean(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

async function runAction(page: Page, label: string) {
  await acceptNextDialog(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/admin/profile-reviews/") && response.request().method() === "PATCH"
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
}

test.describe.serial("REVIEWS-3 admin moderation", () => {
  test("pending reviews appear in admin queue and Attention Center with direct deep links", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "desktop moderation flow");

    const listResponse = await page.goto(ADMIN_LIST, { waitUntil: "domcontentloaded" });
    expect(listResponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Moderácia profilových recenzií" })).toBeVisible();
    await expect(page.getByText("Recenzent: Čakajúci E2E", { exact: true })).toBeVisible();
    await expect(page.getByText("Recenzent: Risk reviewer", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Detail →" })).toHaveCount(2);

    await page.goto("/admin/operations?source=PROFILE_REVIEW_MODERATION&view=active", { waitUntil: "domcontentloaded" });
    const reviewItems = page.locator('[data-source="PROFILE_REVIEW_MODERATION"]');
    await expect(reviewItems).toHaveCount(2);
    await expect(reviewItems.filter({ hasText: "Risk" }).first()).toHaveAttribute("data-priority", "HIGH");
    await expect(reviewItems.first().getByRole("link", { name: "Otvoriť" })).toHaveAttribute("href", /\/admin\/recenzie-profilov\//);
  });

  test("approve publishes review and changes public count, average and dimensions", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "desktop moderation flow");

    await page.goto(`${ADMIN_LIST}/${APPROVE_REVIEW}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".admin-heading")).toContainText("PENDING_REVIEW");
    await runAction(page, "Schváliť");
    await expect(page.locator(".admin-heading")).toContainText("VISIBLE");

    await page.goto(`${PUBLIC_PROFILE}?reviews3=approved#recenzie`, { waitUntil: "domcontentloaded" });
    const reviews = page.locator("#recenzie");
    await expect(reviews.getByText("3 recenzie", { exact: true })).toBeVisible();
    await expect(reviews.getByText("3,3 z 5", { exact: true })).toBeVisible();
    await expect(reviews.getByText("Táto čakajúca recenzia sa na verejnom profile nesmie zobraziť.", { exact: true })).toBeVisible();
    await expect(reviews.getByText("Prístup", { exact: true }).first()).toBeVisible();
  });

  test("hide removes the review from public aggregates and restore preserves publication behavior", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "desktop moderation flow");

    await page.goto(`${ADMIN_LIST}/${APPROVE_REVIEW}`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Dôvod pre zamietnutie, skrytie alebo odstránenie").selectOption("PRIVACY");
    await runAction(page, "Skryť");
    await expect(page.locator(".admin-heading")).toContainText("HIDDEN");

    await page.goto(`${PUBLIC_PROFILE}?reviews3=hidden#recenzie`, { waitUntil: "domcontentloaded" });
    let reviews = page.locator("#recenzie");
    await expect(reviews.getByText("2 recenzie", { exact: true })).toBeVisible();
    await expect(reviews.getByText("4,5 z 5", { exact: true })).toBeVisible();
    await expect(reviews.getByText("Táto čakajúca recenzia sa na verejnom profile nesmie zobraziť.", { exact: true })).toHaveCount(0);

    await page.goto(`${ADMIN_LIST}/${APPROVE_REVIEW}`, { waitUntil: "domcontentloaded" });
    await runAction(page, "Obnoviť");
    await expect(page.locator(".admin-heading")).toContainText("VISIBLE");

    await page.goto(`${PUBLIC_PROFILE}?reviews3=restored#recenzie`, { waitUntil: "domcontentloaded" });
    reviews = page.locator("#recenzie");
    await expect(reviews.getByText("3 recenzie", { exact: true })).toBeVisible();
    await expect(reviews.getByText("3,3 z 5", { exact: true })).toBeVisible();
    await expect(reviews.getByText("Táto čakajúca recenzia sa na verejnom profile nesmie zobraziť.", { exact: true })).toBeVisible();
  });

  test("reject requires a reason, shows risk/report context and resolves Attention item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "desktop moderation flow");

    await page.goto(`${ADMIN_LIST}/${REJECT_REVIEW}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Nadmerný počet URL", { exact: true })).toBeVisible();
    await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Zamietnuť", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Vyber dôvod moderácie.");

    await page.getByLabel("Dôvod pre zamietnutie, skrytie alebo odstránenie").selectOption("SPAM");
    await page.getByLabel("Interná poznámka moderátora (voliteľná)").fill("E2E interná moderation poznámka.");
    await runAction(page, "Zamietnuť");
    await expect(page.locator(".admin-heading")).toContainText("REJECTED");
    await expect(page.getByText("E2E interná moderation poznámka.", { exact: false })).toBeVisible();

    await page.goto(`${PUBLIC_PROFILE}?reviews3=rejected#recenzie`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#recenzie").getByText(/viacero odkazov https:\/\/one\.invalid/)).toHaveCount(0);

    await page.goto("/admin/operations?source=PROFILE_REVIEW_MODERATION&view=active", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-source="PROFILE_REVIEW_MODERATION"]')).toHaveCount(0);
  });

  test("malicious historical review body stays inert in admin detail", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "desktop moderation flow");

    await page.goto(`${ADMIN_LIST}/e2e-review-vet-visible-2`, { waitUntil: "domcontentloaded" });
    const body = page.getByTestId("admin-review-body");
    await expect(body).toContainText("<script>alert(1)</script>");
    await expect(body.locator("script")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { reviews3Xss?: number }).reviews3Xss ?? 0)).toBe(0);
    await expectAdminAxeClean(page);
  });

  test("390x844 list and detail are overflow-safe, touch-safe and axe-clean", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "390x844 mobile contract");
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${ADMIN_LIST}?status=all`, { waitUntil: "domcontentloaded" });
    await expectNoHorizontalOverflow(page, "admin review list 390x844");
    await expect(page.getByRole("heading", { name: "Moderácia profilových recenzií" })).toBeVisible();

    await page.goto(`${ADMIN_LIST}/e2e-review-vet-visible-1`, { waitUntil: "domcontentloaded" });
    await expectNoHorizontalOverflow(page, "admin review detail 390x844");
    const hide = page.getByRole("button", { name: "Skryť", exact: true });
    await expect(hide).toBeVisible();
    const box = await hide.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await hide.focus();
    await expect(hide).toBeFocused();
    await expectAdminAxeClean(page);
  });
});
