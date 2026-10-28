import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function projectSuffix(name: string) {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

async function waitForEditor(page: import("@playwright/test").Page, selector = "#article-intro") {
  await expect(page.locator(`${selector}[data-editor-ready="true"]`)).toBeVisible();
}

async function fillMinimumArticle(page: import("@playwright/test").Page, title: string) {
  await waitForEditor(page);
  await page.locator("#article-title").fill(title);
  await page.getByLabel("Krátky úvod na karte").fill("Izolovaný E2E perex s dostatočnou dĺžkou pre validačný contract.");
  const intro = page.locator("#article-intro");
  await intro.fill("Toto je bezpečný úvod článku s dostatočnou dĺžkou pre redakčný editor.");
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

    const breeds = page.locator("#article-relations");
    const search = breeds.getByRole("searchbox", { name: "Hľadať plemeno" });
    await expect(search).toBeVisible();
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

    await nav.getByRole("button", { name: "Náhľad" }).click();
    await expect(page.getByRole("button", { name: "Skryť náhľad" })).toBeVisible();
    await page.getByRole("button", { name: "Skryť náhľad" }).click();
    await expect(page.locator("#article-title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ukázať náhľad článku" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test("mobile page editor scrolls to deep publishing fields without a clipped inner pane", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

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
    expect(layout.documentHeight).toBeGreaterThan(layout.viewportHeight * 2);
    expect(layout.pageOverflow).toBe("visible");
    expect(layout.workspaceMaxHeight).toBe("none");
    expect(layout.columnsOverflow).toBe("visible");
    expect(layout.contentOverflow).toBe("visible");

    await page.evaluate(() => window.scrollTo(0, 0));
    const facebookDate = page.locator("#article-facebook-at");
    await facebookDate.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "auto" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const fieldBounds = await facebookDate.boundingBox();
    expect(fieldBounds).not.toBeNull();
    expect(fieldBounds!.y).toBeGreaterThan(100);
    expect(fieldBounds!.y + fieldBounds!.height).toBeLessThan(760);
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
      await expect(section.locator("details")).toHaveCount(0);
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

    const intro = page.locator("#article-intro");
    await intro.selectText();
    await page.keyboard.press("Control+b");
    await expect(intro.locator("b, strong")).toHaveCount(1);

    await page.getByLabel("ALT text").fill(`ALT ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("Popis fotografie / Caption").fill(`Caption ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("Zdroj / autor fotografie").fill(`Credit ARTICLE ADMIN ${suffix}`);
    await page.getByLabel("URL zdroja fotografie").fill("https://example.com/photo-source");

    await expect(page.getByRole("navigation", { name: "Sekcie pracovného editora" })).toBeVisible();
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

    const addArea = page.locator(".admin-block-add");
    await addArea.getByRole("button", { name: "+ Pridať blok na koniec" }).click();
    await addArea.getByRole("button", { name: "Video / embed" }).click();
    const videoEditor = page.locator(".admin-video-editor");
    await videoEditor.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(videoEditor.locator("iframe")).toBeVisible();

    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await expect(page.locator("#article-intro").locator("strong")).toContainText("Toto je bezpečný úvod");
    await expect(page.getByLabel("ALT text")).toHaveValue(`ALT ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("Popis fotografie / Caption")).toHaveValue(`Caption ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("Zdroj / autor fotografie")).toHaveValue(`Credit ARTICLE ADMIN ${suffix}`);
    await expect(page.getByLabel("URL zdroja fotografie")).toHaveValue("https://example.com/photo-source");

    await page.getByLabel("Autor", { exact: true }).selectOption({ label: authorName });
    await page.getByRole("button", { name: "Upraviť autora" }).click();
    const editDrawer = page.getByRole("dialog", { name: "Upraviť autora" });
    page.once("dialog", (dialog) => void dialog.accept());
    await editDrawer.getByRole("button", { name: "Deaktivovať" }).click();
    await expect(editDrawer).toBeHidden();
    await expect(page.getByLabel("Meno autora pre legacy článok")).toHaveValue(authorName);

    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();
  });

  test("supports format-first editing, live toolbar state, block formatting and list lifecycle", async ({ page }) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    const intro = page.locator("#article-intro");
    const introEditor = intro.locator("..");
    const bold = introEditor.getByRole("button", { name: /Tučné/ });
    const italic = introEditor.getByRole("button", { name: /Kurzíva/ });

    await intro.focus();
    await bold.click();
    await expect(intro).toBeFocused();
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("Tučný začiatok");
    await expect(intro.locator("strong, b")).toContainText("Tučný začiatok");

    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.type(" normálny text");

    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type(" kurzíva");
    await expect(intro.locator("em, i")).toContainText("kurzíva");
    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "false");

    const h2 = introEditor.getByRole("button", { name: "Nadpis úrovne 2" });
    await h2.click();
    await expect(intro.locator("h2")).toHaveCount(1);
    await expect(h2).toHaveAttribute("aria-pressed", "true");

    const h3 = introEditor.getByRole("button", { name: "Nadpis úrovne 3" });
    await h3.click();
    await expect(intro.locator("h3")).toHaveCount(1);
    await expect(h3).toHaveAttribute("aria-pressed", "true");

    const quote = introEditor.getByRole("button", { name: "Citácia" });
    await quote.click();
    await expect(intro.locator("blockquote")).toHaveCount(1);
    await expect(quote).toHaveAttribute("aria-pressed", "true");

    const callout = introEditor.getByRole("button", { name: "Tip alebo zvýraznenie" });
    await callout.click();
    await expect(intro.locator('[data-editorial-callout="tip"]')).toHaveCount(1);
    await expect(callout).toHaveAttribute("aria-pressed", "true");

    await introEditor.getByRole("button", { name: "Odsek" }).click();
    await expect(intro.locator("p")).toHaveCount(1);
    await expect(intro.locator("[data-editorial-callout]")).toHaveCount(0);

    await intro.selectText();
    await introEditor.getByRole("button", { name: "Vložiť odkaz" }).click();
    await introEditor.getByLabel("Odkaz", { exact: true }).fill("https://example.com/editor-link");
    await introEditor.getByRole("button", { name: "Použiť" }).click();
    await expect(intro.locator('a[href="https://example.com/editor-link"]')).toHaveCount(1);

    const takeaway = page.locator("#article-takeaway");
    const takeawayEditor = takeaway.locator("..");
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

    const bodyEditor = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
    const bodyWrapper = bodyEditor.locator("..");
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
    const richWrapper = intro.locator("..");
    await richWrapper.getByRole("button", { name: "Vložiť odkaz" }).click();
    await richWrapper.getByLabel("Odkaz", { exact: true }).fill("javascript:alert(1)");
    await richWrapper.getByRole("button", { name: "Použiť" }).click();
    await expect(richWrapper.getByRole("alert")).toContainText("bezpečný odkaz");

    await page.getByLabel("URL zdroja fotografie").fill("ftp://example.com/photo");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("URL zdroja fotografie musí byť platná webová adresa.")).toBeVisible();
    await page.getByLabel("URL zdroja fotografie").fill("");

    const addArea = page.locator(".admin-block-add");
    await addArea.getByRole("button", { name: "+ Pridať blok na koniec" }).click();
    await addArea.getByRole("button", { name: "Video / embed" }).click();
    const videoEditor = page.locator(".admin-video-editor");
    await videoEditor.locator('input[type="url"]').fill("https://evil.example/video");
    await expect(videoEditor.getByRole("alert")).toContainText("YouTube alebo Vimeo");

    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Video musí byť bezpečný HTTPS odkaz na YouTube alebo Vimeo.")).toBeVisible();

    await videoEditor.locator('input[type="url"]').fill("https://vimeo.com/123456789");
    await expect(videoEditor.locator("iframe")).toBeVisible();
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
  });

  test("preserves legacy article editing and publishes Novinky without a source", async ({ page }, testInfo) => {
    const legacyId = testInfo.project.name.includes("mobile") ? 972002 : 972001;
    await page.goto(`/admin/clanky/${legacyId}`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await expect(page.getByLabel("Meno autora pre legacy článok")).toHaveValue("Legacy autor");
    await expect(page.locator("#article-intro")).toContainText("Legacy úvod článku");
    await page.locator("#article-intro").fill("Legacy článok je teraz upravený cez canonical WYSIWYG bez straty spätnej kompatibility.");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();
    await expect(page.getByText("Uložené", { exact: true })).toBeVisible();

    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=novinky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `ARTICLE ADMIN Novinky optional source ${suffix}`);
    await expect(page.getByText("Odborné zdroje sú nepovinné vo všetkých článkoch vrátane zdravotných.")).toBeVisible();
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

    await page.getByRole("button", { name: "Publikovať článok" }).click();
    await expect(page.getByRole("heading", { name: "Chýbajú povinné údaje" })).toBeVisible();
    await expect(page.getByText(/internú redakčnú poznámku alebo placeholder/).first()).toBeVisible();
    await expect(page.getByText("Článok zatiaľ nemožno publikovať. Oprav blokujúce položky.")).toBeVisible();
    await expect(page.locator("#article-content")).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/novy\?sekcia=clanky/);

    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/clanky\/\d+\?vytvoreny=1$/);
    await waitForEditor(page);

    const persistedBody = page.locator("[data-admin-rich-text-editor]").nth(2).locator('[contenteditable="true"]');
    await expect(persistedBody).toBeVisible();
    await persistedBody.fill("Finálny verejný obsah po odstránení internej redakčnej poznámky.");
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
    await expect(page.getByRole("button", { name: "Uložiť koncept" })).toBeVisible();
  });

  test("IMAGE-EDITOR-1 independently persists thumbnail blur and detail crop, with cancel and reset", async ({ page }, testInfo) => {
    const id = testInfo.project.name.includes("mobile") ? 972002 : 972001;
    await page.goto(`/admin/clanky/${id}`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
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
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
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

  test("toolbar is keyboard reachable, axe-clean and does not overflow at 390px-class mobile width", async ({ page }, testInfo) => {
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
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
