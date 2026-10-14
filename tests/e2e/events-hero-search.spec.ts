import { expect, test } from "@playwright/test";

const intro = "Objav výstavy psov, preteky, tréningy, semináre a stretnutia po celom Slovensku. Vyber si termín a miesto, ktoré ti vyhovuje.";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("events hero has the approved copy and a single event-only GET search", async ({ page }) => {
  await page.goto("/podujatia?region=Žilinský%20kraj&mesiac=2026-10&kalendar=2026-10&den=2026-10-15&termin=vsetky");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Podujatia");
  await expect(page.locator("[data-section-hero-eyebrow]")).toHaveText("KALENDÁR PSÍCH PODUJATÍ");
  await expect(page.locator("[data-section-hero-intro]")).toHaveText(intro);
  await expect(page.locator('input[name="q"]:not([type="hidden"])')).toHaveCount(1);
  const search = page.locator('[data-public-search-form="events"]');
  await expect(search).toHaveAttribute("action", "/podujatia");
  await page.getByRole("textbox", { name: "Hľadať podujatia", exact: true }).fill("pes");
  await search.getByRole("button", { name: "Hľadať", exact: true }).click();
  await expect(page).toHaveURL(url => [
    ["q", "pes"], ["region", "Žilinský kraj"], ["mesiac", "2026-10"],
    ["den", "2026-10-15"], ["termin", "vsetky"],
  ].every(([key, value]) => url.searchParams.get(key) === value));
  await expect(page.getByRole("textbox", { name: "Hľadať podujatia", exact: true })).toHaveValue("pes");
  await page.getByRole("link", { name: "Nasledujúci mesiac" }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("q") === "pes" && url.searchParams.get("kalendar") === "2026-11");
  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("q") === "pes" && url.searchParams.get("termin") === "ukoncene");
  await expect(page.locator(".site-header [data-search-ready]")).toHaveAttribute("data-search-ready", "true");
  const toggle = page.locator("summary").filter({ hasText: "Filtrovať" });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("combobox", { name: "Kraj", exact: true }).selectOption("Nitriansky kraj");
  await page.getByRole("button", { name: "Zobraziť výsledky" }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("q") === "pes" && url.searchParams.get("region") === "Nitriansky kraj");
  await page.getByRole("textbox", { name: "Hľadať podujatia", exact: true }).fill("");
  await search.getByRole("button", { name: "Hľadať", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Hľadať podujatia", exact: true })).toHaveValue("");
  await expect(page).toHaveURL(url => !url.searchParams.get("q") && url.searchParams.get("region") === "Nitriansky kraj");
});

test("quick categories use existing routes and category copy stays relevant", async ({ page }) => {
  await page.goto("/podujatia");
  const shortcuts = page.locator(".home-search-shortcuts");
  for (const [label, slug] of [["Výstavy", "vystavy"], ["Preteky", "preteky"], ["Semináre", "seminare"], ["Tréningy", "treningy"], ["Stretnutia", "stretnutia"]]) {
    await expect(shortcuts.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `/podujatia/${slug}`);
  }
  await shortcuts.getByRole("link", { name: "Výstavy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Výstavy");
  await expect(page.locator("[data-section-hero-intro]")).not.toHaveText(intro);
  await expect(page.locator('[data-public-search-form="events"]')).toHaveAttribute("action", "/podujatia/vystavy");
  await expect(page.locator('input[name="q"]:not([type="hidden"])')).toHaveCount(1);
});

test("homepage search defaults stay unchanged and event search follows the hero without overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-search-form")).toHaveAttribute("action", "/hladat");
  await expect(page.locator("#home-search")).toHaveAttribute("required", "");
  await expect(page.locator(".home-search-form button")).toHaveText("Nájsť všetko");
  for (const width of [390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/podujatia");
    await expect(page.getByRole("textbox", { name: "Hľadať podujatia", exact: true })).toBeVisible();
    const bounds = await page.locator("[data-unified-section-hero-visual]").boundingBox();
    const panel = await page.locator(".home-search-panel").boundingBox();
    // GLOBAL-DESIGN-UNIFICATION-1 intentionally moves the event search below the hero.
    // Preserve the no-overlap, compact-gap and bounded-width layout contract.
    const heroBottom = bounds!.y + bounds!.height;
    expect(panel!.y).toBeGreaterThanOrEqual(heroBottom);
    expect(panel!.y - heroBottom).toBeLessThanOrEqual(80);
    expect(panel!.width).toBeLessThanOrEqual(781);
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});


test("invalid filters remain bounded and search stays escaped", async ({ page }) => {
  await page.goto("/podujatia?q=%3Cscript%3Etest%3C%2Fscript%3E&region=invalid&mesiac=2026-99&kalendar=bad&den=2026-02-31&termin=invalid");
  await expect(page.locator("#events-search")).toHaveValue("<script>test</script>");
  const search = page.locator('[data-public-search-form="events"]');
  await expect(search.locator('input[name="region"], input[name="mesiac"], input[name="den"], input[name="termin"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Najbližšie", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-unified-section-hero] img')).toHaveAttribute("sizes", "(max-width: 620px) 100vw, (max-width: 1228px) calc(100vw - 48px), 1180px");
});
