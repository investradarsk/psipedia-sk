import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const outDir = ".e2e-artifacts/events-editor-v3";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

async function checkNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.page, "horizontal overflow").toBeLessThanOrEqual(widths.viewport + 1);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 690 },
]) {
  test(`Events V3 visual, navigation and draft persistence at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    expect((await page.goto("/admin/event-editor-v3-preview"))?.status()).toBe(200);
    const root = page.locator("[data-event-editor-v3]");
    await expect(root.locator("[data-editor-page]")).toBeVisible();
    await expect(root.getByRole("button", { name: "Späť na podujatia" })).toHaveCount(1);
    await expect(root.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
    await expect(root.getByRole("button", { name: "Publikovať podujatie" })).toBeVisible();

    const title = root.getByLabel("Názov podujatia");
    await title.fill("Klubová výstava retrieverov");
    const markdown = root.getByLabel("Podrobný popis");
    await expect(markdown).toBeEnabled();
    await markdown.fill("Prvý odsek\n\n**Dôležité informácie**");
    if (viewport.width <= 820) {
      await root.getByLabel("Sekcia editora").selectOption("event-location");
      await root.getByRole("button", { name: "Náhľad", exact: true }).click();
    } else {
      await root.getByRole("button", { name: "Miesto a organizátor" }).click();
    }
    await expect(root.locator("[data-event-live-summary]")).toContainText("Klubová výstava retrieverov");
    if (viewport.width <= 820) {
      await root.getByRole("button", { name: "Späť na úpravy" }).click();
      await root.getByLabel("Sekcia editora").selectOption("event-details");
    }
    await expect(title).toHaveValue("Klubová výstava retrieverov");
    await expect(markdown).toHaveValue("Prvý odsek\n\n**Dôležité informácie**");
    await expect(root.getByText("Dôležité informácie").first()).toBeVisible();
    await checkNoHorizontalOverflow(page);

    mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: `${outDir}/events-v3-${viewport.width}.png`, animations: "disabled" });
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);

    await root.getByRole("button", { name: "Späť na podujatia" }).click();
    const guard = page.getByRole("dialog", { name: "Neuložené zmeny" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
    await expect(title).toHaveValue("Klubová výstava retrieverov");
  });
}

test("Save concept submits via external form association and preserves canonical payload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ event: { id: 99991, status: "draft" } }) });
    } else await route.abort();
  });
  await page.goto("/admin/event-editor-v3-preview");
  const root = page.locator("[data-event-editor-v3]");
  await root.getByLabel("Názov podujatia").fill("Testovací koncept");
  await root.getByLabel("Mesto").fill("Nitra");
  await root.getByLabel("Organizátor").fill("Klub");
  await root.getByLabel("Dátum začiatku").fill("2026-11-12");
  await root.getByRole("button", { name: "Uložiť koncept" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].title).toBe("Testovací koncept");
  expect(requests[0].status).toBe("draft");
  expect(requests[0].city).toBe("Nitra");
  expect(requests[0].registrationUrl).toBeNull();
});
