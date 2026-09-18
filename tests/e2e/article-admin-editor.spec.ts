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
  await page.getByLabel(/Názov článku/).fill(title);
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

    await expect(page.getByRole("navigation", { name: "Sekcie editora článku" })).toBeVisible();
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

  test("rejects malicious paste/link and unsupported video while keeping optional fields optional", async ({ page }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=clanky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `ARTICLE ADMIN Security ${suffix}`);

    const intro = page.locator("#article-intro");
    await intro.evaluate((element) => {
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

  test("preserves legacy article editing and Novinky source publishing guard", async ({ page }, testInfo) => {
    await page.goto("/admin/clanky/972001", { waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await expect(page.getByLabel("Meno autora pre legacy článok")).toHaveValue("Legacy autor");
    await expect(page.locator("#article-intro")).toContainText("Legacy úvod článku");
    await page.locator("#article-intro").fill("Legacy článok je teraz upravený cez canonical WYSIWYG bez straty spätnej kompatibility.");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je bezpečne uložený.")).toBeVisible();

    const suffix = projectSuffix(testInfo.project.name);
    await page.goto("/admin/novy?sekcia=novinky", { waitUntil: "domcontentloaded" });
    await fillMinimumArticle(page, `ARTICLE ADMIN Novinky source guard ${suffix}`);
    await page.getByRole("button", { name: /Publikovať novinku/ }).click();
    await expect(page.getByText("Novinka potrebuje pred publikovaním aspoň jeden overiteľný zdroj.")).toBeVisible();
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

    const editor = page.locator(".admin-editor");
    const axe = await new AxeBuilder({ page })
      .include(".admin-editor")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);

    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    );
    expect(overflow).toBeLessThanOrEqual(1);

    if (testInfo.project.name.includes("mobile")) {
      const box = await editor.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.width ?? 9999)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 390) + 1);
    }
  });
});
