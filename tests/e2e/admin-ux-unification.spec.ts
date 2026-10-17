import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter(item => item.impact === "critical" || item.impact === "serious");
  expect(serious.map(item => `${item.id}: ${item.help}`)).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !["localhost", "127.0.0.1", "::1"].includes(new URL(baseURL).hostname)) {
    throw new Error("Admin UX verification requires an isolated local environment.");
  }
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

const editors = [
  { key: "article", route: "/admin/novy", field: "#article-title", navigation: "Sekcie editora článku" },
  { key: "breed", route: "/admin/plemena/novy", field: "", navigation: "Sekcie editora plemena" },
  { key: "directory", route: "/admin/adresar/novy", field: "#directory-name", navigation: "Sekcie profilu adresára" },
  { key: "event", route: "/admin/podujatia/nove", field: "#event-title" },
  { key: "help", route: "/admin/pomoc/novy", field: "#help-title" },
];

for (const editor of editors) {
  test(`${editor.key}: shared layout and fields survive section navigation at desktop, 390 and 320px`, async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile-chromium";
    await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
    const response = await page.goto(editor.route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const field = editor.key === "breed" ? page.getByLabel("Názov plemena", { exact: true }) : page.locator(editor.field);
    await expect(field).toBeEditable();
    const value = `Neuložený test ${editor.key}`;
    // Wait for the client editor, then verify that moving within the editor
    // never sends a mutation or replaces typed state.
    if (editor.key === "article") await expect(page.locator('#article-intro[data-editor-ready="true"]')).toBeVisible();
    if (editor.key === "breed") await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
    await field.fill(value);
    await expect(field).toHaveValue(value);
    const writes: string[] = [];
    page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/admin/")) writes.push(request.url()); });
    if (editor.navigation) {
      const nav = page.getByRole("navigation", { name: editor.navigation, exact: true });
      const options = await nav.locator('select option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
      const target = options.find(id => /media/.test(id)) ?? options.at(-1)!;
      const select = nav.getByRole("combobox");
      if (await select.isVisible()) await select.selectOption(target);
      else await nav.locator(`a[href$="#${target}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${target}$`));
      await expect(field).toHaveValue(value);
      await expect.poll(async () => {
        const section = await page.locator(`#${target}`).boundingBox();
        const box = await nav.boundingBox();
        return (section?.y ?? -1) >= (box?.y ?? 0) + (box?.height ?? 0) - 1;
      }).toBe(true);
      expect(await nav.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(0);
    }
    expect(writes).toEqual([]);
    await noOverflow(page);
    await accessible(page);
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 900 });
      await expect(field).toHaveValue(value);
      await noOverflow(page);
    }
    await mkdir(".e2e-artifacts/admin-ux-unification/verified", { recursive: true });
    await page.screenshot({ path: `.e2e-artifacts/admin-ux-unification/verified/${editor.key}-${testInfo.project.name}.png` });
  });
}

test("breed settings drawer preserves input, traps keyboard focus and returns focus on Escape", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: testInfo.project.name === "mobile-chromium" ? 320 : 1440, height: 900 });
  await page.goto("/admin/plemena/novy");
  await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
  await page.getByLabel("Názov plemena", { exact: true }).fill("Neuložené plemeno");
  const trigger = page.getByRole("button", { name: "Nastavenia, FCI a SEO", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Nastavenia plemena", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^URL adresa/)).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await noOverflow(page);
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Názov plemena", { exact: true })).toHaveValue("Neuložené plemeno");
});

test("shared navigation keeps its layout and active section after client navigation", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 320 : 1440, height: 900 });
  await page.goto("/admin");
  await expect(page.locator("[data-admin-sidebar]")).toHaveAttribute("data-admin-hydrated", "true");
  for (const [label, path] of [["Články", "/admin/clanky"], ["Plemená", "/admin/plemena"]]) {
    if (mobile) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await expect.poll(async () => {
        if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
        return menu.getAttribute("aria-expanded");
      }).toBe("true");
    }
    const nav = mobile
      ? page.getByRole("dialog", { name: "Navigácia administrácie" }).getByRole("navigation", { name: "Redakčné moduly", exact: true })
      : page.getByRole("navigation", { name: "Redakčné moduly", exact: true });
    if (!mobile) {
      const contentGroup = nav.getByRole("button", { name: "Obsah", exact: true });
      if (await contentGroup.getAttribute("aria-expanded") !== "true") await contentGroup.click();
    }
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await noOverflow(page);
    if (mobile) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await expect.poll(async () => {
        if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
        return menu.getAttribute("aria-expanded");
      }).toBe("true");
    }
    const currentNav = mobile
      ? page.getByRole("dialog", { name: "Navigácia administrácie" }).getByRole("navigation", { name: "Redakčné moduly", exact: true })
      : page.getByRole("navigation", { name: "Redakčné moduly", exact: true });
    await expect(currentNav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    if (mobile) await page.keyboard.press("Escape");
    else await expect(currentNav).toHaveCSS("display", "grid");
  }
});

test("approved V3 shell renders navigation and captures desktop/mobile evidence", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
  const response = await page.goto("/admin", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  if (mobile) {
    await expect(page.getByRole("link", { name: "Psipedia Admin – pracovný prehľad" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  } else {
    const nav = page.getByRole("navigation", { name: "Redakčné moduly", exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: "Prehľad", exact: true })).toHaveAttribute("aria-expanded", "true");
  }
  await noOverflow(page);
  await accessible(page);
  await mkdir(".e2e-artifacts/admin-ux-unification/approved-v3", { recursive: true });
  await page.screenshot({
    path: `.e2e-artifacts/admin-ux-unification/approved-v3/admin-shell-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 800 });
    await noOverflow(page);
    await page.screenshot({
      path: ".e2e-artifacts/admin-ux-unification/approved-v3/admin-shell-mobile-320.png",
      fullPage: true,
    });
  }
});
