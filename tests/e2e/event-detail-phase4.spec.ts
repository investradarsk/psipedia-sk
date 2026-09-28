import { expect, test } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
});

test("event detail exposes primary facts before long content and keeps optional media honest", async ({ page }) => {
  await page.goto("/podujatia");
  const eventLink = page.locator('[data-event-card] a[href^="/podujatia/"]').first();
  const href = await eventLink.getAttribute("href");
  test.skip(!href, "The local event database has no published event to inspect.");

  await page.goto(href!);
  const header = page.locator("[data-event-detail-header]");
  await expect(header.locator("h1")).toBeVisible();

  const breadcrumbs = header.locator(".page-breadcrumbs");
  await expect(breadcrumbs.getByRole("link", { name: "Domov" })).toHaveAttribute("href", "/");
  await expect(breadcrumbs.getByRole("link", { name: "Podujatia" })).toHaveAttribute("href", "/podujatia");

  const facts = page.locator("[data-event-facts]");
  await expect(facts).toBeVisible();
  await expect(facts.getByText("Termín", { exact: true })).toBeVisible();
  await expect(facts.getByText("Miesto", { exact: true })).toBeVisible();
  await expect(facts.getByText("Organizátor", { exact: true })).toBeVisible();

  const image = page.locator("[data-event-image]");
  if (await image.count()) {
    await expect(image).toBeVisible();
  }

  const externalActions = header.locator('a[target="_blank"]');
  for (let index = 0; index < await externalActions.count(); index += 1) {
    await expect(externalActions.nth(index)).toHaveAttribute("href", /^https?:\/\//);
  }
});
