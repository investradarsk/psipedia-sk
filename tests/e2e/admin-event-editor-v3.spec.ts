import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const outDir = ".e2e-artifacts/events-editor-v3";
const sections = [
  ["event-basics", "Základné údaje"],
  ["event-schedule", "Termín a typ"],
  ["event-location", "Miesto podujatia"],
  ["event-contacts", "Organizátor a kontakty"],
  ["event-details", "Program a informácie"],
  ["event-media", "Fotografia a URL"],
  ["event-notes", "Interné poznámky"],
  ["event-seo", "SEO"],
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  // All network effects in these browser tests stay in the localhost Vite/D1 fixture.
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  await page.route("https://maps.gstatic.com/**", (route) => route.abort());
});

async function openEditor(page: Page, fixture = "") {
  const url = "/admin/event-editor-v3-preview" + (fixture ? "?fixture=" + fixture : "");
  expect((await page.goto(url))?.status()).toBe(200);
  const root = page.locator("[data-event-editor-v3]");
  await expect(root.locator("[data-editor-page]")).toBeVisible();
  // The event editor declares itself hydrated only when client handlers work.
  await expect(root.locator("[data-hydrated]").first()).toHaveAttribute("data-hydrated", "true");
  return root;
}

async function showEventSection(root: Locator, id: string, label: string) {
  const navigation = root.locator("[data-editor-navigation]");
  const select = root.getByLabel("Sekcia editora");
  if (await select.isVisible()) await select.selectOption(id);
  else await navigation.getByRole("button", { name: label, exact: true }).click();
  await expect(root.locator("#" + id)).toBeVisible();
}

async function checkNoHorizontalOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  if (bounds.document > bounds.viewport + 1) {
    // Genuine overflows must remain a failing assertion, with actionable DOM evidence.
    const culprits = await page.evaluate(() => {
      const edge = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll<HTMLElement>("body *")).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === "string" ? element.className.slice(0, 90) : "",
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          minWidth: style.minWidth,
          whiteSpace: style.whiteSpace,
          position: style.position,
        };
      }).filter((item) => item.right > edge + 1 && item.width > 0)
        .sort((a, b) => b.right - a.right).slice(0, 12);
    });
    console.log("EVENTS_V3_OVERFLOW", JSON.stringify({ ...bounds, culprits }));
  }
  expect(bounds.document, "document overflow").toBeLessThanOrEqual(bounds.viewport + 1);
}

async function image(page: Page, name: string) {
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: outDir + "/" + name + ".png", animations: "disabled" });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 690 },
]) {
  test("Events V3: eight sections, edit preservation, preview, SEO, footer and guard at " + viewport.width + "px", async ({ page }) => {
    await page.setViewportSize(viewport);
    const root = await openEditor(page);
    await expect(root.locator("[data-admin-editor-section]")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Späť na podujatia", exact: true })).toHaveCount(1);
    await expect(root.getByRole("button", { name: "Uložiť koncept", exact: true })).toBeVisible();
    await expect(root.getByRole("button", { name: "Publikovať podujatie", exact: true })).toBeVisible();

    const pager = root.getByRole("navigation", { name: "Prechod medzi sekciami podujatia" });
    await pager.getByRole("button", { name: "Ďalšia" }).click();
    await expect(root.locator("#event-schedule")).toBeFocused();
    await pager.getByRole("button", { name: "Predchádzajúca" }).click();
    await expect(root.locator("#event-basics")).toBeFocused();
    const title = root.getByLabel("Názov podujatia");
    await title.fill("Klubová výstava retrieverov");
    await showEventSection(root, "event-details", "Program a informácie");
    const markdown = root.getByRole("textbox", { name: "Podrobný popis", exact: true });
    await markdown.fill("Prvý odsek\n\nDôležité informácie");
    await expect(root.getByRole("region", { name: "Náhľad: Podrobný popis" })).toContainText("Dôležité informácie");
    await showEventSection(root, "event-schedule", "Termín a typ");
    await root.getByLabel("Dátum začiatku").fill("2026-11-12");

    // Every navigation target must exist and accept section switching.
    for (const [id, label] of sections) {
      const section = root.locator("[data-admin-editor-section]#" + id);
      await expect(section).toHaveCount(1);
      await showEventSection(root, id, label);
      await expect(section).toBeVisible();
    }

    await root.getByLabel("SEO title").fill("Klubová výstava – SEO test");
    const lastSeo = root.getByLabel("Open Graph description");
    await lastSeo.fill("Posledné pole formulára je dostupné.");
    await lastSeo.scrollIntoViewIfNeeded();
    await expect(lastSeo).toBeInViewport();
    // Single-panel navigation is allowed to fit in a viewport: don't
    // require an artificial scrollbar; the final SEO field must be reachable.
    await expect(lastSeo).toBeInViewport();
    await checkNoHorizontalOverflow(page);
    const actionbar = root.locator("[data-editor-actionbar]");
    await actionbar.scrollIntoViewIfNeeded();
    await expect(actionbar).toBeInViewport({ ratio: 0.1 });
    await image(page, "events-v3-" + viewport.width + "-seo-footer");

    if (viewport.width <= 820) {
      await root.getByRole("button", { name: "Náhľad", exact: true }).click();
      await expect(root.locator("[data-event-live-summary]")).toBeVisible();
      await expect(root.locator("[data-event-live-summary]")).toContainText("Klubová výstava retrieverov");
      await root.getByRole("button", { name: "Späť na úpravy" }).click();
    } else {
      await expect(root.locator("[data-event-live-summary]")).toContainText("Klubová výstava retrieverov");
    }
    await showEventSection(root, "event-basics", "Základné údaje");

    // Section navigation scrolls smoothly; wait until the selected Basics section
    // is actually visible before capturing the final layout, not mid-animation.
    await expect(root.locator("#event-basics")).toBeInViewport({ ratio: 0.2 });
    await expect(title).toHaveValue("Klubová výstava retrieverov");
    await showEventSection(root, "event-details", "Program a informácie");
    await expect(markdown).toContainText("Prvý odsek");
    await expect(markdown).toContainText("Dôležité informácie");
    await showEventSection(root, "event-seo", "SEO");
    await expect(root.getByLabel("SEO title")).toHaveValue("Klubová výstava – SEO test");
    await showEventSection(root, "event-basics", "Základné údaje");
    await checkNoHorizontalOverflow(page);
    if (viewport.width > 820) {
      const previewPanel = root.locator("[data-editor-preview]");
      await expect(previewPanel).toHaveAttribute("tabindex", "0");
      await previewPanel.focus();
      await expect(previewPanel).toBeFocused();
    }
    await image(page, "events-v3-" + viewport.width);

    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);

    await root.getByRole("button", { name: "Späť na podujatia", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Neuložené zmeny" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
    await expect(guard).not.toBeVisible();
    await expect(title).toHaveValue("Klubová výstava retrieverov");
  });
}


test("New event: publication accepts empty optional content and leaves title intact", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { id: 99993, status: "published" } }),
    });
  });
  const root = await openEditor(page);
  await root.getByLabel("Názov podujatia").fill("Tréning psov");
  await root.getByRole("button", { name: "Publikovať podujatie" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    title: "Tréning psov", status: "published", excerpt: "",
    startDate: "", city: "", organizer: "", description: "",
  });
  await expect(root.getByText("Vyplň povinné pole: Krátky popis.")).toHaveCount(0);
});

test("New event: external-form draft button sends canonical POST to isolated mocked API", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { id: 99991, status: "draft" } }),
    });
  });
  const root = await openEditor(page);
  await root.getByLabel("Názov podujatia").fill("Testovací koncept");
  await showEventSection(root, "event-location", "Miesto podujatia");
  await root.getByLabel("Mesto").fill("Nitra");
  await showEventSection(root, "event-contacts", "Organizátor a kontakty");
  await root.getByRole("textbox", { name: "Organizátor", exact: true }).fill("Klub");
  await showEventSection(root, "event-schedule", "Termín a typ");
  await root.getByLabel("Dátum začiatku").fill("2026-11-12");
  await showEventSection(root, "event-details", "Program a informácie");
  await root.getByRole("textbox", { name: "Podrobný popis", exact: true }).fill("Markdown koncept");
  await root.getByLabel("Vstupné").fill("5 € / deti zdarma");
  await showEventSection(root, "event-contacts", "Organizátor a kontakty");
  await root.getByLabel("Verejný telefón organizátora").fill("+421 900 111 222");
  await root.getByLabel("Verejný e-mail organizátora").fill("klub@example.sk");
  await showEventSection(root, "event-details", "Program a informácie");
  await expect(root.getByLabel("Vstupné")).toHaveValue("5 € / deti zdarma");
  await showEventSection(root, "event-contacts", "Organizátor a kontakty");
  await expect(root.getByLabel("Verejný telefón organizátora")).toHaveValue("+421 900 111 222");
  await expect(root.getByLabel("Verejný e-mail organizátora")).toHaveValue("klub@example.sk");
  await root.getByRole("button", { name: "Uložiť koncept" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    title: "Testovací koncept", slug: "testovaci-koncept",
    status: "draft", city: "Nitra", organizer: "Klub",
    startDate: "2026-11-12", description: "Markdown koncept",
    registrationUrl: null, endDate: null, cancelled: false,
    contactPhone: "+421 900 111 222", contactEmail: "klub@example.sk", admissionFee: "5 € / deti zdarma",
  });
  expect(requests[0]).toHaveProperty("seo");
  expect(requests[0]).toHaveProperty("thumbnailImageDisplay");
  expect(requests[0]).toHaveProperty("detailImageDisplay");
});

test("New event: publish action sends published status through the canonical POST", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events", async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { id: 99992, status: "published" } }),
    });
  });
  const root = await openEditor(page);
  await root.getByLabel("Názov podujatia").fill("Publikovaný E2E test");
  await root.getByRole("textbox", { name: "Krátky popis" }).fill("Klubová výstava pre chovateľov a návštevníkov.");
  await showEventSection(root, "event-schedule", "Termín a typ");
  await root.getByLabel("Dátum začiatku").fill("2026-11-12");
  await showEventSection(root, "event-location", "Miesto podujatia");
  await root.getByLabel("Mesto").fill("Nitra");
  await showEventSection(root, "event-contacts", "Organizátor a kontakty");
  await root.getByRole("textbox", { name: "Organizátor", exact: true }).fill("Klub");
  await showEventSection(root, "event-details", "Program a informácie");
  await root.getByRole("textbox", { name: "Podrobný popis", exact: true }).fill("Podujatie s programom pre všetkých návštevníkov a vystavovateľov.");
  await root.getByRole("button", { name: "Publikovať podujatie" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ title: "Publikovaný E2E test", status: "published" });
  expect(requests[0]).toHaveProperty("seo");
});

test("Existing published event: PUT preserves payload, save changes and unpublish are real mocked actions", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events/99990", async (route) => {
    if (route.request().method() !== "PUT") return route.abort();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(payload);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { id: 99990, status: payload.status } }),
    });
  });
  const root = await openEditor(page, "published");
  await expect(root.getByRole("button", { name: "Uložiť zmeny", exact: true })).toBeVisible();
  await expect(root.getByRole("button", { name: "Stiahnuť z kalendára", exact: true })).toBeVisible();
  await expect(root.getByRole("button", { name: "Uložiť koncept", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Späť na podujatia", exact: true })).toHaveCount(1);
  await root.getByLabel("Názov podujatia").fill("Upravená klubová výstava");
  await showEventSection(root, "event-seo", "SEO");
  await root.getByLabel("SEO title").fill("Úprava SEO");
  await root.getByRole("button", { name: "Uložiť zmeny", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    status: "published", title: "Upravená klubová výstava", city: "Nitra",
    seo: { title: "Úprava SEO" }, description: "Pôvodný popis",
  });
  await expect(root.getByRole("button", { name: "Uložiť zmeny", exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Stiahnuť z kalendára", exact: true }).click();
  const unpublish = page.getByRole("dialog", { name: "Stiahnuť podujatie z kalendára?" });
  await expect(unpublish).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await unpublish.getByRole("button", { name: "Ponechať publikované" }).click();
  await expect(unpublish).not.toBeVisible();
  await root.getByRole("button", { name: "Stiahnuť z kalendára", exact: true }).click();
  await unpublish.getByRole("button", { name: "Potvrdiť stiahnutie" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ status: "draft", title: "Upravená klubová výstava" });
  await expect(root.getByRole("button", { name: "Publikovať podujatie", exact: true })).toBeVisible();
});


test("Legacy event Markdown is untouched when saving unrelated fields", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events/99990", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(payload);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ event: { id: 99990, status: payload.status } }),
    });
  });
  const root = await openEditor(page, "legacy");
  await showEventSection(root, "event-details", "Program a informácie");
  const source = root.getByRole("textbox", { name: "Podrobný popis", exact: true });
  await expect(source).toHaveValue("* Starý zoznam\n3. Netradičné číslovanie");
  await expect(root.getByRole("textbox", { name: "Praktické informácie", exact: true }))
    .toHaveValue("[Kontakt](mailto:klub@example.org)");
  await showEventSection(root, "event-basics", "Základné údaje");
  await root.getByLabel("Názov podujatia").fill("Zmenený iba názov");
  await root.getByRole("button", { name: "Uložiť zmeny" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    title: "Zmenený iba názov",
    description: "* Starý zoznam\n3. Netradičné číslovanie",
    practicalInfo: "[Kontakt](mailto:klub@example.org)",
  });
});

test("Published event: Enter submits published status and clears dirty guard after successful save", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/admin/events/99990", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(payload);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      event: { id: 99990, status: payload.status },
    }) });
  });
  const root = await openEditor(page, "published");
  const title = root.getByLabel("Názov podujatia");
  await title.fill("Publikované, upravené klávesnicou");
  await title.press("Enter");
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({ status: "published", title: "Publikované, upravené klávesnicou" });
  await expect(root.getByText("Zmeny publikovaného podujatia sú uložené.")).toBeVisible();
  await root.getByRole("button", { name: "Späť na podujatia" }).click();
  await expect(page.getByRole("dialog", { name: "Neuložené zmeny" })).not.toBeVisible();
});

test("Events V3: other internal links are guarded, edits remain after choosing Stay", async ({ page }) => {
  const root = await openEditor(page, "published");
  await root.getByLabel("Názov podujatia").fill("Lokálna zmena pred odchodom");
  await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "/admin/podujatia";
    anchor.textContent = "E2E interný odkaz";
    document.body.appendChild(anchor);
  });
  await page.getByRole("link", { name: "E2E interný odkaz" }).click();
  const guard = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(root.getByLabel("Názov podujatia")).toHaveValue("Lokálna zmena pred odchodom");
  await page.getByRole("link", { name: "E2E interný odkaz" }).click();
  await guard.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(page).toHaveURL(/\/admin\/podujatia(?:\?|$)/);
});

test("Events V3: browser Back is guarded when Navigation API supports cancellation", async ({ page }) => {
  const root = await openEditor(page, "published");
  const supportsNavigation = await page.evaluate(() => "navigation" in window);
  test.skip(!supportsNavigation, "Browser has no Navigation API; native beforeunload remains in EditorWorkspace.");
  // Seed same-document browser history so a cancellable traversal is exercised,
  // without crossing the document boundary from a full page.goto().
  await page.evaluate(() => {
    window.history.replaceState(window.history.state, "", "?fixture=published&step=before");
    window.history.pushState(window.history.state, "", "?fixture=published");
  });
  await root.getByLabel("Názov podujatia").fill("Rozpracované úpravy");
  await page.evaluate(() => window.history.back());
  const guard = page.getByRole("dialog", { name: "Neuložené zmeny" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Pokračovať v úpravách" }).click();
  await expect(root.getByLabel("Názov podujatia")).toHaveValue("Rozpracované úpravy");
  await page.evaluate(() => window.history.back());
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Zahodiť zmeny a zavrieť" }).click();
  await expect(page).toHaveURL(/fixture=published&step=before/);
});

for (const width of [1440, 390, 320]) {
  test("Events V3: published action bar stays usable at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 690 : 900 });
    const root = await openEditor(page, "published");
    await checkNoHorizontalOverflow(page);
    const footer = root.locator("[data-editor-actionbar]");
    for (const label of ["Stiahnuť z kalendára", "Uložiť zmeny"]) {
      const button = footer.getByRole("button", { name: label, exact: true });
      await expect(button).toBeInViewport({ ratio: 0.5 });
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(30);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? Infinity) + (box?.width ?? Infinity)).toBeLessThanOrEqual(width + 1);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await showEventSection(root, "event-seo", "SEO");
    await root.getByLabel("SEO title").fill("Mobilné SEO");
    const lastSeo = root.getByLabel("Open Graph description");
    await lastSeo.fill("Dostupné posledné pole");
    await lastSeo.scrollIntoViewIfNeeded();
    await expect(lastSeo).toBeInViewport();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport({ ratio: 0.1 });
  });
}
