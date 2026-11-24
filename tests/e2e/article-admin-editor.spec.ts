import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function projectSuffix(name: string) {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

async function waitForEditor(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-article-continuous-document="editable"]')).toHaveCount(1);
  await expect(page.locator('[data-article-legacy-toggle]')).toHaveCount(0);
  await showArticleSection(page, "article-blocks");
}

const articleSectionLabels: Record<string, string> = {
  "article-blocks": "Editor článku", "article-media": "Fotografie",
  "article-settings": "Nastavenia", "article-relations": "Prepojené plemená",
  "article-authors": "Autor", "article-publish": "Publikovanie", "article-seo": "SEO",
};

async function showArticleSection(page: import("@playwright/test").Page, id: string) {
  const selected = id === "article-content" || id === "article-basics" ? "article-blocks" : id;
  const section = page.locator("#" + selected);
  if (await section.isVisible()) {
    await section.scrollIntoViewIfNeeded();
    return;
  }
  const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
  const picker = nav.getByLabel("Sekcia editora");
  if (await picker.isVisible()) await picker.selectOption(selected);
  else await nav.getByRole("button", { name: articleSectionLabels[selected], exact: true }).click();
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
}

async function replaceParagraph(page: import("@playwright/test").Page, which: "first" | "last", value: string) {
  const paragraphs = page.locator('[data-article-continuous-document="editable"] > p');
  await (which === "first" ? paragraphs.first() : paragraphs.last()).selectText();
  await page.keyboard.insertText(value);
}

/** Publication controls are in the sticky action bar on desktop but inside
 * the Publishing section on mobile. Selecting the visible control by layout
 * avoids accidentally targeting the hidden duplicate from the other mode. */
function publicationAction(page: import("@playwright/test").Page, name: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) <= 820;
  const scope = mobile ? page.locator("#article-publish") : page.locator("[data-editor-actionbar]");
  return scope.getByRole("button", { name, exact: true });
}

async function mockArticleLifecycle(page: import("@playwright/test").Page) {
  let unpublished = false;
  // Sandbox E2E articles have no production Notion mapping or lifecycle migration.
  // Exercise the real shared dialog and POST contract without performing any delete.
  await page.route("**/api/admin/record-lifecycle/articles/*", async (route) => {
    if (route.request().method() === "GET") {
      const id = Number(new URL(route.request().url()).pathname.split("/").pop());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id, name: "Testovací článok", slug: "e2e-clanok", category: "articles",
        status: unpublished ? "draft" : "published", published: !unpublished, notionLinked: false,
        notionPages: 0, removalState: null, removalError: null,
      }) });
    }
    const request = route.request().postDataJSON() as { action: string };
    expect(request.action).toBe("unpublish");
    unpublished = true;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ notionSync: "SYNCED", updatedAt: "2026-11-11T08:00:00Z" }) });
  });
}

async function fillMinimumArticle(page: import("@playwright/test").Page, title: string) {
  await waitForEditor(page);
  await page.locator("#article-title").fill(title);
  await page.getByLabel("Krátky úvod na karte").fill("Izolovaný E2E perex s dostatočnou dĺžkou pre validačný contract.");
  await replaceParagraph(page, "first", "Toto je bezpečný úvod článku s dostatočnou dĺžkou pre redakčný editor.");
  await replaceParagraph(page, "last", "Toto je obsahový blok upravovaný priamo na hlavnej stránke editora.");
}

test.describe("ARTICLE-ADMIN Word-like editorial editor", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  });

  test("CONTINUOUS-STEP6: new article uses one editor and persists content through canonical save", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
    await expect(nav.getByLabel("Sekcia editora")).toBeVisible();
    const labels = await nav.getByLabel("Sekcia editora").locator("option").allTextContents();
    expect(labels.some(label => label.includes("Editor článku"))).toBe(true);
    expect(labels.some(label => label.includes("Bloky článku"))).toBe(false);
    await nav.getByLabel("Sekcia editora").selectOption("article-blocks");
    await expect(page.locator("#article-title")).toBeVisible();
    await expect(page.locator("#article-excerpt")).toHaveCount(1);
    await expect(page.locator('[data-article-continuous-document="editable"]')).toHaveCount(1);
    await expect(page.locator('[data-article-legacy-toggle]')).toHaveCount(0);

    // Exercise actual Admin save, not only the in-memory Tiptap converter.
    await page.locator("#article-title").fill("CONTINUOUS SAVE " + projectSuffix(testInfo.project.name));
    await page.getByLabel("Krátky úvod na karte").fill("Automatický test jediného redakčného editora a bezpečného uloženia konceptu.");
    const editor = page.locator('[data-article-continuous-document="editable"]');
    const paragraphs = editor.locator(":scope > p");
    await expect(paragraphs).toHaveCount(2);
    await paragraphs.first().click();
    await page.keyboard.type("Úvod súvislého článku s dostatočne jasným kontextom.");
    await paragraphs.last().click();
    await page.keyboard.type("Telo súvislého článku s vlastným textovým blokom.");
    await expect(editor).toContainText("Úvod súvislého článku");
    await expect(editor).toContainText("Telo súvislého článku");
    await expect(page.locator('[data-article-tiptap-invalid="true"]')).toHaveCount(0);

    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await expect(editor).toContainText("Telo súvislého článku");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-article-continuous-document="editable"]')).toContainText("Úvod súvislého článku");
    await expect(page.locator('[data-article-continuous-document="editable"]')).toContainText("Telo súvislého článku");
  });

  test("CONTINUOUS-STEP6: insert a widget from the sticky formatting toolbar on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });

    const document = page.locator('[data-article-continuous-document="editable"]');
    const toolbar = page.locator("[data-admin-tiptap-toolbar]");
    const insert = toolbar.locator("[data-article-insert-trigger]");
    await expect(document).toHaveCount(1);
    await expect(toolbar).toHaveCSS("position", "sticky");
    await expect(insert).toBeVisible();
    await expect(page.locator("[data-article-continuous-editable] .insertBar")).toHaveCount(0);

    // The insertion menu belongs to the sticky toolbar, not the scrolling document.
    await insert.click();
    await expect(insert).toHaveAttribute("aria-expanded", "true");
    const picker = toolbar.locator("[data-article-insert-picker]");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Obrázok", exact: true }).click();
    await expect(document.locator('[data-article-continuous-widget="image"]')).toHaveCount(1);
    await expect(picker).toHaveCount(0);
    await expect(page.locator('[data-article-tiptap-invalid="true"]')).toHaveCount(0);
  });

  test("mobile article editor has one save action, compact navigation and searchable breeds", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
    await expect(nav.getByLabel("Sekcia editora")).toBeVisible();
    expect(await nav.evaluate((element) => element.getBoundingClientRect().height),
      "Mobile article section bar should stay compact").toBeLessThan(80);

    const footer = page.locator("[data-editor-actionbar]");
    await expect(footer.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
    await expect(footer.getByRole("button")).toHaveCount(1);
    expect(await footer.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(100);

    await showArticleSection(page, "article-relations");
    const breeds = page.locator("#article-relations");
    const search = breeds.getByRole("searchbox", { name: "Hľadať plemeno" });
    await expect(search).toBeVisible();
    // Compact options are opened on focus instead of rendering the full list.
    await expect(breeds.locator('label[class*="breedRow"]')).toHaveCount(0);
    await search.focus();
    const rows = breeds.locator('label[class*="breedRow"]');
    expect(await rows.count()).toBeLessThanOrEqual(12);
    if (await rows.count()) {
      const name = await rows.first().locator("span").innerText();
      await rows.first().locator('input[type="checkbox"]').check();
      await expect(breeds.getByText("1 vybraných", { exact: false })).toBeVisible();
      await search.fill(name);
      await expect(rows.first()).toContainText(name);
      await expect(rows.first().locator('input[type="checkbox"]')).toBeChecked();
    }
    await search.fill("___nonexistent_breed___");
    await expect(breeds.getByText("Žiadne plemená nezodpovedajú vyhľadávaniu.")).toBeVisible();
    await search.fill("");

    await page.locator("[data-editor-navigation]").getByRole("button", { name: "Náhľad" }).click();
    await expect(page.getByRole("button", { name: "Skryť náhľad" })).toBeVisible();
    await page.getByRole("button", { name: "Skryť náhľad" }).click();
    await showArticleSection(page, "article-basics");
    await expect(page.locator("#article-title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ukázať náhľad článku" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test("mobile page editor scrolls to deep publishing fields without a clipped inner pane", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-publish");

    const layout = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>("[data-editor-page]");
      const workspace = editor?.querySelector<HTMLElement>("[data-editor-workspace]");
      const columns = editor?.querySelector<HTMLElement>("[data-editor-columns]");
      const content = editor?.querySelector<HTMLElement>("[data-editor-content]");
      if (!editor || !workspace || !columns || !content) throw new Error("Editor workspace missing");
      return {
        documentHeight: document.scrollingElement?.scrollHeight ?? 0,
        viewportHeight: innerHeight,
        pageOverflow: getComputedStyle(editor).overflowY,
        workspaceMaxHeight: getComputedStyle(workspace).maxHeight,
        columnsOverflow: getComputedStyle(columns).overflowY,
        contentOverflow: getComputedStyle(content).overflowY,
      };
    });
    expect(layout.documentHeight).toBeGreaterThan(layout.viewportHeight);
    expect(layout.pageOverflow).toBe("visible");
    expect(layout.workspaceMaxHeight).toBe("none");
    expect(layout.columnsOverflow).toBe("visible");
    expect(layout.contentOverflow).toBe("visible");

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("[data-article-facebook-disclosure] summary").click();
    const facebookDate = page.locator("#article-facebook-at");
    await facebookDate.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    // The site sets scroll-behavior: smooth on html. A positive scrollY
    // only means animation has started, not that the target is visible yet.
    // Wait for the deep field to settle above the fixed mobile save bar.
    await expect.poll(async () => {
      const bounds = await facebookDate.boundingBox();
      return bounds ? bounds.y + bounds.height : Infinity;
    }, { message: "Facebook publication date becomes reachable above the save bar" }).toBeLessThan(760);
    const fieldBounds = await facebookDate.boundingBox();
    expect(fieldBounds).not.toBeNull();
    expect(fieldBounds!.y).toBeGreaterThan(100);
    await expect(page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  });

  test("article publishing fields fit inside mobile cards at 320, 390 and 430px", async ({ page }) => {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
      await waitForEditor(page);
      await page.getByLabel("Sekcia editora").selectOption("article-publish");
      const section = page.locator("#article-publish");
      await expect(section).toBeVisible();
      await expect(section.locator("[data-article-facebook-disclosure]")).toHaveCount(1);
      await section.locator("[data-article-facebook-disclosure] summary").click();
      await expect(section.locator('[data-article-current-status]')).toBeHidden();
      for (const id of ["article-published-at", "article-updated-at", "article-facebook-at"]) {
        const input = section.locator("#" + id);
        await expect(input).toBeVisible();
        const rects = await input.evaluate((element) => {
          const input = element.getBoundingClientRect();
          const card = element.closest<HTMLElement>("[data-admin-editor-section]")!.getBoundingClientRect();
          const field = element.closest<HTMLElement>(".admin-field")!.getBoundingClientRect();
          return { inputLeft: input.left, inputRight: input.right, cardLeft: card.left,
            cardRight: card.right, fieldRight: field.right, viewportWidth: innerWidth };
        });
        expect(rects.inputLeft, id + ": left edge inside card").toBeGreaterThanOrEqual(rects.cardLeft - 1);
        expect(rects.inputRight, id + ": right edge inside card").toBeLessThanOrEqual(rects.cardRight + 1);
        expect(rects.inputRight, id + ": right edge inside field").toBeLessThanOrEqual(rects.fieldRight + 1);
        expect(rects.inputRight, id + ": no viewport overflow").toBeLessThanOrEqual(rects.viewportWidth + 1);
      }
      const calendar = section.getByRole("button", { name: "Zobraziť redakčný kalendár a obsadené termíny" });
      const cal = await calendar.boundingBox();
      const card = await section.boundingBox();
      expect(cal && card && cal.x + cal.width <= card.x + card.width + 1).toBeTruthy();
      const footer = page.locator("[data-editor-actionbar]");
      await expect(footer.getByRole("button")).toHaveCount(1);
      expect(await footer.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(100);
    }
  });

  test("ARTICLE-TIPTAP-4: fullscreen preview shows unsaved styled content in desktop and mobile modes", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.locator("#article-title").fill("Neuložený vizuálny náhľad");
    await replaceParagraph(page, "first", "Tento text je zatiaľ len v editore.");
    const mobileView = (page.viewportSize()?.width ?? 1440) <= 820;
    if (mobileView) {
      await page.locator("[data-editor-navigation]")
        .getByRole("button", { name: "Náhľad", exact: true }).click();
    }
    await page.locator("[data-article-editor-rail]")
      .getByRole("button", { name: "Náhľad na celú obrazovku · počítač/mobil" }).click();
    const preview = page.getByRole("dialog", { name: "Celoobrazovkový náhľad článku" });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading", { name: "Neuložený vizuálny náhľad" })).toBeVisible();
    await expect(preview).toContainText("Tento text je zatiaľ len v editore.");
    await expect(preview.locator('[data-preview-device="desktop"]')).toBeVisible();
    await preview.getByRole("button", { name: "Mobil" }).click();
    await expect(preview.locator('[data-preview-device="mobile"]')).toBeVisible();
    await preview.getByRole("button", { name: "Späť do editora" }).click();
    await expect(preview).toBeHidden();
    if (mobileView) {
      await page.locator("[data-editor-navigation]")
        .getByRole("button", { name: "Späť na úpravy", exact: true }).click();
    }
    await expect(page.locator("#article-title")).toHaveValue("Neuložený vizuálny náhľad");
    await expect(page.locator('[data-article-continuous-document="editable"]')).toContainText("Tento text je zatiaľ len v editore.");
    if (!mobileView) await expect(page.getByText("Neuložené zmeny").first()).toBeVisible();
  });

  test("IMAGE-EDITOR-1 independently persists thumbnail blur and detail crop, with cancel and reset", async ({ page }, testInfo) => {
    const id = testInfo.project.name.includes("mobile") ? 972002 : 972001;
    await page.goto(`/admin/clanky/${id}`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-media");
    await page.getByRole("button", { name: "Upraviť zobrazenie" }).click();
    const modal = page.getByRole("dialog", { name: "Upraviť zobrazenie obrázka" });
    await expect(modal).toBeVisible();

    await modal.getByRole("combobox").selectOption("blur");
    await modal.getByRole("slider").press("Home");
    for (let step = 0; step < 7; step++) await modal.getByRole("slider").press("ArrowRight");

    await modal.getByRole("tab", { name: "Detail článku" }).click();
    await modal.getByRole("combobox").selectOption("crop");
    await modal.getByRole("slider").press("Home");
    for (let step = 0; step < 4; step++) await modal.getByRole("slider").press("ArrowRight");
    await modal.getByRole("tab", { name: "Náhľad" }).click();
    await expect(modal.getByRole("combobox")).toHaveValue("blur");

    // Live renderer is shared; keyboard arrow moves the focal point.
    const photo = modal.locator('[data-image-display="blur"] img').last();
    const before = await photo.evaluate((image) => (image as HTMLImageElement).style.objectPosition);
    await modal.getByLabel("Pozícia obrázka, šípky posúvajú výrez").focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).style.objectPosition)).not.toBe(before);

    await modal.getByRole("button", { name: "Uložiť zobrazenie" }).click();
    await expect(modal).toBeHidden();
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-media");
    await page.getByRole("button", { name: "Upraviť zobrazenie" }).click();
    await expect(modal.getByRole("combobox")).toHaveValue("blur");
    await expect(modal.getByRole("slider")).toHaveValue("1.35");
    await modal.getByRole("tab", { name: "Detail článku" }).click();
    await expect(modal.getByRole("combobox")).toHaveValue("crop");
    await expect(modal.getByRole("slider")).toHaveValue("1.2");

    await modal.getByRole("button", { name: "Obnoviť predvolené" }).click();
    await expect(modal.getByRole("combobox")).toHaveValue("natural");
    await modal.getByRole("button", { name: "Zrušiť" }).click();
    await page.getByRole("button", { name: "Upraviť zobrazenie" }).click();
    await modal.getByRole("tab", { name: "Detail článku" }).click();
    await expect(modal.getByRole("combobox")).toHaveValue("crop");
    await modal.getByRole("button", { name: "Zrušiť" }).click();
  });

  test("ARTICLE-VISUAL-3: right rail schedule shares article state and shows SEO and full preview", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const rail = page.locator("[data-article-editor-rail]");
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("region", { name: "Stav článku" })).toBeVisible();
    await expect(rail.locator("#article-rail-published-at")).toHaveCount(0);
    await rail.getByRole("button", { name: "Otvoriť nastavenia publikovania" }).click();
    await expect(page.locator("#article-publish")).toBeVisible();
    await page.locator("#article-published-at").fill("2026-12-10T18:00");
    await expect(rail.locator("[data-article-publication-summary]")).toContainText("2026-12-10 18:00");
    await expect(page.getByText("Neuložené zmeny").first()).toBeVisible();
    const seo = rail.locator("[data-article-rail-seo]");
    await seo.locator("summary").click();
    await expect(seo.getByText("Meta popis")).toBeVisible();
    await seo.getByRole("button", { name: "Upraviť všetky SEO polia" }).click();
    await expect(page.locator("#article-seo")).toBeVisible();
    const compact = rail.locator("[data-article-compact-preview]");
    await expect(compact).toBeVisible();
    await rail.getByRole("button", { name: "Náhľad na celú obrazovku · počítač/mobil" }).click();
    const fullscreen = page.getByRole("dialog", { name: "Celoobrazovkový náhľad článku" });
    await expect(fullscreen).toBeVisible();
    await expect(fullscreen.locator('[data-preview-device="desktop"]')).toBeVisible();
    await fullscreen.getByRole("button", { name: "Späť do editora" }).click();
    await expect(fullscreen).toBeHidden();
    await rail.getByRole("button", { name: "Skryť náhľad" }).click();
    await expect(rail.locator("[data-article-compact-preview]")).toHaveCount(0);
    await page.getByRole("button", { name: "Ukázať náhľad článku" }).click();
    await expect(rail.locator("[data-article-compact-preview]")).toBeVisible();
  });

  test("ARTICLE-VISUAL-4: mobile editor and right rail remain usable at 320 and 390px", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
      await waitForEditor(page);
      const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
      await expect(nav.getByLabel("Sekcia editora")).toBeVisible();
      await expect(page.locator("#article-title")).toBeVisible();
      await page.locator("[data-editor-navigation]").getByRole("button", { name: "Náhľad", exact: true }).click();
      const rail = page.locator("[data-article-editor-rail]");
      await expect(rail).toBeVisible();
      await expect(rail.locator("[data-article-publication-summary]")).toBeVisible();
      await expect(rail.locator("[data-article-compact-preview]")).toBeVisible();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBeLessThanOrEqual(1);
      await page.locator("[data-editor-navigation]").getByRole("button", { name: "Späť na úpravy", exact: true }).click();
      await expect(page.locator("#article-title")).toBeVisible();
      await expect(page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
    }
  });

  test("mobile dashboard filters do not stretch into giant blank gaps", async ({ page }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      const toolbar = page.locator('form.admin-toolbar[role="search"][action="/admin/clanky"]');
      await expect(toolbar.getByPlaceholder("Názov, slug, perex alebo téma")).toBeVisible();
      await expect(toolbar).toHaveCSS("display", "grid");
      const selects = toolbar.locator("label.admin-select-filter");
      expect(await selects.count()).toBe(5);
      const positions = await selects.evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { top: box.top, height: box.height, width: box.width };
      }));
      expect(positions.every(item => item.height > 43 && item.height < 100 && item.width > 0)).toBe(true);
      for (let i = 1; i < positions.length; i++) {
        // Compare the empty space below the previous field, not the distance between
        // row tops (which legitimately includes the full height of the field).
        const emptyGap = positions[i].top - (positions[i - 1].top + positions[i - 1].height);
        expect(emptyGap, "Filters cannot reserve a giant empty vertical gap").toBeLessThan(110);
      }
      const height = await toolbar.evaluate(element => element.getBoundingClientRect().height);
      expect(height, "Filter toolbar must fit without giant blank spaces").toBeLessThan(width === 390 ? 490 : 650);
      const pills = page.getByRole("navigation", { name: "Rýchly filter stavu článkov" });
      await expect(pills).toHaveCSS("display", "grid");
      await expect(pills.getByRole("link")).toHaveCount(4);
      await expect(toolbar.getByRole("button", { name: "Filtrovať" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });

  test("WORK-P2: sort and direction stay together, and article actions remain pinned", async ({ page }, info) => {
    const widths = info.project.name === "mobile-chromium" ? [390] : [1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto("/admin/clanky", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      const filters = page.locator("form[data-admin-article-filters]");
      const search = filters.locator('input[name="query"]');
      await expect(search).toBeVisible();
      const group = filters.locator("[data-admin-sort-direction]");
      const sort = group.locator('select[name="sort"]');
      const direction = group.locator('select[name="direction"]');
      await expect(sort).toBeVisible();
      await expect(direction).toBeVisible();
      // The advanced filter layout can settle after both controls first become visible.
      // Assert that the two selectors truly share a row once layout is stable.
      await expect.poll(async () => {
        const [sortBox, directionBox] = await Promise.all([sort.boundingBox(), direction.boundingBox()]);
        return sortBox && directionBox
          ? Math.abs(sortBox.y - directionBox.y)
          : Infinity;
      }, { message: "Sort and direction must remain on the same row", timeout: 10_000 }).toBeLessThan(4);
      const submit = filters.getByRole("button", { name: "Filtrovať" });
      await expect(submit).toBeVisible();
      const buttonBackground = await submit.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(buttonBackground).not.toBe("rgba(0, 0, 0, 0)");
      if (width === 1440) {
        const grid = page.locator('[data-sticky-actions="true"]');
        if (await grid.count()) {
          const actions = grid.locator('th[data-column-id="actions"]');
          await expect(actions).toHaveCSS("position", "sticky");
          const wrapper = grid.getByRole("region", { name: "Články – tabuľka" });
          const viewport = await wrapper.boundingBox();
          const pinned = await actions.boundingBox();
          expect(viewport && pinned).toBeTruthy();
          expect((pinned?.x ?? 0) + (pinned?.width ?? 0))
            .toBeLessThanOrEqual((viewport?.x ?? 0) + (viewport?.width ?? 0) + 2);
        }
      }
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  });

  test("ARTICLE ONLY: old editor, old intro fields and saved-mode switches never render", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
    if (await nav.getByLabel("Sekcia editora").isVisible()) {
      const labels = await nav.getByLabel("Sekcia editora").locator("option").allTextContents();
      expect(labels.filter(label => label.includes("Editor článku"))).toHaveLength(1);
      expect(labels.join(" ")).not.toContain("Bloky článku");
    } else {
      await expect(nav.getByRole("button", { name: "Editor článku", exact: true })).toHaveCount(1);
      await expect(nav.getByRole("button", { name: "Úvod a obsah" })).toHaveCount(0);
    }
    await expect(page.locator("#article-title")).toBeVisible();
    await expect(page.locator("#article-excerpt")).toHaveCount(1);
    await expect(page.locator("#article-intro, #article-content")).toHaveCount(0);
    await expect(page.locator("[data-article-legacy-toggle], [data-article-continuous-toggle], [data-article-continuous-edit-toggle]")).toHaveCount(0);
  });

  test("ARTICLE ONLY: historical article is edited and saved from the continuous canvas", async ({ page }, info) => {
    const id = info.project.name.includes("mobile") ? 972002 : 972001;
    await page.goto("/admin/clanky/" + id, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const canvas = page.locator('[data-article-continuous-document="editable"]');
    await expect(canvas).toContainText("Legacy úvod článku");
    await replaceParagraph(page, "first", "Existujúci článok bezpečne upravený v novom súvislom editore.");
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await expect(canvas).toContainText("Existujúci článok bezpečne upravený");
    await expect(page.locator("[data-article-legacy-toggle]")).toHaveCount(0);
  });

  test("ARTICLE ONLY: edits survive moving between document, media and publication sections", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, "Jediný editor – zachovanie textu pri navigácii");
    await replaceParagraph(page, "last", "Obsah zostane zachovaný po prepnutí editora.");
    await showArticleSection(page, "article-media");
    await expect(page.locator("#article-basics")).toBeHidden();
    await showArticleSection(page, "article-publish");
    await showArticleSection(page, "article-blocks");
    await expect(page.locator("#article-basics")).toBeVisible();
    await expect(page.locator('[data-article-continuous-document="editable"]')).toContainText("Obsah zostane zachovaný");
    await expect(page.locator("#article-title")).toHaveValue("Jediný editor – zachovanie textu pri navigácii");
  });

  test("ARTICLE ONLY: rich text formatting and external link validation still work", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const intro = page.locator('[data-article-continuous-document="editable"] > p').first();
    const toolbar = page.locator("[data-admin-tiptap-toolbar]");
    await intro.click();
    await toolbar.getByRole("button", { name: /Tučné/ }).click();
    await page.keyboard.insertText("Tučný úvod");
    await expect(intro.locator("b, strong")).toContainText("Tučný úvod");
    await intro.selectText();
    await toolbar.getByRole("button", { name: "Vložiť alebo upraviť odkaz" }).click();
    await toolbar.getByLabel("Odkaz", { exact: true }).fill("javascript:alert(1)");
    await toolbar.getByRole("button", { name: "Použiť" }).click();
    await expect(toolbar.getByRole("alert")).toContainText("Povolené sú odkazy");
  });

  test("ARTICLE ONLY: source widgets and videos use inline controls without a classic editor", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, "Jediný editor – video widget");
    const canvas = page.locator('[data-article-continuous-document="editable"]');
    await canvas.locator(":scope > p").last().click();
    const toolbar = page.locator("[data-admin-tiptap-toolbar]");
    await toolbar.locator("[data-article-insert-trigger]").click();
    await toolbar.locator("[data-article-insert-picker]").getByRole("button", { name: "Video / embed" }).click();
    const video = canvas.locator('[data-article-continuous-widget="embed"]');
    await expect(video).toHaveCount(1);
    const edit = video.getByRole("button", { name: "Upraviť", exact: true });
    await edit.click();
    const urlInput = video.locator(".admin-video-editor input[type='url']");
    await expect(video.getByRole("button", { name: "Zavrieť úpravu", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(urlInput).toBeVisible();
    await urlInput.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(video.locator(".admin-video-editor iframe")).toBeVisible();
    await video.getByRole("button", { name: "Zavrieť úpravu", exact: true }).click();
    await expect(urlInput).toHaveCount(0);
    await edit.click();
    await expect(urlInput).toHaveValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator('[data-article-tiptap-invalid="true"]')).toHaveCount(0);
    await expect(page.locator("[data-article-legacy-toggle]")).toHaveCount(0);
  });

  test("ARTICLE ONLY: server-side publish gate identifies invalid content in new canvas", async ({ page }, info) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, "Content QA gate " + projectSuffix(info.project.name));
    await replaceParagraph(page, "last", "Po publikovaní bude vhodné prepojiť aj článok Ako spoznať bolesť u psa.");
    await showArticleSection(page, "article-publish");
    await publicationAction(page, "Publikovať článok").click();
    await expect(page.getByRole("heading", { name: "Chýbajú povinné údaje" })).toBeVisible();
    await expect(page.getByText(/internú redakčnú poznámku alebo placeholder/).first()).toBeVisible();
    await expect(page.locator("#article-blocks")).toBeFocused();
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
  });


});
