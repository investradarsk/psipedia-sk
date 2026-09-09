import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("Phase 4 event detail exposes the primary facts before long content", async ({ page }) => {
  await page.goto("/podujatia");
  const eventLink = page.locator('.event-grid a[href^="/podujatia/"]').first();
  const href = await eventLink.getAttribute("href");
  test.skip(!href, "The local event database has no published event to inspect.");

  await page.goto(href!);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".event-detail-visual.media-frame")).toBeVisible();

  const breadcrumbs = page.locator(".event-detail-hero .page-breadcrumbs");
  await expect(breadcrumbs.getByRole("link", { name: "Domov" })).toHaveAttribute("href", "/");
  await expect(breadcrumbs.getByRole("link", { name: "Podujatia" })).toHaveAttribute("href", "/podujatia");

  const summary = page.locator(".event-detail-summary");
  await expect(summary).toBeVisible();
  await expect(summary.getByText("Termín", { exact: true })).toBeVisible();
  await expect(summary.getByText("Miesto", { exact: true })).toBeVisible();
  await expect(summary.getByText("Organizátor", { exact: true })).toBeVisible();

  const actions = page.locator(".event-detail-actions a");
  for (let index = 0; index < await actions.count(); index += 1) {
    await expect(actions.nth(index)).toHaveAttribute("href", /^https?:\/\//);
  }
});
