import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("admin directory server filters", () => {
  test("filters and pagination use the full matching dataset", async ({ page }) => {
    const response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Profily a služby" })).toBeVisible();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(50);

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/\/admin\/adresar\?category=veterinari&status=draft&q=E2E&page=2$/);
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(11);

    await page.getByRole("button", { name: "Publikované", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin/adresar" && url.searchParams.get("category") === "veterinari" && url.searchParams.get("status") === "published" && url.searchParams.get("q") === "E2E" && !url.searchParams.has("page"));
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.locator(".admin-directory-row")).toHaveCount(1);
  });

  test("form filters reset pagination and invalid params fall back safely", async ({ page }) => {
    let response = await page.goto("/admin/adresar?category=bogus&status=archived&page=-4", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByLabel("Kategória")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Všetky", exact: true })).toHaveAttribute("aria-pressed", "true");

    response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E&page=2", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.getByLabel("Hľadať profil").fill("E2E");
    await page.getByLabel("Kategória").selectOption("treneri");
    await page.getByRole("button", { name: "Použiť filtre" }).click();
    await page.waitForURL((url) => url.pathname === "/admin/adresar" && url.searchParams.get("q") === "E2E" && url.searchParams.get("category") === "treneri" && url.searchParams.get("status") === "draft" && !url.searchParams.has("page"));
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.locator(".admin-directory-row")).toHaveCount(1);
  });

  test("select current page, promote to all matching, retain across pagination and clear on filter change", async ({ page }) => {
    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E");
    const pageCheckbox = page.getByLabel("Vybrať všetky profily na tejto strane");
    await pageCheckbox.check();
    await expect(page.getByText("50 položiek vybraných na tejto strane")).toBeVisible();
    await expect(page.getByRole("button", { name: "Vybrať všetkých 61 výsledkov zodpovedajúcich filtrom" })).toBeVisible();

    await page.getByRole("button", { name: "Vybrať všetkých 61 výsledkov zodpovedajúcich filtrom" }).click();
    await expect(page.getByText("Vybraných všetkých 61 výsledkov")).toBeVisible();
    await expect(page.getByText("Vybrané: 61")).toBeVisible();

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/page=2$/);
    await expect(page.getByText("Vybraných všetkých 61 výsledkov")).toBeVisible();
    await expect(page.getByText("Vybrané: 61")).toBeVisible();

    await page.getByRole("button", { name: "Publikované", exact: true }).click();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.getByText("Vybrané: 61")).toHaveCount(0);
    await expect(page.getByText("Vybraných všetkých 61 výsledkov")).toHaveCount(0);
  });

  test("explicit selection preflight reports eligibility without mutation", async ({ page }) => {
    await page.goto("/admin/adresar?category=veterinari&q=E2E");
    await page.getByLabel("Vybrať profil E2E Veterina publikovaná").check();
    await page.getByLabel("Vybrať profil E2E Veterina 059").check();
    await expect(page.getByText("Vybrané: 2")).toBeVisible();

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    const dialog = page.getByRole("dialog", { name: "Publikovať 2 profilov?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 1 eligible / 1 by boli preskočené");
    await expect(dialog).toContainText("už sú v cieľovom stave");
    await expect(dialog.getByRole("button", { name: /Vykonať hromadnú zmenu/ })).toBeDisabled();

    await dialog.getByRole("button", { name: "Zavrieť" }).click();
    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E");
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
  });

  test("preflight API validates authorization, contracts, server normalization and snapshot revalidation", async ({ page, request }) => {
    const unauthorized = await request.post("http://127.0.0.1:5173/api/admin/bulk/preflight", {
      data: {
        module: "directory",
        action: "publish",
        selection: { mode: "explicit", ids: [1] },
      },
    });
    expect(unauthorized.status()).toBe(401);

    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E");

    for (const body of [
      { module: "events", action: "publish", selection: { mode: "explicit", ids: [1] } },
      { module: "directory", action: "delete", selection: { mode: "explicit", ids: [1] } },
      { module: "directory", action: "publish", selection: { mode: "explicit", ids: [0] } },
    ]) {
      const invalid = await page.request.post("/api/admin/bulk/preflight", { data: body });
      expect(invalid.status()).toBe(400);
    }

    const allMatching = await page.request.post("/api/admin/bulk/preflight", {
      data: {
        module: "directory",
        action: "publish",
        selection: {
          mode: "all-matching",
          filter: { category: "veterinari", status: "draft", q: " E2E ", page: 999 },
        },
      },
    });
    expect(allMatching.ok()).toBeTruthy();
    const allMatchingBody = await allMatching.json();
    expect(allMatchingBody.matched).toBe(61);
    expect(allMatchingBody.eligible).toBe(61);
    expect(allMatchingBody.wouldBeSkipped).toBe(0);
    expect(allMatchingBody.snapshot.filterFingerprint).toBe("directory:v1:category=veterinari&status=draft&q=E2E");
    expect(allMatchingBody.snapshot.filterFingerprint).not.toContain("page");

    const revalidated = await page.request.post("/api/admin/bulk/preflight/revalidate", {
      data: { snapshotId: allMatchingBody.snapshot.id },
    });
    expect(revalidated.ok()).toBeTruthy();
    const revalidatedBody = await revalidated.json();
    expect(revalidatedBody.matched).toBe(61);
    expect(revalidatedBody.eligible).toBe(61);

    const missing = await page.request.post("/api/admin/bulk/preflight", {
      data: {
        module: "directory",
        action: "publish",
        selection: { mode: "explicit", ids: [999999999], filter: { category: "veterinari" } },
      },
    });
    expect(missing.ok()).toBeTruthy();
    const missingBody = await missing.json();
    expect(missingBody.matched).toBe(1);
    expect(missingBody.eligible).toBe(0);
    expect(missingBody.wouldBeSkipped).toBe(1);
    expect(missingBody.skips).toEqual([{ reason: "record-no-longer-exists", count: 1 }]);

    await page.reload();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
  });

  test("selection is keyboard operable and new selection UI remains axe-clean", async ({ page }) => {
    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E");
    const first = page.getByLabel("Vybrať profil E2E Veterina 059");
    await expect(first).toBeVisible();
    await expect(first).toBeEnabled();
    await first.focus();
    await page.keyboard.press("Space");
    await expect(first).toBeChecked();
    await expect(page.getByText("Vybrané: 1")).toBeVisible();

    const toolbarScan = await new AxeBuilder({ page })
      .include('aside[aria-label="Hromadný výber"]')
      .analyze();
    expect(toolbarScan.violations).toEqual([]);

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    const dialog = page.getByRole("dialog", { name: "Publikovať 1 profilov?" });
    await expect(dialog).toBeVisible();
    const dialogScan = await new AxeBuilder({ page })
      .include("dialog")
      .analyze();
    expect(dialogScan.violations).toEqual([]);
  });
});

const longServicesDetailName = "E2E Centrum komplexného výcviku, socializácie a behaviorálneho poradenstva pre psy";

test.describe("public services detail shell", () => {
  test("long profile renders statuses, CTA hierarchy and rich content without overflow", async ({ page }) => {
    const response = await page.goto("/adresar/treneri/e2e-services-detail-long", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    const heading = main.getByRole("heading", { level: 1, name: longServicesDetailName });
    await expect(heading).toBeVisible();
    await expect(main.getByText("Tréner / psia škola", { exact: true })).toBeVisible();
    await expect(main.getByText("Overený profil", { exact: true })).toBeVisible();
    await expect(main.getByText("Odporúčame", { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "Poslať dopyt", exact: true })).toHaveAttribute("href", "#kontakt");
    await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveAttribute("href", "tel:+421900123456");
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Praktické informácie", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toBeVisible();
    await expect(main.getByText("Nitra a okolie", { exact: true })).toBeVisible();

    expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });

  test("minimum profile omits absent image, contacts, optional sections and placeholder values", async ({ page }) => {
    const response = await page.goto("/adresar/dalsie-sluzby/e2e-services-detail-minimum", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    const main = page.locator("main#obsah");
    await expect(main.getByRole("heading", { level: 1, name: "E2E Minimálna služba" })).toBeVisible();
    await expect(main.getByText("Služba pre psov", { exact: true })).toBeVisible();
    await expect(main.getByText("Overený profil", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Odporúčame", { exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Služby", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Kvalifikácie a zameranie", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Kontakt", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Odborné údaje", exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Praktické informácie", exact: true })).toBeVisible();
    await expect(main.locator('img[alt^="Fotografia služby"]')).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Zavolať", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Web ↗", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Navigovať ↗", exact: true })).toHaveCount(0);
    await expect(main.getByText("N/A", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Neuvedené", { exact: true })).toHaveCount(0);
    await expect(main.getByText("Nezistené", { exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const accessibility = await new AxeBuilder({ page })
      .include("main#obsah")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
});
