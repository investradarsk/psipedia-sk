import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";
const WHITE_SWISS_LOCAL_IMAGE = "/images/e2e-biely-svajciarsky-ovciak.png";

const REPRESENTATIVE_BREEDS = [
  { slug: "biely-svajciarsky-ovciak", name: "Biely švajčiarsky ovčiak" },
  { slug: "burgosky-stavac", name: "Burgoský stavač" },
  { slug: "jazvecik", name: "Jazvečík" },
  { slug: "anglicky-mastif", name: "Anglický mastif" },
  { slug: "dansko-svedsky-farmarsky-pes", name: "Dánsko-švédsky farmársky pes" },
] as const;

async function useNecessaryCookies(page: Page) {
  await page.addInitScript(([key]) => localStorage.setItem(key, "necessary"), [CONSENT_KEY]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, `${label}: horizontal overflow ${dimensions.scroll}px > ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectAxeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  const details = violations.map((item) =>
    `${item.id} (${item.impact}): ${item.help}\n${item.nodes.slice(0, 5).map((node) => `  ${node.target.join(" ")} – ${node.failureSummary ?? "failed"}`).join("\n")}`
  ).join("\n\n");
  expect(violations, `${label} accessibility violations:\n${details}`).toEqual([]);
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

test.beforeEach(async ({ page }) => useNecessaryCookies(page));

test("breed atlas: compact header, legacy energy normalization, filters and compare flow work", async ({ page }) => {
  await page.goto("/plemena");
  await expect(page.getByRole("heading", { level: 1, name: "Plemená" })).toBeVisible();
  const compareCta = page.getByRole("link", { name: "Porovnať plemená" });
  await expect(compareCta).toBeVisible();
  await expect(compareCta).toHaveAttribute("href", "/porovnat-plemena");
  await expect(page.getByRole("button", { name: "Pokojnejšie" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aktívne" })).toHaveCount(0);
  const baselineCount = (await page.locator(".result-count").textContent())?.trim();

  await page.goto("/plemena?energy=active");
  await expect(page).toHaveURL(/\/plemena$/);
  await expect(page.locator(".result-count")).toHaveText(baselineCount ?? "");
  await expect(page.getByRole("button", { name: "Pokojnejšie" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aktívne" })).toHaveCount(0);

  const search = page.getByPlaceholder("Hľadať plemeno, krajinu alebo FCI skupinu");
  await search.fill("labrador");
  await expect(page.locator(".breed-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=labrador/);
  await search.fill("");

  const origin = page.locator(".breed-origin-filter select");
  await origin.selectOption({ index: 1 });
  await expect(page).toHaveURL(/origin=/);
  expect(await page.locator(".breed-card").count()).toBeGreaterThan(0);
  await origin.selectOption("all");

  const groupEight = page.getByRole("button", { name: /FCI skupina 8:/ });
  await groupEight.click();
  await expect(page).toHaveURL(/fciGroup=8/);
  const section = page.locator(".fci-section-filter select");
  await expect(section).toBeEnabled();
  if (await section.locator("option").count() > 1) {
    await section.selectOption({ index: 1 });
    await expect(page).toHaveURL(/fciSection=/);
  }
  await expectNoHorizontalOverflow(page, "Breed atlas desktop/mobile");
  await expectAxeClean(page, "Breed atlas");

  await compareCta.click();
  await expect(page).toHaveURL(/\/porovnat-plemena$/);
  const first = page.getByLabel("Prvé plemeno");
  const second = page.getByLabel("Druhé plemeno");
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const firstValue = await first.inputValue();
  await expect(second.locator(`option[value="${firstValue}"]`)).toBeDisabled();
  const beforeFirstValue = await first.inputValue();
  const beforeSecondValue = await second.inputValue();
  await page.getByRole("button", { name: "Vymeniť poradie plemien" }).click();
  await expect(first).toHaveValue(beforeSecondValue);
  await expect(second).toHaveValue(beforeFirstValue);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page, "Breed compare at 390px");
});

test("breed profile: representative canonical details return 200, keep canonical metadata and avoid layout overflow", async ({ page }) => {
  for (const breed of REPRESENTATIVE_BREEDS) {
    const path = `/plemena/${breed.slug}`;
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} did not return 200`).toBe(200);
    await expect(page.locator("h1")).toContainText(breed.name);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${path}`);
    await expectNoHorizontalOverflow(page, path);

    const identity = page.getByTestId("breed-hero-identity");
    const photo = page.getByTestId("breed-hero-photo");
    await expect(identity).toBeVisible();
    await expect(photo).toBeVisible();
    const [identityBox, photoBox] = await Promise.all([identity.boundingBox(), photo.boundingBox()]);
    expect(identityBox, `${path}: identity box unavailable`).not.toBeNull();
    expect(photoBox, `${path}: photo box unavailable`).not.toBeNull();
    expect(boxesOverlap(identityBox!, photoBox!), `${path}: hero identity overlaps photo`).toBe(false);

    const lead = page.getByTestId("breed-hero-lead");
    if (await lead.count()) {
      const leadBox = await lead.boundingBox();
      expect(leadBox, `${path}: lead box unavailable`).not.toBeNull();
      expect(boxesOverlap(leadBox!, photoBox!), `${path}: hero lead overlaps photo`).toBe(false);
    }
  }
});

test("breed profile: White Swiss uses a visible, decoded real image and not the fallback", async ({ request, page }) => {
  const path = "/plemena/biely-svajciarsky-ovciak";
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  const html = await response.text();
  const imageTag = html.match(/<img\b[^>]*data-testid="breed-hero-image"[^>]*>/i)?.[0] ?? "";
  expect(imageTag, "White Swiss Shepherd must SSR a real breed image").not.toBe("");
  expect(imageTag).toContain(WHITE_SWISS_LOCAL_IMAGE);

  const navigation = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(navigation?.status()).toBe(200);
  const frame = page.getByTestId("breed-hero-photo");
  const image = page.getByTestId("breed-hero-image");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("data-image-fallback", "breed-photo");
  await expect(image).toBeVisible();
  await expect(frame.locator('[role="img"]:not(img)')).toHaveCount(0);

  await image.evaluate(async (element) => {
    const img = element as HTMLImageElement;
    if (!img.complete) {
      await new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    }
    if (typeof img.decode === "function") {
      await img.decode().catch(() => undefined);
    }
  });

  const state = await image.evaluate((element) => {
    const img = element as HTMLImageElement;
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      currentSrc: img.currentSrc || img.src,
    };
  });
  expect(state.complete, "White Swiss image did not finish loading").toBe(true);
  expect(state.naturalWidth, "White Swiss image is broken (naturalWidth=0)").toBeGreaterThan(0);
  expect(state.naturalHeight, "White Swiss image is broken (naturalHeight=0)").toBeGreaterThan(0);
  expect(state.currentSrc, "White Swiss must use the real CI image fixture").toContain(WHITE_SWISS_LOCAL_IMAGE);
});

test("breed profile: quick facts stay dense for rich data and collapse cleanly for sparse data", async ({ page }) => {
  await page.goto("/plemena/biely-svajciarsky-ovciak");
  const denseFacts = page.getByTestId("breed-quick-facts").locator(":scope > div");
  const denseCount = await denseFacts.count();
  expect(denseCount, "White Swiss Shepherd should expose a dense fact row").toBeGreaterThanOrEqual(5);

  await page.goto("/plemena/burgosky-stavac");
  const sparseGrid = page.getByTestId("breed-quick-facts");
  const sparseFacts = sparseGrid.locator(":scope > div");
  const sparseCount = await sparseFacts.count();
  expect(sparseCount, "Burgos Pointer should still expose known facts").toBeGreaterThan(0);
  expect(sparseCount, "Sparse facts must not reserve empty slots").toBeLessThan(denseCount);

  for (let index = 0; index < sparseCount; index += 1) {
    await expect(sparseFacts.nth(index).locator("dt")).not.toHaveText("");
    await expect(sparseFacts.nth(index).locator("dd")).not.toHaveText("");
  }
});

test("breed profile: suitability, accessible accordion controls and normalized sports work", async ({ page }) => {
  await page.goto("/plemena/biely-svajciarsky-ovciak");

  const fit = page.getByTestId("breed-fit");
  await expect(fit.getByRole("heading", { name: "Hodí sa pre" })).toBeVisible();
  await expect(fit.getByRole("heading", { name: "Treba zvážiť" })).toBeVisible();

  const movement = page.getByRole("button", { name: /Pohyb a každodenný život/ });
  await expect(movement).toHaveAttribute("aria-expanded", "false");
  await movement.click();
  await expect(movement).toHaveAttribute("aria-expanded", "true");
  const panelId = await movement.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(page.locator(`#${panelId}`)).toBeVisible();
  await movement.click();
  await expect(movement).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`#${panelId}`)).toBeHidden();

  await movement.focus();
  await page.keyboard.press("Enter");
  await expect(movement).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(movement).toHaveAttribute("aria-expanded", "false");

  const sportKeys = await page.locator("[data-sport-key]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-sport-key")).filter((value): value is string => Boolean(value)),
  );
  expect(sportKeys.length, "Expected at least one normalized sport").toBeGreaterThan(0);
  expect(new Set(sportKeys).size, `Duplicate normalized sport keys: ${sportKeys.join(", ")}`).toBe(sportKeys.length);
});

test("breed profile: sticky section navigation, no-crop media, useful cards and accessibility work", async ({ page }) => {
  await page.goto("/plemena/biely-svajciarsky-ovciak");
  const nav = page.getByRole("navigation", { name: "Navigácia v profile plemena" });
  await expect(nav).toBeVisible();

  const position = await nav.evaluate((element) => getComputedStyle(element).position);
  expect(position).toBe("sticky");
  const expectedTop = (page.viewportSize()?.width ?? 0) <= 820 ? "68px" : "76px";
  expect(await nav.evaluate((element) => getComputedStyle(element).top)).toBe(expectedTop);

  const image = page.getByTestId("breed-hero-image");
  await expect(image).toBeVisible();
  expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe("contain");
  expect(await image.evaluate((element) => getComputedStyle(element).objectPosition)).toContain("50%");

  const fciLink = nav.getByRole("link", { name: "FCI", exact: true });
  await fciLink.focus();
  await expect(fciLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#fci$/);
  await expect(page.locator("#fci")).toBeVisible();
  await expect(fciLink).toHaveAttribute("aria-current", "location");

  const sportsLink = nav.getByRole("link", { name: "Športy", exact: true });
  if (await sportsLink.count()) {
    await page.locator("#sporty").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await expect(sportsLink).toHaveAttribute("aria-current", "location");
  }

  for (const href of [
    "/adresar/chovatelske-kluby",
    "/adresar/chovatelske-stanice",
    "/adresar/kynologicke-kluby",
  ]) {
    await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await expect(page.locator('a[href^="/adresar/treneri?breed="]')).toBeVisible();
  await expectNoHorizontalOverflow(page, "Breed profile sticky navigation");
  await expectAxeClean(page, "Breed profile");

  await page.goto("/plemena/nova-scotia-duck-tolling-retriever");
  await expect(page.getByText("Fotografia sa pripravuje", { exact: true })).toBeVisible();
});

test("breed profile: FCI CTA opens the production standard with seven adaptive groups and global controls", async ({ page }) => {
  await page.goto("/plemena/biely-svajciarsky-ovciak");
  const cta = page.getByTestId("breed-fci-cta");
  await expect(cta).toHaveAttribute("href", "/plemena/biely-svajciarsky-ovciak/fci-standard");

  const response = await page.goto("/plemena/biely-svajciarsky-ovciak/fci-standard", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  await expectNoHorizontalOverflow(page, "White Swiss FCI standard");

  const groups = page.locator("[data-fci-group]");
  await expect(groups).toHaveCount(7);
  const triggers = page.locator("[data-fci-trigger]");
  await expect(triggers).toHaveCount(7);
  await expect(triggers.first()).toHaveAttribute("aria-expanded", "true");
  for (let index = 1; index < await triggers.count(); index += 1) {
    await expect(triggers.nth(index)).toHaveAttribute("aria-expanded", "false");
  }

  const subsections = page.locator("[data-fci-subsection]");
  const subsectionCount = await subsections.count();
  expect(subsectionCount).toBeGreaterThan(0);
  for (let index = 0; index < subsectionCount; index += 1) {
    const subsection = subsections.nth(index);
    expect((await subsection.textContent())?.trim(), `FCI subsection ${index} is empty`).toBeTruthy();
    expect(await subsection.locator("p, dl").count(), `FCI subsection ${index} has no content element`).toBeGreaterThan(0);
  }

  await page.getByTestId("fci-expand-all").click();
  for (let index = 0; index < await triggers.count(); index += 1) {
    await expect(triggers.nth(index)).toHaveAttribute("aria-expanded", "true");
  }
  await page.getByTestId("fci-collapse-all").click();
  for (let index = 0; index < await triggers.count(); index += 1) {
    await expect(triggers.nth(index)).toHaveAttribute("aria-expanded", "false");
  }

  const sidebar = page.getByTestId("fci-sidebar");
  const viewport = page.viewportSize();
  if ((viewport?.width ?? 0) > 900) {
    await expect(sidebar).toBeVisible();
    expect(await sidebar.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  } else {
    await expect(sidebar).toBeHidden();
  }
});

test("breed profile: sparse FCI content never renders empty groups or subsections", async ({ page }) => {
  const response = await page.goto("/plemena/burgosky-stavac/fci-standard", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expectNoHorizontalOverflow(page, "Burgos FCI standard");
  const groups = page.locator("[data-fci-group]");
  const groupCount = await groups.count();
  expect(groupCount, "Sparse FCI page should expose only available groups").toBeGreaterThan(0);
  expect(groupCount).toBeLessThanOrEqual(7);

  const subsections = page.locator("[data-fci-subsection]");
  const subsectionCount = await subsections.count();
  expect(subsectionCount).toBeGreaterThan(0);
  for (let index = 0; index < subsectionCount; index += 1) {
    expect((await subsections.nth(index).textContent())?.trim(), `Sparse FCI subsection ${index} is empty`).toBeTruthy();
  }
});
