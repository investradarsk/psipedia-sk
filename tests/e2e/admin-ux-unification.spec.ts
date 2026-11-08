import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function noOverflow(page: Page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (width > 1) {
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
    console.info("[ADMIN_V3_CONTENT_EDITOR_OVERFLOW]", JSON.stringify(details));
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter(item => item.impact === "critical" || item.impact === "serious");
  expect(serious.flatMap(item => item.nodes.map(node =>
    `${item.id}: ${item.help}; target=${node.target.join(",")}; summary=${node.failureSummary ?? ""}`
  ))).toEqual([]);
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
    // Server-rendered inputs may be editable before React is ready. Do not
    // count pre-hydration typing as a persisted client-side editor change.
    if (editor.navigation) {
      const name = editor.key === "article" || editor.key === "breed"
        ? "Sekcie pracovného editora" : editor.navigation;
      await expect(page.getByRole("navigation", { name, exact: true }))
        .toHaveAttribute("data-admin-editor-nav-ready", "true");
    }
    await expect(field).toBeEditable();
    const value = `Neuložený test ${editor.key}`;
    // Wait for the client editor, then verify that moving within the editor
    // never sends a mutation or replaces typed state.
    if (editor.key === "article") {
      // The article editor deliberately starts in Publikovanie, not in its
      // content section. Activate Úvod a obsah before asserting visibility
      // or typing into the title; do not alter the editor's default UI.
      const articleNav = page.getByRole("navigation", { name: "Sekcie pracovného editora", exact: true });
      const articleSelect = articleNav.getByRole("combobox");
      if (await articleSelect.isVisible()) {
        await articleSelect.selectOption("article-basics");
      } else {
        await articleNav.getByRole("button", { name: "Úvod a obsah", exact: true }).click();
      }
      await expect(page.locator("#article-basics")).toBeVisible();
      // Tiptap remains mounted across section changes.
      await expect(page.locator('#article-intro[data-editor-ready="true"]')).toHaveCount(1);
    }
    if (editor.key === "breed") await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
    // Preserve main's hydration gate: the directory is server-rendered before
    // its interactive navigation becomes available on slower mobile workers.
    if (editor.key === "directory") await expect(page.locator('form.admin-directory-editor[data-hydrated="true"]')).toBeVisible();
    if (editor.key === "article") {
      // File-upload inputs must remain visually hidden despite the shared V3
      // rule for ordinary text fields. An absolute, full-width upload control
      // otherwise expands the document and blocks mobile buttons.
      const uploads = page.locator('[data-editor-page] label.admin-upload-button > input[type="file"]');
      await expect(uploads.first()).toBeAttached();
      const dimensions = await uploads.evaluateAll(inputs => inputs.map(input => {
        const control = input as HTMLInputElement;
        const css = getComputedStyle(control);
        return { width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height, position: css.position };
      }));
      expect(dimensions.every(item => item.position === "absolute" && item.width <= 1 && item.height <= 1)).toBe(true);
    }
    await field.fill(value);
    await expect(field).toHaveValue(value);
    const writes: string[] = [];
    page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/admin/")) writes.push(request.url()); });
    if (editor.navigation) {
      const sharedWorkspace = editor.key === "article" || editor.key === "breed";
      const nav = page.getByRole("navigation", { name: sharedWorkspace ? "Sekcie pracovného editora" : editor.navigation, exact: true });
      if (editor.key === "directory") await expect(nav).toHaveAttribute("data-admin-editor-nav-ready", "true");
      const options = await nav.locator('select option').evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value));
      const target = options.find(id => /media/.test(id)) ?? options.at(-1)!;
      expect(target).toBeTruthy();
      const select = nav.getByRole("combobox");
      if (await select.isVisible()) {
        // A visible section can already be selected by IntersectionObserver.
        // Move away and back to exercise an actual navigation change event.
        if (await select.inputValue() === target) {
          const alternative = options.find(id => id !== target);
          if (alternative) await select.selectOption(alternative);
        }
        await select.selectOption(target);
      }
      else {
        // All canonical editors migrated to "switch" in steps 7–15.
        // In this mode navigation uses real buttons, not scroll anchors or hash.
        const label = await nav.locator("select option").evaluateAll((elements, value) =>
          elements.find(element => (element as HTMLOptionElement).value === value)?.textContent?.trim() ?? "", target);
        if (await nav.getAttribute("data-editor-navigation-mode") === "scroll") {
          await nav.getByRole("link", { name: label, exact: true }).click();
        } else {
          await nav.getByRole("button", { name: label, exact: true }).click();
        }
      }
      await expect(page.locator(`#${target}`)).toBeVisible();
      // Scroll-mode navigation retains the text caret; switch mode moves
      // focus to the newly revealed panel for keyboard accessibility.
      if (await nav.getAttribute("data-editor-navigation-mode") === "switch") {
        await expect(page.locator(`#${target}`)).toBeFocused();
      }
      await expect(field).toHaveValue(value);
      // Keyboard focus follows the chosen section in switch mode;
      // returning to the initial panel must keep the unsaved field value.
      // Restore the initially editable panel, rather than the first menu
      // item: the article's first menu item is publication settings.
      const initial = editor.key === "article" ? "article-basics" : options[0];
      const selectBack = nav.getByRole("combobox");
      if (await selectBack.isVisible()) await selectBack.selectOption(initial);
      else {
        const initialLabel = await nav.locator("select option").evaluateAll((elements, value) =>
          elements.find(element => (element as HTMLOptionElement).value === value)?.textContent?.trim() ?? "", initial);
        if (await nav.getAttribute("data-editor-navigation-mode") === "scroll") {
          await nav.getByRole("link", { name: initialLabel, exact: true }).click();
        } else {
          await nav.getByRole("button", { name: initialLabel, exact: true }).click();
        }
      }
      await expect(page.locator(`#${initial}`)).toBeVisible();
      await expect(field).toBeVisible();
      await expect(field).toHaveValue(value);
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

for (const width of [390, 320]) {
  test(`mobile editor controls avoid input zoom and preserve keyboard flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    const response = await page.goto("/admin/pomoc/novy", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    const form = page.locator("form[data-admin-help-editor]");
    await expect(form).toHaveAttribute("data-hydrated", "true");
    const title = form.locator("#help-title");
    await expect(title).toBeEditable();
    const nav = form.getByRole("navigation", { name: "Sekcie editora Pomoc psom" });
    const select = nav.getByRole("combobox");
    await expect(select).toBeVisible();

    const sizes = await Promise.all([title, select].map(locator =>
      locator.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))));
    expect(sizes.every(size => size >= 16), `iOS focus zoom risk: ${sizes.join(", ")} px`).toBe(true);

    await title.fill("Mobilná rozpracovaná výzva");
    await select.selectOption("help-place");
    await expect(page.locator("#help-place")).toBeFocused();
    // A focusable section is followed by its first native form control.
    await page.keyboard.press("Tab");
    await expect(page.locator("#help-category")).toBeFocused();
    await select.selectOption("help-basics");
    await expect(title).toHaveValue("Mobilná rozpracovaná výzva");
    await form.locator("[data-admin-editor-pager]").getByRole("button", { name: "Ďalšia" }).click();
    await expect(page.locator("#help-place")).toBeFocused();
    await noOverflow(page);
  });

  test(`breed mobile sticky navigation leaves the active section in view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    const response = await page.goto("/admin/plemena/novy", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-admin-breed-editor-ready="true"]')).toBeVisible();
    const title = page.getByLabel("Názov plemena", { exact: true });
    const fontSize = await title.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const nav = page.getByRole("navigation", { name: "Sekcie pracovného editora" });
    await nav.getByRole("combobox").selectOption("breed-overview");
    await expect(page.locator("#breed-overview")).toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const toolbar = document.querySelector("[data-editor-page] [data-editor-navigation]");
      const target = document.getElementById("breed-overview");
      if (!toolbar || !target) return false;
      // Smooth scrolling is asynchronous. The active panel must clear
      // the sticky navigation once the scroll has settled.
      return target.getBoundingClientRect().top >= toolbar.getBoundingClientRect().bottom - 2;
    })).toBe(true);
    await noOverflow(page);
  });
}

for (const width of [1440, 390, 320]) {
  test(`help: mounted single-section editor preserves values at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/admin/pomoc/novy");
    expect(response?.status()).toBe(200);
    const nav = page.getByRole("navigation", { name: "Sekcie editora Pomoc psom" });
    await expect(nav).toHaveAttribute("data-admin-editor-nav-ready", "true");
    const title = page.locator("#help-title");
    // Prevent typing into an SSR-rendered but not yet hydrated controlled input.
    await expect(page.locator("form[data-admin-help-editor]")).toHaveAttribute("data-hydrated", "true");
    await expect(title).toBeEditable();
    await title.fill("Pomoc psom – skúšobná výzva");
    const written: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
          && request.url().includes("/api/admin/help")) written.push(request.url());
    });
    const activate = async (id: string, name: string) => {
      const select = nav.getByRole("combobox");
      if (await select.isVisible()) await select.selectOption(id);
      else await nav.getByRole("button", { name, exact: true }).click();
      await expect(page.locator("#" + id)).toBeVisible();
    };
    await activate("help-place", "Zaradenie a lokalita");
    await expect(title).toBeHidden();
    await page.locator("#help-organization").fill("Záchranné centrum");
    await activate("help-story", "Prípad a pes");
    await expect(page.locator("#help-dog-name")).toBeEditable();
    await page.locator("#help-dog-name").fill("Ben");
    await activate("help-action", "Výzva a zbierka");
    await expect(page.locator("#help-action-url")).toBeEditable();
    await activate("help-media", "Fotografia a stav");
    await expect(page.locator("#help-slug")).toBeEditable();
    await activate("help-seo", "SEO");
    await expect(page.locator("#help-seo")).toBeVisible();
    await activate("help-place", "Zaradenie a lokalita");
    await expect(page.locator("#help-organization")).toHaveValue("Záchranné centrum");
    await activate("help-story", "Prípad a pes");
    await expect(page.locator("#help-dog-name")).toHaveValue("Ben");
    await activate("help-basics", "Základné údaje");
    await expect(title).toHaveValue("Pomoc psom – skúšobná výzva");
    const pager = page.locator('[data-admin-editor-pager]');
    await pager.getByRole("button", { name: "Ďalšia" }).click();
    await expect(page.locator("#help-place")).toBeFocused();
    await pager.getByRole("button", { name: "Predchádzajúca" }).click();
    await expect(page.locator("#help-basics")).toBeFocused();
    await expect(title).toHaveValue("Pomoc psom – skúšobná výzva");
    expect(written).toEqual([]);
    await noOverflow(page);
    await accessible(page);
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
  const slug = dialog.locator("#breed-settings-slug");
  await expect(slug).toBeVisible();
  await expect(slug).toHaveAttribute("required", "");
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

test("event preview is beside the form on desktop and toggled instead of stacked on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto("/admin/podujatia/nove", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const editor = page.locator("[data-event-editor-v3]");
  const content = editor.locator("[data-editor-content]");
  const preview = editor.locator("[data-editor-preview]");
  const previewToggle = editor.locator("[data-editor-navigation] > button");
  await expect(content).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(previewToggle).toBeHidden();
  const contentBox = await content.boundingBox();
  const previewBox = await preview.boundingBox();
  expect(contentBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x).toBeGreaterThanOrEqual(contentBox!.x + contentBox!.width - 2);
  await noOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(content).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(previewToggle).toHaveText("Náhľad");
  await previewToggle.click();
  await expect(preview).toBeVisible();
  await expect(content).toBeHidden();
  await expect(previewToggle).toHaveText("Späť na úpravy");
  await previewToggle.click();
  await expect(content).toBeVisible();
  await expect(preview).toBeHidden();
  await noOverflow(page);
});
