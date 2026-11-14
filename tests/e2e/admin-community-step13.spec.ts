import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  const host = baseURL ? new URL(baseURL).hostname : "";
  test.skip(!["localhost", "127.0.0.1", "::1"].includes(host), "Read-only isolated local admin fixtures only");
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function expectNoDocumentOverflow(page: Page, width: number) {
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(sizes.scroll, "document overflow at " + width + "px").toBeLessThanOrEqual(sizes.client + 1);
}

test("step 13: partner accounts, attention links and status filters fit phones", async ({ page }) => {
  const response = await page.goto("/admin/partners", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const metrics = page.locator("[data-admin-community-metrics]");
  const attention = page.locator("[data-admin-partner-attention]");
  const search = page.locator("[data-admin-partner-accounts] form[data-admin-list-filters]");
  await expect(metrics).toBeVisible();
  await expect(attention).toBeVisible();
  await expect(search).toBeVisible();
  await expect(search.locator('select[name="status"] option[value="PENDING_VERIFICATION"]')).toHaveText("Neoverené účty");
  await expect(attention.getByRole("link", { name: /Prevzatie profilov/ }))
    .toHaveAttribute("href", "/admin/partners/claims?status=PENDING");
  const list = page.getByRole("list", { name: "Partnerské účty" });
  await expect(list).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(search).toBeVisible();
    await expectNoDocumentOverflow(page, width);
  }
});

for (const { path, stateOption } of [
  { path: "/admin/partners/claims", stateOption: "PENDING" },
  { path: "/admin/partners/submissions", stateOption: "PENDING_REVIEW" },
  { path: "/admin/partners/changes", stateOption: "PENDING_REVIEW" },
  { path: "/admin/partners/verifications", stateOption: "PENDING_VERIFICATION" },
]) {
  test(`step 13: ${path} keeps accessible filters and moderation cards`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const filters = page.locator("form.admin-commercial-filters[data-admin-list-filters]");
    const list = page.locator(".admin-commercial-list[data-admin-community-list]");
    await expect(filters).toBeVisible();
    await expect(list).toBeVisible();
    await expect(filters.locator('select[name="status"] option[value="' + stateOption + '"]')).toHaveCount(1);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(filters).toBeVisible();
      await expectNoDocumentOverflow(page, width);
      const submit = filters.getByRole("button", { name: "Filtrovať" });
      expect(await submit.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    const detailLink = list.locator('a[href^="' + path + '/"]').first();
    if (await detailLink.count()) await expect(detailLink).toBeVisible();
    // No status changes, approvals, rejections or form submissions here.
  });
}

test("step 13: profile-review moderation remains readable without triggering approval", async ({ page }) => {
  const response = await page.goto("/admin/recenzie-profilov", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const filters = page.locator('form.admin-review-filters[data-admin-list-filters]');
  const reviews = page.locator('[data-admin-community-list][aria-label="Profilové recenzie"]');
  await expect(filters).toBeVisible();
  await expect(reviews).toBeVisible();
  await expect(filters.locator('select[name="status"] option[value="PENDING_REVIEW"]')).toHaveText("Čaká na kontrolu");
  await expect(page.locator('[data-admin-list-results][role="status"]')).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoDocumentOverflow(page, width);
  }
  const first = reviews.locator("[data-admin-community-review]").first();
  if (await first.count()) {
    await expect(first).toBeVisible();
    await expect(first.getByRole("link", { name: /Detail/ })).toBeVisible();
  }
});

test("step 13: article feedback cards retain actions and compact mobile layout", async ({ page }) => {
  const response = await page.goto("/admin/hodnotenia", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const panel = page.locator('[data-admin-content-module="reader-feedback"]');
  await expect(panel).toBeVisible();
  await expect(page.locator("[data-admin-community-metrics]")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(panel).toBeVisible();
    await expectNoDocumentOverflow(page, width);
  }
  const first = panel.locator("[data-admin-community-feedback]").first();
  if (await first.count()) {
    await expect(first.getByRole("link", { name: /Otvoriť článok/ })).toBeVisible();
    // Only check the actions are visible and reachable; never click status transitions.
  }
});


for (const { path, module } of [
  { path: "/admin/tipy", module: "community-tips" },
  { path: "/admin/dopyty", module: "community-inquiries" },
  { path: "/admin/adresar/navrhy", module: "community-profile-suggestions" },
]) {
  test(`step 13: ${module} community queue fits all viewports without changing records`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const root = page.locator('[data-admin-content-module="' + module + '"]');
    await expect(root).toBeVisible();
    await expect(page.locator("[data-admin-community-metrics]")).toBeVisible();
    const filter = root.locator(".admin-status-filter");
    await expect(filter).toBeVisible();
    const cards = root.locator("[data-admin-community-card]");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(filter).toBeVisible();
      await expectNoDocumentOverflow(page, width);
      const firstButton = filter.getByRole("button").first();
      if (await firstButton.count())
        expect(await firstButton.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    if (await cards.count()) await expect(cards.first()).toBeVisible();
    // Do not click review, save, reject, remove or any other mutation.
  });
}
