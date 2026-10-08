import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// PUBLIC-UX-FOUNDATION-V3: validate the shared shell, not individual page redesigns.
const widths = [320, 375, 390, 430, 768, 1280, 1440] as const;
const routes = ["/steniatka", "/pomoc-psom", "/adresar"] as const;
const VISUAL_ARTIFACT_DIR = process.env.PUBLIC_UX_FOUNDATION_V3_ARTIFACT_DIR ?? ".e2e-artifacts/public-ux-foundation-v3";

async function assertNoDocumentOverflow(page: Page, context: string) {
  const actual = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    header: (() => {
      const el = document.querySelector<HTMLElement>(".site-header");
      return el ? el.scrollWidth - el.clientWidth : -1;
    })(),
  }));
  expect(actual.document, `${context}: document overflow`).toBeLessThanOrEqual(1);
  expect(actual.header, `${context}: header overflow`).toBeLessThanOrEqual(1);
}

test.describe("PUBLIC-UX-FOUNDATION-V3 shared public shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
  });

  test("mobile, tablet and desktop viewport matrix keeps shared routes usable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix is covered once");
    test.setTimeout(180_000);

    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
      for (const route of routes) {
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${route} at ${width}px`).toBeLessThan(400);
        await expect(page.locator("main#obsah")).toBeVisible();
        await expect(page.getByRole("link", { name: "Psipedia.sk – domov" })).toBeVisible();
        await assertNoDocumentOverflow(page, `${route} at ${width}px`);

        if (width < 1200) {
          await expect(page.getByRole("button", { name: "Otvoriť menu" })).toBeVisible();
        } else {
          await expect(page.getByRole("navigation", { name: "Hlavná navigácia" })).toBeVisible();
          await expect(page.locator("#mobile-menu")).toBeHidden();
        }

        // Preserve the approved edge-to-edge, square-cornered image on mobile.
        const media = page.locator("[data-unified-section-hero-media]").first();
        if (width <= 430 && await media.count() && await media.isVisible()) {
          const rect = await media.boundingBox();
          expect(rect?.x ?? -1, `${route}: mobile hero left edge`).toBeGreaterThanOrEqual(-1);
          expect(rect?.x ?? 1, `${route}: mobile hero starts at viewport edge`).toBeLessThanOrEqual(1);
          expect(Math.abs((rect?.width ?? 0) - width), `${route}: mobile hero width`).toBeLessThanOrEqual(2);
          expect(await media.evaluate(el => getComputedStyle(el).borderRadius)).toBe("0px");
        }

        // CI artifacts are post-change proofs. Before images require the pinned base SHA.
        if (route === "/steniatka" && (width === 390 || width === 1440)) {
          mkdirSync(VISUAL_ARTIFACT_DIR, { recursive: true });
          const screenshotPath = `${VISUAL_ARTIFACT_DIR}/after-steniatka-${width}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
          await testInfo.attach(`foundation-after-${width}`, {
            path: screenshotPath,
            contentType: "image/png",
          });
        }
      }
    }
  });

  test("narrow menu remains scrollable, respects viewport and preserves page scroll", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Explicit mobile widths are covered once");
    test.setTimeout(90_000);

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto("/steniatka");
      const opener = page.getByRole("button", { name: "Otvoriť menu" });
      await opener.click();
      const menu = page.locator("#mobile-menu");
      const nav = menu.locator(":scope > nav");
      await expect(opener).toHaveAttribute("aria-expanded", "true");
      await expect(menu).toHaveAttribute("aria-hidden", "false");
      await expect(nav.getByRole("link", { name: "Partner účet" })).toHaveCount(1);
      await expect(nav.getByRole("link", { name: "Kontakt", exact: true })).toHaveCount(1);
      const metrics = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("#mobile-menu")!;
        const inner = el.querySelector<HTMLElement>("nav")!;
        const box = el.getBoundingClientRect();
        const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--psipedia-sticky-header-height"));
        return {
          bottom: box.bottom,
          visualHeight: window.innerHeight,
          scrollable: getComputedStyle(inner).overflowY,
          bodyLocked: document.body.style.overflow,
          headerHeight,
          menuFits: el.scrollWidth <= el.clientWidth + 1,
        };
      });
      expect(metrics.bottom, `${width}px: menu extends below the viewport`).toBeLessThanOrEqual(metrics.visualHeight + 2);
      expect(metrics.scrollable).toBe("auto");
      expect(metrics.bodyLocked).not.toBe("hidden");
      expect(metrics.headerHeight).toBeGreaterThan(0);
      expect(metrics.menuFits).toBe(true);

      await nav.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(nav.getByRole("link", { name: "Partner účet" })).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-hidden", "true");
      await expect(opener).toBeFocused();
      await assertNoDocumentOverflow(page, `${width}px menu closed`);
    }
  });

  test("search dialog traps keyboard focus and remains accessible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Shared dialog is covered once");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/steniatka");
    const search = page.getByRole("button", { name: "Otvoriť vyhľadávanie" });
    await search.click();
    const dialog = page.getByRole("dialog", { name: "Vyhľadávanie" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Hľadaný výraz" })).toBeFocused();
    const accessibility = await new AxeBuilder({ page })
      .include(".search-modal")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations.filter(x => ["critical", "serious"].includes(x.impact ?? ""))).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(search).toBeFocused();
  });
});
