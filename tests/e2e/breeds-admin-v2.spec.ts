import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

function suffix(testInfo: TestInfo) {
  return testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function draftName(testInfo: TestInfo) {
  return `BREEDS ADMIN E2E ${suffix(testInfo)}`;
}

async function necessaryCookies(page: Page) {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
}

async function waitForBreedEditor(page: Page) {
  await expect(page.locator('.admin-breed-editor[data-admin-breed-editor-ready="true"]')).toBeVisible();
}

async function openCreatedDraft(page: Page, testInfo: TestInfo) {
  await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Názov, slug, pôvod, FCI…").fill(draftName(testInfo));
  await page.getByRole("link", { name: draftName(testInfo) }).click();
  await waitForBreedEditor(page);
  await expect(page.getByLabel("Názov plemena")).toHaveValue(draftName(testInfo));
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("BREEDS-ADMIN Plemená Admin 2.0", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => necessaryCookies(page));

  test("dense list supports search, FCI/status/completeness filters and guarded publication bulk", async ({ page }) => {
    await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Plemená" })).toBeVisible();
    await expect(page.getByText("Obsahovo neúplné")).toBeVisible();

    const search = page.getByPlaceholder("Názov, slug, pôvod, FCI…");
    await search.fill("burgosky");
    const burgos = page.getByRole("article").filter({ hasText: "Burgoský stavač" });
    await expect(burgos).toBeVisible();
    await expect(burgos.locator("[data-breed-completeness]").first()).toBeVisible();

    await page.getByLabel("FCI skupina").selectOption("7");
    await expect(burgos).toBeVisible();
    await page.getByLabel("Úplnosť").selectOption("incomplete");
    await expect(burgos).toBeVisible();
    await page.getByRole("button", { name: "Zrušiť filtre" }).click();

    await search.fill("Biely svajciarsky");
    const row = page.getByRole("article").filter({ hasText: "Biely švajčiarsky ovčiak" });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox", { name: /Vybrať Biely švajčiarsky ovčiak/ }).check();
    await page.getByRole("button", { name: "Stiahnuť do konceptu" }).click();
    const draftDialog = page.getByRole("dialog", { name: "Stiahnuť vybrané plemená do konceptu" });
    await expect(draftDialog).toBeVisible();
    await draftDialog.getByRole("button", { name: "Stiahnuť do konceptu" }).click();
    await expect(row.getByText("Koncept", { exact: true })).toBeVisible();

    await row.getByRole("checkbox", { name: /Vybrať Biely švajčiarsky ovčiak/ }).check();
    await page.getByRole("button", { name: "Publikovať" }).click();
    const publishDialog = page.getByRole("dialog", { name: "Publikovať vybrané plemená" });
    await publishDialog.getByRole("button", { name: "Publikovať" }).click();
    await expect(row.getByText("Publikované", { exact: true })).toBeVisible();
  });

  test("create/edit regression keeps plain canonical breed fields editable without a storage migration", async ({ page }, testInfo) => {
    await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
    await waitForBreedEditor(page);
    await page.getByLabel("Názov plemena").fill(draftName(testInfo));
    await page.getByLabel("Krátky úvod v hero (2–4 vety)").fill("Izolovaný lokálny koncept pre BREEDS-ADMIN E2E.");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/admin\/plemena\/\d+$/);

    await page.getByLabel("Prehľad plemena").fill("Overený lokálny prehľad používaný iba v izolovanom CI.");
    await page.getByLabel("Každodenné potreby").fill("Lokálny test praktického obsahu.");
    await page.getByLabel("FCI skupina").fill("8");
    await page.getByLabel("FCI sekcia").fill("Retrievery");
    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je uložený.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Prehľad plemena")).toHaveValue("Overený lokálny prehľad používaný iba v izolovanom CI.");
    await expect(page.getByLabel("Každodenné potreby")).toHaveValue("Lokálny test praktického obsahu.");
  });

  test("sports drawer, long navigation and canonical article/station/club relations persist", async ({ page }, testInfo) => {
    await openCreatedDraft(page, testInfo);
    const navigation = page.getByRole("navigation", { name: "Sekcie editora plemena" });
    await expect(navigation).toBeVisible();
    await navigation.getByRole("link", { name: "Športy" }).click();
    await expect(page).toHaveURL(/#breed-sports$/);
    await expect(page.locator("#breed-sports")).toBeFocused();

    await page.getByRole("button", { name: "+ Pridať šport" }).click();
    const sportDrawer = page.getByRole("dialog", { name: "Pridať šport" });
    await sportDrawer.getByLabel("Šport").selectOption("nosework");
    await sportDrawer.getByLabel("Vhodnosť 1–5").fill("4");
    await sportDrawer.getByLabel("Krátka poznámka").fill("Izolovaný E2E šport.");
    await sportDrawer.getByRole("button", { name: "Uložiť šport" }).click();
    await expect(sportDrawer).toBeHidden();
    await expect(page.getByText("Nosework", { exact: true })).toBeVisible();

    await navigation.getByRole("link", { name: "Prepojenia" }).click();
    const articleGroup = page.getByRole("group", { name: "Súvisiace články" });
    await articleGroup.getByPlaceholder("Hľadať článok").fill("BREEDS-ADMIN");
    await articleGroup.getByLabel(/BREEDS-ADMIN súvisiaci článok/).check();

    const stationGroup = page.getByRole("group", { name: "Chovateľské stanice" });
    await stationGroup.getByPlaceholder("Hľadať stanicu").fill("BREEDS-ADMIN");
    await stationGroup.getByLabel(/BREEDS-ADMIN Chovateľská stanica/).check();

    const clubGroup = page.getByRole("group", { name: "Chovateľské kluby" });
    await clubGroup.getByPlaceholder("Hľadať klub").fill("BREEDS-ADMIN");
    await clubGroup.getByLabel(/BREEDS-ADMIN Chovateľský klub/).check();

    await page.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page.getByText("Koncept je uložený.")).toBeVisible();
    await page.reload();

    await expect(page.getByText("Nosework", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/BREEDS-ADMIN súvisiaci článok/)).toBeChecked();
    await expect(page.getByLabel(/BREEDS-ADMIN Chovateľská stanica/)).toBeChecked();
    await expect(page.getByLabel(/BREEDS-ADMIN Chovateľský klub/)).toBeChecked();

    const sportRow = page.getByRole("article").filter({ hasText: "Nosework" });
    await sportRow.getByRole("button", { name: "Upraviť" }).click();
    const editSport = page.getByRole("dialog", { name: "Upraviť šport" });
    await editSport.getByLabel("Vhodnosť 1–5").fill("6");
    await editSport.getByRole("button", { name: "Uložiť šport" }).click();
    await expect(editSport.getByRole("alert")).toContainText("od 1 do 5");
    await editSport.getByLabel("Vhodnosť 1–5").fill("5");
    await editSport.getByRole("button", { name: "Uložiť šport" }).click();
    await expect(page.getByText("Vhodnosť 5/5")).toBeVisible();
  });

  test("settings drawer restores focus and exposes FCI/SEO while image manager shows current image, fallback and remove", async ({ page }) => {
    await page.goto("/admin/plemena", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Názov, slug, pôvod, FCI…").fill("Biely svajciarsky");
    await page.getByRole("link", { name: "Biely švajčiarsky ovčiak" }).click();
    await waitForBreedEditor(page);

    const settings = page.getByRole("button", { name: "Nastavenia, FCI a SEO" });
    await settings.focus();
    await settings.click();
    const drawer = page.getByRole("dialog", { name: "Nastavenia plemena" });
    await expect(drawer.getByLabel("FCI PDF URL")).toBeVisible();
    await expect(drawer.getByLabel("URL adresa")).toHaveValue("biely-svajciarsky-ovciak");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(settings).toBeFocused();

    const imageSection = page.locator("#breed-media");
    await expect(imageSection.locator("img")).toBeVisible();
    await imageSection.getByRole("button", { name: "Odstrániť titulnú fotografiu" }).click();
    await expect(imageSection.getByText(/verejne sa použije fallback/)).toBeVisible();
    await expect(imageSection.locator('input[type="file"]').first()).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/avif");
  });

  test("editor is keyboard reachable, axe-clean and has no horizontal overflow at 390px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCreatedDraft(page, testInfo);
    await expectNoHorizontalOverflow(page);

    const firstField = page.getByLabel("Názov plemena");
    await firstField.focus();
    await expect(firstField).toBeFocused();
    await page.keyboard.press("Tab");

    const axe = await new AxeBuilder({ page })
      .include(".admin-breed-editor")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(serious, serious.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });
});
