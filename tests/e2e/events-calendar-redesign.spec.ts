import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const target = "/podujatia?q=Calendar+phase2&region=Nitriansky+kraj&mesiac=2026-10&termin=vsetky";
const types = [
  ["Výstava", "Výstavy", "vystavy", "rgb(234, 135, 50)"],
  ["Preteky", "Preteky", "preteky", "rgb(37, 132, 83)"],
  ["Seminár", "Semináre", "seminare", "rgb(170, 120, 53)"],
  ["Tréning", "Tréningy", "treningy", "rgb(40, 127, 202)"],
  ["Stretnutie", "Stretnutia", "stretnutia", "rgb(137, 84, 197)"],
  ["Iné", "Ostatné", "dalsie", "rgb(120, 131, 139)"],
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  await page.goto(target);
});

test("compact calendar uses six canonical legend links and real unique day indicators", async ({ page }) => {
  const legend = page.locator("[data-events-legend]");
  await expect(legend.getByRole("link")).toHaveCount(6);
  const day = page.locator('[data-calendar-date="2026-10-15"]');
  await expect(day).toHaveAttribute("data-count", "7");
  await expect(day.locator("[data-event-type]")).toHaveCount(4);
  await expect(day).toContainText("+2");
  for (const [type, label, slug, color] of types) {
    const link = legend.getByRole("link", { name: label, exact: true });
    const href = await link.getAttribute("href");
    const url = new URL(href!, "https://psipedia.sk");
    expect(url.pathname).toBe(`/podujatia/${slug}`);
    expect(url.searchParams.get("q")).toBe("Calendar phase2");
    expect(url.searchParams.get("region")).toBe("Nitriansky kraj");
    expect(url.searchParams.get("mesiac")).toBe("2026-10");
    expect(url.searchParams.get("termin")).toBe("vsetky");
    await expect(day).toHaveAttribute("aria-label", new RegExp(label));
    const dot = link.locator("[data-event-type]");
    expect(await dot.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(color);
    const dayDot = day.locator(`[data-event-type="${type}"]`);
    if (await dayDot.count()) expect(await dayDot.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(color);
  }
  await expect(day.locator('[data-event-type="Výstava"]')).toHaveCount(1);
  await expect(page.locator('[data-calendar-date="2026-10-16"]')).toHaveAttribute("data-count", "1");
  await expect(page.locator('[data-calendar-date="2026-10-16"] [data-event-type="Výstava"]')).toHaveCount(1);
  await expect(page.locator('[data-calendar-date="2026-10-17"] [data-event-type]')).toHaveCount(0);
  await day.click();
  await expect(page.locator("[data-selected-day] li")).toHaveCount(7);
  await expect(page.locator("[data-selected-day]")).toContainText("Zrušené");
  await expect(page.locator('[data-calendar-date="2026-10-15"]')).toHaveAttribute("data-selected", "true");
});

test("DOM order is calendar, selected-day detail, one banner, then the unchanged listing", async ({ page }) => {
  await page.locator('[data-calendar-date="2026-10-15"]').click();
  await expect(page.getByRole("group", { name: "Spôsob prezerania podujatí" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Vyberte si, čo vás zaujíma" })).toHaveCount(0);
  await expect(page.locator("[data-public-subcategory-mode=landing]")).toHaveCount(0);
  await expect(page.locator("[data-public-context-banner]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Pridať podujatie", exact: true })).toHaveAttribute("href", "/podujatia/pridat-podujatie");
  expect(await page.evaluate(() => {
    const calendar = document.querySelector("#events-calendar")!;
    const detail = document.querySelector("[data-selected-day]")!;
    const banner = document.querySelector("[data-public-context-banner]")!;
    const list = document.querySelector("#events-list")!;
    return calendar.contains(detail) && Boolean(detail.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(banner.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await page.getByRole("link", { name: "Nasledujúci mesiac" }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("q") === "Calendar phase2" && url.searchParams.get("kalendar") === "2026-11" && !url.searchParams.has("mesiac"));
  await page.getByRole("link", { name: "Ukončené", exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("termin") === "ukoncene" && url.searchParams.get("q") === "Calendar phase2");
});

test("legend stays visible without overflow, cells remain bounded, and accessibility is preserved", async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(target);
    const calendar = await page.locator("#events-calendar").boundingBox();
    const legend = await page.locator("[data-events-legend]").boundingBox();
    if (width >= 768) expect(legend!.x).toBeGreaterThanOrEqual(calendar!.x + calendar!.width);
    else expect(legend!.y).toBeGreaterThanOrEqual(calendar!.y + calendar!.height);
    const full = await page.locator('[data-calendar-date="2026-10-15"]').boundingBox();
    const empty = await page.locator('[data-calendar-date="2026-10-17"]').boundingBox();
    expect(full!.height).toBe(empty!.height);
    expect(full!.height).toBeLessThanOrEqual(60);
    expect(full!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 1000 });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
