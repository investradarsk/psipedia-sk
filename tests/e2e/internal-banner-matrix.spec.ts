import { expect, test } from "@playwright/test";

// Use the actual homepage markup and loaded production CSS; vary only placement
// and palette in a detached test fixture. No changes to production data.
for (const viewport of [320, 390, 768, 1440]) {
  test(`internal banner matrix at viewport ${viewport}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport, height: 900 });
    await page.goto("/");
    const source = page.locator('[data-home-banner="profil"]').first();
    await expect(source).toBeVisible();
    const cases = await source.evaluate((original) => {
      const host = document.createElement("div");
      host.id = "banner-matrix-fixture";
      host.style.cssText = "display:grid;gap:16px;width:100%;min-width:0;padding:8px;box-sizing:border-box";
      document.body.appendChild(host);
      for (const size of ["small", "medium", "large"]) {
        for (const theme of ["light", "dark"]) {
          const wrapper = document.createElement("div");
          wrapper.style.cssText = "width:100%;min-width:0;max-width:" + ({small:260,medium:700,large:1150}[size as "small"|"medium"|"large"]) + "px";
          const banner = original.cloneNode(true) as HTMLElement;
          banner.removeAttribute("id");
          banner.removeAttribute("aria-labelledby");
          banner.removeAttribute("data-banner-desktop-visual");
          banner.removeAttribute("data-visual-library-desktop-published");
          banner.removeAttribute("style");
          banner.classList.remove("shell");
          banner.style.width = "100%";
          banner.dataset.bannerVisual = theme;
          banner.dataset.bannerSize = size;
          banner.dataset.matrixCase = size + "-" + theme;
          banner.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
          wrapper.appendChild(banner);
          host.appendChild(wrapper);
        }
      }
      return host.querySelectorAll("[data-matrix-case]").length;
    });
    expect(cases).toBe(6);
    for (const size of ["small", "medium", "large"]) {
      for (const theme of ["light", "dark"]) {
        const banner = page.locator(`[data-matrix-case="${size}-${theme}"]`);
        const heading = banner.locator("[data-public-heading]");
        const button = banner.locator("a[data-public-action]").first();
        await expect(heading).toBeVisible();
        await expect(button).toBeVisible();
        await expect(banner).toHaveCSS("background-color", theme === "dark" ? "rgb(23, 77, 58)" : "rgb(247, 242, 233)");
        await expect(button).toHaveCSS("background-color", theme === "dark" ? "rgb(180, 73, 57)" : "rgb(23, 77, 58)");
        await expect(button).toHaveCSS("background-image", "none");
        await expect(button).toHaveCSS("border-radius", "9px");
        const geometry = await banner.evaluate((el) => {
          const copy = el.querySelector("[data-public-banner-copy]")!;
          const action = el.querySelector("a[data-public-action]")!;
          const art = el.querySelector("[data-ps-banner-art]")!;
          const b = el.getBoundingClientRect();
          const c = copy.getBoundingClientRect();
          const a = action.getBoundingClientRect();
          const d = art.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const available = b.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return {
            buttonBelowCopy: a.top >= c.bottom - 1,
            buttonInside: a.left >= b.left && a.right <= b.right + 1,
            noOverflow: el.scrollWidth <= el.clientWidth + 1,
            touchHeight: a.height,
            dogVisible: getComputedStyle(art, "::after").display !== "none",
            artSeparated: available <= 520 ? d.top >= a.bottom - 1 : b.right - a.right >= b.width * .19,
          };
        });
        expect(geometry.buttonBelowCopy).toBe(true);
        expect(geometry.buttonInside).toBe(true);
        expect(geometry.noOverflow).toBe(true);
        expect(geometry.touchHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.dogVisible).toBe(true);
        expect(geometry.artSeparated).toBe(true);
      }
    }
    await page.locator("#banner-matrix-fixture").screenshot({ path: test.info().outputPath(`banner-matrix-${viewport}.png`) });
  });
}
