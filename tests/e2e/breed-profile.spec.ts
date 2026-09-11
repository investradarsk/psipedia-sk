import { expect, test, type Page } from "@playwright/test";

const CONSENT_KEY = "psipedia-cookie-consent";

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

test("breed profile: a stored breed image is rendered as a real image source with fallback protection", async ({ request, page }) => {
  const path = "/plemena/biely-svajciarsky-ovciak";
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  const html = await response.text();
  const imageTag = html.match(/<img\b[^>]*data-testid="breed-hero-image"[^>]*>/i)?.[0] ?? "";
  expect(imageTag, "White Swiss Shepherd must SSR a real breed image").not.toBe("");
  expect(imageTag).toMatch(/\bsrc="(?:\/media\/|\/images\/|https?:\/\/)[^"]+"/i);

  await page.goto(path);
  const frame = page.getByTestId("breed-hero-photo");
  await expect(frame).toHaveAttribute("data-image-fallback", "breed-photo");
  await expect(frame.getByRole("img")).toHaveCount(1);
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

test("breed profile: suitability, accessible accordion keyboard controls and normalized sports work", async ({ page }) => {
  await page.goto("/plemena/biely-svajciarsky-ovciak");

  const fit = page.getByTestId("breed-fit");
  await expect(fit.getByRole("heading", { name: "Hodí sa pre" })).toBeVisible();
  await expect(fit.getByRole("heading", { name: "Treba zvážiť" })).toBeVisible();

  const movement = page.getByRole("button", { name: /Pohyb a každodenný život/ });
  await expect(movement).toHaveAttribute("aria-expanded", "false");
  await movement.focus();
  await page.keyboard.press("Enter");
  await expect(movement).toHaveAttribute("aria-expanded", "true");
  const panelId = await movement.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await expect(page.locator(`#${panelId}`)).toBeVisible();

  await page.keyboard.press("Space");
  await expect(movement).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`#${panelId}`)).toBeHidden();

  const sportKeys = await page.locator("[data-sport-key]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-sport-key")).filter((value): value is string => Boolean(value)),
  );
  expect(sportKeys.length, "Expected at least one normalized sport").toBeGreaterThan(0);
  expect(new Set(sportKeys).size, `Duplicate normalized sport keys: ${sportKeys.join(", ")}`).toBe(sportKeys.length);
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
