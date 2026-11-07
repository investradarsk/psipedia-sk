import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function projectSuffix(name: string) {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

async function waitForEditor(page: import("@playwright/test").Page, selector = "#article-intro") {
  // Tiptap mounts in the hidden content section; only the hydrated editor is ready.
  await expect(page.locator(`${selector}[data-editor-ready="true"]`)).toHaveCount(1);
  await showArticleSection(page, "article-basics");
}

const articleSectionLabels: Record<string, string> = {
  "article-basics": "Úvod a obsah",
  "article-content": "Úvod a obsah",
  "article-blocks": "Bloky článku",
  "article-media": "Fotografie",
  "article-settings": "Nastavenia",
  "article-relations": "Prepojené plemená",
  "article-authors": "Autor",
  "article-publish": "Publikovanie",
  "article-seo": "SEO",
};

async function showArticleSection(page: import("@playwright/test").Page, id: string) {
  const section = page.locator("#" + id);
  if (await section.isVisible()) {
    await section.scrollIntoViewIfNeeded();
    return;
  }
  const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
  const picker = nav.getByLabel("Sekcia editora");
  if (await picker.isVisible()) await picker.selectOption(id === "article-content" ? "article-basics" : id);
  else await nav.getByRole("button", { name: articleSectionLabels[id], exact: true }).click();
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
}

async function fillMinimumArticle(page: import("@playwright/test").Page, title: string) {
  await waitForEditor(page);
  await page.locator("#article-title").fill(title);
  await page.getByLabel("Krátky úvod na karte").fill("Izolovaný E2E perex s dostatočnou dĺžkou pre validačný contract.");
  await showArticleSection(page, "article-content");
  const intro = page.locator("#article-intro");
  await intro.fill("Toto je bezpečný úvod článku s dostatočnou dĺžkou pre redakčný editor.");
  await showArticleSection(page, "article-blocks");
  const blockEditor = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
  await blockEditor.fill("Toto je obsahový blok upravovaný priamo na hlavnej stránke editora.");
}

test.describe("ARTICLE-ADMIN Word-like editorial editor", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
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

  test("creates and edits canonical rich text, author profiles and external video inline", async ({ page }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const title = `ARTICLE ADMIN WYSIWYG ${suffix}`;
    const authorName = `ARTICLE ADMIN Autor ${suffix}`;

    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, title);

    await showArticleSection(page, "article-content");
    const intro = page.locator("#article-intro");
    await intro.selectText();
    await page.keyboard.press("Control+b");
    await expect(intro.locator("b, strong")).toHaveCount(1);

    await showArticleSection(page, "article-media");
    await page.getByLabel("ALT text").fill(`ALT ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("Popis fotografie / Caption").fill(`Caption ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("Zdroj / autor fotografie").fill(`Credit ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("URL zdroja fotografie").fill("https://example.com/photo-source");

    await expect(page.getByRole("navigation", { name: "Sekcie pracovného editora" })).toBeVisible();
    await showArticleSection(page, "article-authors");
    await expect(page.getByLabel("Autor", { exact: true })).toContainText("Redakcia Psipedia");

    await page.getByRole("button", { name: "+ Nový autor" }).click();
    const authorDrawer = page.getByRole("dialog", { name: "Nový autor" });
    await expect(authorDrawer).toBeVisible();
    await authorDrawer.getByLabel("Zobrazované meno").fill(authorName);
    await authorDrawer.getByLabel("Typ").selectOption("individual");
    await authorDrawer.getByLabel("Rola").fill("E2E autor");
    await authorDrawer.getByLabel("Krátke bio").fill("Izolovaný profil používaný iba v CI.");
    await authorDrawer.getByRole("button", { name: "Uložiť autora" }).click();
    await expect(authorDrawer).toBeHidden();
    await page.getByLabel("Autor", { exact: true }).selectOption({ label: authorName });
    await showArticleSection(page, "article-blocks");

    const addArea = page.locator(".admin-block-add");
    await addArea.getByRole("button", { name: "+ Pridať blok na koniec" }).click();
    await addArea.getByRole("button", { name: "Video / embed" }).click();
    const videoEditor = page.locator(".admin-video-editor");
    await videoEditor.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(videoEditor.locator("iframe")).toBeVisible();

    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await showArticleSection(page, "article-content");
    await expect(page.locator("#article-intro").locator("strong")).toContainText("Toto je bezpečný úvod");
    await showArticleSection(page, "article-media");
    await expect(page.getByLabel("ALT text")).toHaveValue(`ALT ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("Popis fotografie / Caption")).toHaveValue(`Caption ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("Zdroj / autor fotografie")).toHaveValue(`Credit ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("URL zdroja fotografie")).toHaveValue("https://example.com/photo-source");

    await showArticleSection(page, "article-authors");
    await page.getByLabel("Autor", { exact: true }).selectOption({ label: authorName });
    await page.getByRole("button", { name: "Upraviť autora" }).click();
    const editDrawer = page.getByRole("dialog", { name: "Upraviť autora" });
    page.once("dialog", (dialog) => void dialog.accept());
    await editDrawer.getByRole("button", { name: "Deaktivovať" }).click();
    await expect(editDrawer).toBeHidden();
    await expect(page.getByLabel("Meno autora pre legacy článok")).toHaveValue(authorName);

    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();
  });

  test("supports format-first editing, live toolbar state, block formatting and list lifecycle", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-content");

    const intro = page.locator("#article-intro");
    const introEditor = page.locator("[data-admin-tiptap-toolbar]");
    const bold = introEditor.getByRole("button", { name: /Tučné/ });
    const italic = introEditor.getByRole("button", { name: /Kurzíva/ });

    await intro.focus();
    await bold.click();
    await expect(intro).toBeFocused();
    await page.keyboard.type("Tučný začiatok");
    await expect(intro.locator("strong, b")).toContainText("Tučný začiatok");
    // The shared Tiptap toolbar derives selection state from the actual editor transaction.
    // Validate it after inserting text: an empty cursor can have a pending mark.
    await expect(bold).toHaveAttribute("aria-pressed", "true");

    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.type(" normálny text");

    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type(" kurzíva");
    await expect(intro.locator("em, i")).toContainText("kurzíva");
    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "false");

    const h2 = introEditor.getByRole("button", { name: "Nadpis 2" });
    await h2.click();
    await expect(intro.locator("h2")).toHaveCount(1);
    await expect(h2).toHaveAttribute("aria-pressed", "true");

    const h3 = introEditor.getByRole("button", { name: "Nadpis 3" });
    await h3.click();
    await expect(intro.locator("h3")).toHaveCount(1);
    await expect(h3).toHaveAttribute("aria-pressed", "true");

    const quote = introEditor.getByRole("button", { name: "Citácia" });
    await quote.click();
    await expect(intro.locator("blockquote")).toHaveCount(1);
    await expect(quote).toHaveAttribute("aria-pressed", "true");

    const callout = introEditor.getByRole("button", { name: "Zvýraznený tip" });
    await callout.click();
    await expect(intro.locator('[data-psipedia-callout="tip"]')).toHaveCount(1);
    await expect(callout).toHaveAttribute("aria-pressed", "true");

    await introEditor.getByRole("button", { name: "Odsek" }).click();
    await expect(intro.locator("p")).toHaveCount(1);
    await expect(intro.locator("[data-psipedia-callout]")).toHaveCount(0);

    await intro.selectText();
    await introEditor.getByRole("button", { name: "Vložiť alebo upraviť odkaz" }).click();
    await introEditor.getByLabel("Odkaz", { exact: true }).fill("https://example.com/editor-link");
    await introEditor.getByRole("button", { name: "Použiť" }).click();
    await expect(intro.locator('a[href="https://example.com/editor-link"]')).toHaveCount(1);

    const takeaway = page.locator("#article-takeaway");
    const takeawayEditor = page.locator("[data-admin-tiptap-toolbar]");
    const bullet = takeawayEditor.getByRole("button", { name: "Odrážkový zoznam" });
    await takeaway.focus();
    await bullet.click();
    await expect(bullet).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("Prvý bod");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Druhý bod");
    await expect(takeaway.locator("ul > li")).toHaveCount(2);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(bullet).toHaveAttribute("aria-pressed", "false");

    const ordered = takeawayEditor.getByRole("button", { name: "Číslovaný zoznam" });
    await ordered.click();
    await expect(ordered).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("Prvý krok");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Druhý krok");
    await expect(takeaway.locator("ol > li")).toHaveCount(2);

    await showArticleSection(page, "article-blocks");
    const bodyEditor = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
    const bodyWrapper = page.locator("[data-admin-tiptap-toolbar]");
    await bodyEditor.focus();
    await page.keyboard.type("Prvý odsek");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Druhý odsek");
    await page.keyboard.press("Control+a");
    await bodyWrapper.getByRole("button", { name: "Odrážkový zoznam" }).click();
    await expect(bodyEditor.locator("ul > li")).toHaveCount(2);
  });

  test("rejects malicious paste/link and unsupported video while keeping optional fields optional", async ({ page }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `ARTICLE ADMIN Security ${suffix}`);
    await showArticleSection(page, "article-content");

    const intro = page.locator("#article-intro");
    await intro.focus();
    await intro.evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      const data = new DataTransfer();
      data.setData("text/plain", " Bezpečný vložený text <script>alert(1)</script>");
      data.setData("text/html", '<iframe src="https://evil.example"></iframe><script>alert(1)</script>');
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(intro.locator("script, iframe")).toHaveCount(0);
    await expect(intro).toContainText("<script>alert(1)</script>");

    await intro.selectText();
    const richWrapper = page.locator("[data-admin-tiptap-toolbar]");
    await richWrapper.getByRole("button", { name: "Vložiť alebo upraviť odkaz" }).click();
    await richWrapper.getByLabel("Odkaz", { exact: true }).fill("javascript:alert(1)");
    await richWrapper.getByRole("button", { name: "Použiť" }).click();
    await expect(richWrapper.getByRole("alert")).toContainText("Povolené sú odkazy");

    await showArticleSection(page, "article-media");
    await page.getByLabel("URL zdroja fotografie").fill("ftp://example.com/photo");
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("URL zdroja fotografie musí byť platná webová adresa.")).toBeVisible();
    await page.getByLabel("URL zdroja fotografie").fill("");
    await showArticleSection(page, "article-blocks");

    const addArea = page.locator(".admin-block-add");
    await addArea.getByRole("button", { name: "+ Pridať blok na koniec" }).click();
    await addArea.getByRole("button", { name: "Video / embed" }).click();
    const videoEditor = page.locator(".admin-video-editor");
    await videoEditor.locator('input[type="url"]').fill("https://evil.example/video");
    await expect(videoEditor.getByRole("alert")).toContainText("YouTube alebo Vimeo");

    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Video musí byť bezpečný HTTPS odkaz na YouTube alebo Vimeo.")).toBeVisible();

    await videoEditor.locator('input[type="url"]').fill("https://vimeo.com/123456789");
    await expect(videoEditor.locator("iframe")).toBeVisible();
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
  });

  test("preserves legacy article editing and publishes Novinky without a source", async ({ page }, testInfo) => {
    const legacyId = testInfo.project.name.includes("mobile") ? 972002 : 972001;
    await page.goto(`/admin/clanky/${legacyId}`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-authors");
    await expect(page.getByLabel("Meno autora pre legacy článok")).toHaveValue("Legacy autor");
    await showArticleSection(page, "article-content");
    await expect(page.locator("#article-intro")).toContainText("Legacy úvod článku");
    await page.locator("#article-intro").fill("Legacy článok je teraz upravený cez canonical WYSIWYG bez straty spätnej kompatibility.");
    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();
    await expect(page.getByText("Uložené", { exact: true })).toBeVisible();

    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=novinky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `ARTICLE ADMIN Novinky optional source ${suffix}`);
    await expect(page.getByText("Odborné zdroje sú nepovinné vo všetkých článkoch vrátane zdravotných.")).toBeVisible();
    await showArticleSection(page, "article-publish");
    await page.getByRole("button", { name: /Publikovať novinku/ }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await expect(page.getByRole("button", { name: "Stiahnuť z webu" })).toBeVisible();
  });

  test("server-side publish gate blocks editorial placeholders, focuses content and allows draft recovery", async ({ page }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `CONTENT QA publish gate ${suffix}`);

    const bodyEditor = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
    await bodyEditor.fill("Po publikovaní bude vhodné prepojiť aj článok Ako spoznať bolesť u psa.");
    await showArticleSection(page, "article-publish");
    await page.getByRole("button", { name: "Publikovať článok" }).click();
    await expect(page.getByRole("heading", { name: "Chýbajú povinné údaje" })).toBeVisible();
    await expect(page.getByText(/internú redakčnú poznámku alebo placeholder/).first()).toBeVisible();
    await expect(page.getByText("Článok zatiaľ nemožno publikovať. Oprav blokujúce položky.")).toBeVisible();
    await expect(page.locator("#article-blocks")).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/novy\?sekcia=clanky/);

    await page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await waitForEditor(page);
    await showArticleSection(page, "article-blocks");

    const persistedBody = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
    await expect(persistedBody).toBeVisible();
    await persistedBody.fill("Finálny verejný obsah po odstránení internej redakčnej poznámky.");
    await showArticleSection(page, "article-publish");
    await page.getByRole("button", { name: "Publikovať článok" }).click();
    await expect(page.getByRole("button", { name: "Stiahnuť z webu" })).toBeVisible();

    await page.getByRole("button", { name: "Stiahnuť z webu" }).click();
    const unpublish = page.getByRole("dialog", { name: "Stiahnuť článok z webu?" });
    await expect(unpublish).toBeVisible();
    await unpublish.getByRole("button", { name: "Ponechať publikované" }).click();
    await expect(unpublish).toBeHidden();
    await expect(page.getByRole("button", { name: "Stiahnuť z webu" })).toBeVisible();

    await page.getByRole("button", { name: "Stiahnuť z webu" }).click();
    await unpublish.getByRole("button", { name: "Potvrdiť stiahnutie" }).click();
    await expect(unpublish).toBeHidden();
    await expect(page.locator("[data-editor-actionbar]").getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  });

  test("ARTICLE-TIPTAP-4: fullscreen preview shows unsaved styled content in desktop and mobile modes", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.locator("#article-title").fill("Neuložený vizuálny náhľad");
    await page.locator("#article-intro").fill("Tento text je zatiaľ len v editore.");
    await page.getByRole("button", { name: "Náhľad na celú obrazovku · počítač/mobil" }).click();
    const preview = page.getByRole("dialog", { name: "Celoobrazovkový náhľad článku" });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading", { name: "Neuložený vizuálny náhľad" })).toBeVisible();
    await expect(preview).toContainText("Tento text je zatiaľ len v editore.");
    await expect(preview.locator('[data-preview-device="desktop"]')).toBeVisible();
    await preview.getByRole("button", { name: "Mobil" }).click();
    await expect(preview.locator('[data-preview-device="mobile"]')).toBeVisible();
    await preview.getByRole("button", { name: "Späť do editora" }).click();
    await expect(preview).toBeHidden();
    await expect(page.locator("#article-title")).toHaveValue("Neuložený vizuálny náhľad");
    await expect(page.locator("#article-intro")).toContainText("Tento text je zatiaľ len v editore.");
    await expect(page.getByText("Neuložené zmeny").first()).toBeVisible();
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

  test("ARTICLE-TIPTAP-5: one sticky toolbar targets only visible text and keeps full-color controls gated", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const toolbar = page.locator("[data-admin-tiptap-toolbar]");
    await expect(toolbar).toHaveCount(1);
    const bold = toolbar.getByRole("button", { name: /Tučné/ });
    await expect(bold).toBeDisabled();
    const textColor = toolbar.getByLabel("Celá paleta farieb textu", { exact: true });
    const highlight = toolbar.getByLabel("Celá paleta zvýraznenia", { exact: true });
    await expect(textColor).toBeDisabled();
    await expect(highlight).toBeDisabled();

    const intro = page.locator("#article-intro");
    await intro.focus();
    await expect(bold).toBeEnabled();
    await expect(textColor).toBeEnabled();
    await expect(highlight).toBeEnabled();
    await intro.fill("Farebne formátovaný úvod.");
    await intro.selectText();
    await textColor.fill("#2468ac");
    await highlight.fill("#fae123");
    await expect(intro.locator('span[style*="color"]')).toContainText("Farebne formátovaný");
    await expect(intro.locator('mark')).toContainText("Farebne formátovaný");
    await showArticleSection(page, "article-blocks");
    await expect(bold).toBeDisabled();

    const addArea = page.locator(".admin-block-add");
    await addArea.getByRole("button", { name: "+ Pridať blok na koniec" }).click();
    await addArea.getByRole("button", { name: "Text", exact: true }).click();
    const block = page.locator("[data-admin-tiptap-rich-text]").last().locator('[contenteditable="true"]');
    await block.fill("Mobilný blok má vlastný obsah.");
    await expect(bold).toBeEnabled();
    await showArticleSection(page, "article-basics");
    await expect(bold).toBeDisabled();
    await expect(intro).toBeVisible();
    await expect(intro.locator("mark")).toContainText("Farebne formátovaný");
    await expect(page.locator("[data-admin-tiptap-toolbar]")).toHaveCount(1);
  });

  test("toolbar is keyboard reachable, axe-clean and does not overflow at 390px-class mobile width", async ({ page }, testInfo) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await showArticleSection(page, "article-content");
    const intro = page.locator("#article-intro");
    await intro.focus();
    await expect(intro).toBeFocused();
    await intro.fill("Dlhší testovací text pre klávesové skratky, focus a responzívny editor.");
    await intro.selectText();
    await page.keyboard.press("Control+i");
    await expect(intro.locator("i, em")).toHaveCount(1);

    const editor = page.locator("[data-editor-page]");
    const axe = await new AxeBuilder({ page })
      .include("[data-editor-page]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);

    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    if (overflow > 1) {
      const details = await page.evaluate(function overflowDetails() {
  const viewport = document.documentElement.clientWidth;
  return {
    viewport,
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    suspects: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        return {
          element: element.tagName.toLowerCase(),
          id: element.id,
          className: String(element.className).slice(0, 110),
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          overflowX: computed.overflowX,
          position: computed.position,
          parent: element.parentElement?.tagName.toLowerCase(),
        };
      })
      .filter((item) => item.right > viewport + 2 && item.width > 0)
      .sort((a, b) => b.right - a.right)
      .slice(0, 16),
  };
});
      console.info("[ARTICLE_EDITOR_OVERFLOW]", JSON.stringify(details));
    }
    expect(overflow).toBeLessThanOrEqual(1);

    if (testInfo.project.name.includes("mobile")) {
      const box = await editor.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.width ?? 9999)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 390) + 1);
    }
  });

  test("ARTICLE-TIPTAP-2: one selected section, ordered nav, unsaved text survives switching", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await expect(page.locator('#article-intro[data-editor-ready="true"]')).toHaveCount(1);
    const editor = page.locator('[data-editor-layout="article"][data-editor-section-mode="switch"]');
    const sections = editor.locator("#article-canonical-editor-form > [data-admin-editor-section]");
    await expect(sections).toHaveCount(9);
    await expect(page.locator("#article-publish")).toBeVisible();
    await expect(page.locator("#article-basics")).toBeHidden();
    await expect.poll(() => sections.evaluateAll(elements =>
      elements.filter(el => getComputedStyle(el).display !== "none").length,
    )).toBe(1);
    const nav = editor.getByRole("navigation", { name: "Sekcie pracovného editora" });
    const ids = ["article-publish","article-authors","article-settings","article-seo",
      "article-relations","article-media","article-basics","article-blocks"];
    if ((page.viewportSize()?.width ?? 0) > 820) {
      await expect(nav.getByRole("button")).toHaveCount(8); // section controls; Preview is outside nav
      const labels = ["Publikovanie","Autor","Nastavenia","SEO","Prepojené plemená",
        "Fotografie","Úvod a obsah","Bloky článku"];
      for (let i=0; i<labels.length; i++) {
        await expect(nav.getByRole("button", {name:labels[i],exact:true})).toHaveAttribute("aria-controls", ids[i]);
      }
    } else {
      const options = await nav.getByLabel("Sekcia editora").locator("option").evaluateAll(
        elements => elements.map(el => (el as HTMLOptionElement).value)
      );
      expect(options).toEqual(ids);
    }
    await showArticleSection(page, "article-basics");
    await expect(page.locator("#article-content")).toBeVisible();
    await expect.poll(() => sections.evaluateAll(elements =>
      elements.filter(el => getComputedStyle(el).display !== "none").length,
    )).toBe(2);
    await page.locator("#article-title").fill("Rozpracovaný článok zostáva zachovaný");
    await page.locator("#article-intro").fill("Text prvého bloku musí zostať aj po zmene sekcie.");
    await showArticleSection(page, "article-media");
    await expect(page.locator("#article-basics")).toBeHidden();
    await expect(page.locator("#article-intro")).toBeHidden();
    await showArticleSection(page, "article-basics");
    await expect(page.locator("#article-title")).toHaveValue("Rozpracovaný článok zostáva zachovaný");
    await expect(page.locator("#article-intro")).toContainText("Text prvého bloku musí zostať");
    await expect(page.getByText("Neuložené zmeny").first()).toBeVisible();
  });

  test("ARTICLE-VISUAL-2 joins the introduction card and displays removable breed chips", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await expect(page.locator("#article-basics").getByRole("heading", { name: "Úvod a obsah" })).toBeVisible();
    await expect(page.locator("#article-content")).toHaveCSS("border-top-width", "0px");
    await showArticleSection(page, "article-relations");
    const search = page.locator("#article-breed-search");
    await search.focus();
    const first = page.locator('#article-relations label[class*="breedRow"]').first();
    if (await first.count()) {
      const name = await first.locator("span").innerText();
      await first.locator('input[type="checkbox"]').check();
      await expect(page.getByRole("group", { name: "Vybrané plemená" })).toContainText(name);
      await page.getByRole("button", { name: `Odstrániť prepojenie: ${name}` }).click();
      await expect(page.getByRole("group", { name: "Vybrané plemená" })).toHaveCount(0);
    }
    await showArticleSection(page, "article-basics");
    await expect(page.locator("#article-intro")).toBeVisible();
    await expect(page.locator("#article-takeaway")).toBeVisible();
    await expect(page.locator('[data-admin-tiptap-toolbar]')).toBeVisible();
  });

  test("ARTICLE-VISUAL-3: right rail schedule shares article state and shows SEO and full preview", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    const rail = page.locator("[data-article-editor-rail]");
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("region", { name: "Stav článku" })).toBeVisible();
    const sidebarDate = rail.locator("#article-rail-published-at");
    await sidebarDate.fill("2026-12-10T18:00");
    await showArticleSection(page, "article-publish");
    await expect(page.locator("#article-published-at")).toHaveValue("2026-12-10T18:00");
    await expect(page.getByText("Neuložené zmeny").first()).toBeVisible();
    const seo = rail.locator("[data-article-rail-seo]");
    await seo.locator("summary").click();
    await expect(seo.getByText("Meta popis")).toBeVisible();
    await seo.getByRole("button", { name: "Upraviť všetky SEO polia" }).click();
    await expect(page.locator("#article-seo")).toBeVisible();
    const compact = rail.locator("[data-article-compact-preview]");
    await expect(compact).toBeVisible();
    await rail.getByRole("button", { name: "Zobraziť celý náhľad" }).click();
    await expect(rail.locator(".admin-preview-paper")).toBeVisible();
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
      await nav.getByRole("button", { name: "Náhľad" }).click();
      const rail = page.locator("[data-article-editor-rail]");
      await expect(rail).toBeVisible();
      await expect(rail.locator("#article-rail-published-at")).toBeVisible();
      await expect(rail.locator("[data-article-compact-preview]")).toBeVisible();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBeLessThanOrEqual(1);
      await nav.getByRole("button", { name: "Späť na úpravy" }).click();
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
        expect(positions[i].top - positions[i - 1].top, "Filters cannot reserve vertical desktop flex-basis").toBeLessThan(110);
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

});
