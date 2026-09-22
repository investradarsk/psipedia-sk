import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("admin directory v2", () => {
  test("dense list uses the full dataset, accent-insensitive search and combined filters", async ({ page }) => {
    const response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Profily a služby" })).toBeVisible();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(50);
    await expect(page.locator(".admin-directory-row").first()).toContainText("Aktualizované");

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 61");
    await expect(page.locator(".admin-directory-row")).toHaveCount(11);

    await page.goto("/admin/adresar?category=veterinari&status=draft&q=zilina&region=%C5%BDilinsk%C3%BD+kraj&district=%C5%BDilina&city=%C5%BDilina&verification=unverified&media=without-image");
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    const onlyRow = page.locator(".admin-directory-row").first();
    await expect(onlyRow).toContainText("E2E Veterina 061");
    await expect(onlyRow).toContainText("Neoverené");
    await expect(onlyRow).toContainText("Bez obrázka");
  });

  test("form filters reset pagination and invalid params fall back safely", async ({ page }) => {
    let response = await page.goto("/admin/adresar?category=bogus&status=bogus&verification=bogus&media=bogus&page=-4", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByLabel("Kategória")).toHaveValue("");
    await expect(page.getByLabel("Stav publikácie")).toHaveValue("all");
    await expect(page.getByLabel("Overenie")).toHaveValue("all");
    await expect(page.getByLabel("Obrázok")).toHaveValue("all");

    response = await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E&page=2", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.getByLabel("Hľadať").fill("E2E");
    await page.getByLabel("Kategória").selectOption("treneri");
    await page.getByRole("button", { name: "Použiť filtre" }).click();
    await page.waitForURL((url) =>
      url.pathname === "/admin/adresar"
      && url.searchParams.get("q") === "E2E"
      && url.searchParams.get("category") === "treneri"
      && url.searchParams.get("status") === "draft"
      && !url.searchParams.has("page"),
    );
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
  });

  test("selection stays page-scoped and clears when pagination or membership changes", async ({ page }) => {
    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E");
    const pageCheckbox = page.getByLabel("Vybrať všetky profily na tejto strane");
    await pageCheckbox.check();
    await expect(page.getByText("50 položiek vybraných na tejto strane")).toBeVisible();
    await expect(page.getByText("Vybrané: 50", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Vybrať všetkých .* výsledkov zodpovedajúcich filtrom/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Ďalšia →" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".admin-directory-row")).toHaveCount(11);
    await expect(page.getByText("Vybrané: 50", { exact: true })).toHaveCount(0);

    const secondPageCheckbox = page.getByLabel("Vybrať všetky profily na tejto strane");
    await secondPageCheckbox.check();
    await expect(page.getByText("11 položiek vybraných na tejto strane")).toBeVisible();
    await expect(page.getByText("Vybrané: 11", { exact: true })).toBeVisible();

    await page.getByLabel("Stav publikácie").selectOption("published");
    await page.getByRole("button", { name: "Použiť filtre" }).click();
    await expect(page.locator(".admin-directory-results")).toContainText("Nájdené: 1");
    await expect(page.getByText("Vybrané: 11", { exact: true })).toHaveCount(0);
  });

  test("directory bulk publish and move-to-draft execute only after preflight confirmation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Mutation flow runs once against the shared local fixture.");
    await page.goto("/admin/adresar?category=dalsie-sluzby&q=Bulk+Fixture");
    await page.getByLabel("Vybrať profil Bulk Fixture Draft").check();
    await page.getByLabel("Vybrať profil Bulk Fixture Published").check();
    await expect(page.getByText("Vybrané: 2")).toBeVisible();

    await page.getByRole("button", { name: "Skontrolovať publikovanie" }).click();
    let dialog = page.getByRole("dialog", { name: "Publikovať 2 profilov?" });
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 1 eligible / 1 by boli preskočené");
    await dialog.getByRole("button", { name: /Potvrdiť a vykonať: publikovať/i }).click();
    await expect(dialog).toContainText("Hotovo: 1 zmenených / 1 preskočených / 0 zlyhaní");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();

    await expect(page.locator(".admin-directory-row").filter({ hasText: "Bulk Fixture Draft" })).toContainText("Publikované");
    await page.getByLabel("Vybrať všetky profily na tejto strane").check();
    await page.getByRole("button", { name: "Skontrolovať presun do konceptov" }).click();
    dialog = page.getByRole("dialog", { name: "Presunúť do konceptov 2 profilov?" });
    await dialog.getByRole("button", { name: "Spustiť preflight" }).click();
    await expect(dialog).toContainText("2 výsledkov / 2 eligible / 0 by boli preskočené");
    await dialog.getByRole("button", { name: /Potvrdiť a vykonať: presunúť do konceptov/i }).click();
    await expect(dialog).toContainText("Hotovo: 2 zmenených / 0 preskočených / 0 zlyhaní");
    await dialog.getByRole("button", { name: "Zavrieť a obnoviť" }).click();
    await expect(page.locator(".admin-directory-row").filter({ hasText: "Bulk Fixture Published" })).toContainText("Koncept");
  });

  test("bulk API enforces same-origin requests and keeps verification outside bulk actions", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Mutation flow runs once against the shared local fixture.");
    const unauthorized = await request.post("http://127.0.0.1:5173/api/admin/bulk/execute", {
      data: {
        module: "directory", action: "publish", snapshotId: "missing",
        membershipFingerprint: "missing", selection: { mode: "all-matching" },
      },
    });
    expect(unauthorized.status()).toBe(401);

    await page.goto("/admin/adresar?category=dalsie-sluzby&status=draft&q=Bulk+Fixture");
    const origin = new URL(page.url()).origin;

    const rejectedCrossOrigin = await page.request.post("/api/admin/bulk/preflight", {
      headers: { origin: "https://example.invalid" },
      data: {
        module: "directory",
        action: "publish",
        selection: { mode: "explicit", ids: [1] },
      },
    });
    expect(rejectedCrossOrigin.status()).toBe(403);

    const firstRow = page.locator(".admin-directory-row").filter({ hasText: "Bulk Fixture" }).first();
    await firstRow.locator('input[type="checkbox"]').check();
    const editHref = await firstRow.locator("a.admin-row-edit").getAttribute("href");
    const selectedId = Number(editHref?.match(/\/admin\/adresar\/(\d+)/)?.[1]);
    expect(Number.isSafeInteger(selectedId)).toBeTruthy();

    const preflight = await page.request.post("/api/admin/bulk/preflight", {
      headers: { origin },
      data: {
        module: "directory",
        action: "publish",
        selection: {
          mode: "explicit",
          ids: [selectedId],
          filter: {
            category: "dalsie-sluzby", status: "draft", q: " Bulk Fixture ",
            region: "", district: "", city: "", verification: "all", media: "all",
          },
        },
      },
    });
    expect(preflight.ok()).toBeTruthy();
    const body = await preflight.json();
    expect(body.matched).toBe(1);
    expect(body.eligible).toBe(1);
    expect(body.snapshot.filterFingerprint).toBe(
      "directory:v2:category=dalsie-sluzby&status=draft&q=Bulk+Fixture&region=&district=&city=&verification=all&media=all",
    );

    const execution = await page.request.post("/api/admin/bulk/execute", {
      headers: { origin },
      data: {
        module: "directory",
        action: "publish",
        snapshotId: body.snapshot.id,
        membershipFingerprint: body.snapshot.filterFingerprint,
        selection: { mode: "explicit", ids: [selectedId] },
      },
    });
    expect(execution.ok()).toBeTruthy();
    expect((await execution.json()).counts).toEqual({ requested: 1, updated: 1, skipped: 0, failed: 0 });

    const invalidTrust = await page.request.post("/api/admin/bulk/preflight", {
      headers: { origin },
      data: { module: "directory", action: "verify", selection: { mode: "explicit", ids: [selectedId] } },
    });
    expect(invalidTrust.status()).toBe(400);
  });

  test("editor safely edits contacts/media, preserves relation metadata and keeps trust separate from publication", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Mutation flow runs once against the shared local fixture.");
    await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture");
    await page.getByRole("link", { name: "Directory Admin Editor Fixture" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Upraviť profil" })).toBeVisible();

    await expect(page.getByLabel("Verejný telefón")).toHaveValue("+421 900 111 222");
    await expect(page.getByLabel("Verejný e-mail")).toHaveValue("public-fixture@example.invalid");
    await expect(page.getByLabel("Interný e-mail")).toHaveValue("internal-fixture@example.invalid");
    await expect(page.getByText("Trust stav: redakcia preverila základné údaje. Nie je to publication state.")).toBeVisible();
    await expect(page.getByText("Neznamená platené ani sponzorované umiestnenie.")).toBeVisible();

    const advanced = page.getByRole("button", { name: "Pokročilé a SEO" });
    await advanced.click();
    const drawer = page.getByRole("dialog", { name: "Pokročilé nastavenia" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel("Adresa profilu")).toHaveValue("directory-admin-editor-fixture");
    await page.keyboard.press("Escape");
    await expect(advanced).toBeFocused();

    await page.getByLabel("Verejný telefón").fill("+421 900 333 444");
    await page.getByLabel("Verejný e-mail").fill("updated-public@example.invalid");
    await page.getByLabel("Facebook").fill("https://facebook.com/updated-fixture");
    await expect(page.getByRole("button", { name: "Odstrániť fotku" })).toBeVisible();
    await page.getByRole("button", { name: "Odstrániť fotku" }).click();
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByRole("status")).toContainText("Profil je publikovaný");

    const id = Number(page.url().match(/\/admin\/adresar\/(\d+)/)?.[1]);
    expect(Number.isSafeInteger(id)).toBeTruthy();
    const api = await page.request.get(`/api/admin/directory/${id}`);
    expect(api.ok()).toBeTruthy();
    const profile = (await api.json()).profile;
    expect(profile.status).toBe("published");
    expect(profile.verified).toBe(true);
    expect(profile.featured).toBe(true);
    expect(profile.imageUrl).toBeNull();
    expect(profile.importData["Telefón"]).toBe("+421 900 333 444");
    expect(profile.importData["E-mail"]).toBe("updated-public@example.invalid");
    expect(profile.importData["Plemeno"]).toBe("Labradorský retriever");
    expect(profile.importData["Organizácia"]).toBe("Fixture klub");

    const publicResponse = await page.goto("/adresar/treneri/directory-admin-editor-fixture", { waitUntil: "domcontentloaded" });
    expect(publicResponse?.status()).toBe(200);
    await expect(page.getByText("+421 900 333 444")).toBeVisible();
  });

  test("create flow validates current contract and produces a manageable draft", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Mutation flow runs once against the shared local fixture.");
    await page.goto("/admin/adresar/novy");
    await expect(page.locator("form.admin-directory-editor")).toHaveAttribute("data-hydrated", "true");

    await page.getByLabel("Názov profilu").fill("Directory Admin Created Fixture");
    await page.getByLabel("Krátky popis").fill("Testovací profil vytvorený cez nový directory admin flow.");
    await page.getByLabel("Podrobný popis").fill("Toto je dostatočne dlhý deterministický popis používaný iba v lokálnom E2E teste administrácie.");
    await page.getByLabel("Mesto").fill("Nitra");
    await page.getByLabel("Verejný telefón").fill("neplatny-telefon");
    await page.getByRole("button", { name: "Publikovať profil" }).click();
    await expect(page.getByRole("alert")).toContainText("Telefónne číslo nie je platné.");

    await page.getByLabel("Verejný telefón").fill("+421 900 555 666");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await page.waitForURL(/\/admin\/adresar\/\d+\?vytvorene=1/);
    const id = Number(page.url().match(/\/admin\/adresar\/(\d+)/)?.[1]);
    const api = await page.request.get(`/api/admin/directory/${id}`);
    expect(api.ok()).toBeTruthy();
    expect((await api.json()).profile.status).toBe("draft");
    const cleanup = await page.request.delete(`/api/admin/directory/${id}`);
    expect(cleanup.ok()).toBeTruthy();
  });

  test("keyboard, dialog focus, Axe and 390px overflow remain clean", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/adresar?category=veterinari&status=draft&q=E2E", { waitUntil: "domcontentloaded" });

    const first = page.getByLabel("Vybrať profil E2E Veterina 059");
    await expect(first).toBeEnabled();
    await first.focus();
    await page.keyboard.press("Space");
    await expect(first).toBeChecked();

    const listScan = await new AxeBuilder({ page }).include("main").analyze();
    expect(listScan.violations).toEqual([]);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filter: document.querySelector<HTMLElement>(".admin-directory-category-filter")!.scrollWidth
        - document.querySelector<HTMLElement>(".admin-directory-category-filter")!.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.filter).toBeLessThanOrEqual(1);

    for (const control of [
      page.getByLabel("Hľadať"),
      page.getByLabel("Kategória"),
      page.getByLabel("Stav publikácie"),
      page.getByLabel("Kraj"),
      page.getByLabel("Okres"),
      page.locator('select[name="city"]'),
      page.getByLabel("Overenie"),
      page.getByLabel("Obrázok"),
      page.getByRole("button", { name: "Použiť filtre" }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await page.goto("/admin/adresar?category=treneri&q=Directory+Admin+Editor+Fixture");
    await page.getByRole("link", { name: "Directory Admin Editor Fixture" }).click();
    const editorOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(editorOverflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Pokročilé a SEO" }).click();
    const drawerScan = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(drawerScan.violations).toEqual([]);
  });
});
