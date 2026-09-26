import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const GOOGLE_CONSENT = "psipedia-google-maps-consent";
const COOKIE_CONSENT = "psipedia-cookie-consent";

async function setViewport(page: Page, projectName: string) {
  await page.setViewportSize(
    projectName.includes("mobile")
      ? { width: 390, height: 844 }
      : { width: 1440, height: 960 },
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectNoSeriousAxe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "necessary"), COOKIE_CONSENT);
});

test.describe("PUBLIC-MAPS-1 canonical detail maps", () => {
  test("Directory exact GEO is consent-gated, coordinate-only and uses one embedded map instance", async ({ page }, testInfo) => {
    await setViewport(page, testInfo.project.name);
    const apiMapRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/map") apiMapRequests.push(request.url());
    });

    await page.goto("/adresar/veterinari/map-e2e-vet-a", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Veterina A" })).toBeVisible();
    const map = page.getByTestId("public-location-map");
    await expect(map.getByRole("heading", { name: "Kde nás nájdete" })).toBeVisible();
    await expect(page.getByTestId("detail-map-consent-gate")).toBeVisible();
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);

    await page.getByRole("button", { name: "Povoliť Google Maps" }).click();
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();
    await expect(page.getByTestId("marker-service:991001")).toBeVisible();
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-init-count", "1");

    await page.getByRole("button", { name: "Satelit" }).click();
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-type", "hybrid");
    await page.getByRole("button", { name: "Mapa", exact: true }).click();
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-type", "roadmap");

    const google = map.getByRole("link", { name: "Otvoriť v Google Maps" });
    const navigate = map.getByRole("link", { name: "Navigovať" });
    await expect(google).toHaveAttribute("href", /query=48\.306%2C18\.086/);
    await expect(navigate).toHaveAttribute("href", /destination=48\.306%2C18\.086/);
    expect(apiMapRequests).toEqual([]);
    await expect(page.locator("script[data-psipedia-google-maps]")).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), GOOGLE_CONSENT)).toBe("granted");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxe(page);
  });

  test("Directory without safe exact GEO remains usable and omits the map section", async ({ page }, testInfo) => {
    await setViewport(page, testInfo.project.name);
    await page.goto("/adresar/chovatelske-stanice/map-e2e-breeder", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Chovateľská stanica" })).toBeVisible();
    await expect(page.getByTestId("public-location-map")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("Organization renders multiple public locations and approximate location has no Navigate", async ({ page }, testInfo) => {
    await setViewport(page, testInfo.project.name);
    await page.addInitScript((key) => localStorage.setItem(key, "granted"), GOOGLE_CONSENT);
    await page.goto("/organizacie/map-e2e-multi-site-org", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Multi Site Org" })).toBeVisible();
    const map = page.getByTestId("public-location-map");
    await expect(map).toBeVisible();
    await expect(page.getByTestId("map-test-renderer")).toBeVisible();
    await expect(page.getByTestId("marker-organization:991101:location:991111")).toBeVisible();
    await expect(page.getByTestId("marker-organization:991101:location:991112")).toBeVisible();
    await expect(map.getByText("Približná poloha")).toBeVisible();
    await expect(map).not.toContainText("Neverejná service-area 8");

    const serviceArea = map.getByRole("button", { name: /Oblasť pôsobenia.*Šaľa.*Približná poloha/ });
    await serviceArea.click();
    await expect(serviceArea).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("marker-organization:991101:location:991112")).toHaveAttribute("aria-pressed", "true");
    await expect(map.getByRole("link", { name: "Otvoriť približnú polohu v Google Maps" })).toBeVisible();
    await expect(map.getByRole("link", { name: "Navigovať" })).toHaveCount(0);
    await expect(page.getByTestId("map-test-renderer")).toHaveAttribute("data-map-init-count", "1");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxe(page);
  });

  test("Physical event renders approved map while online and cancelled events do not", async ({ page }, testInfo) => {
    await setViewport(page, testInfo.project.name);
    await page.addInitScript((key) => localStorage.setItem(key, "granted"), GOOGLE_CONSENT);

    await page.goto("/podujatia/map-e2e-upcoming-event", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Budúca výstava" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Miesto podujatia" })).toBeVisible();
    await expect(page.getByTestId("marker-event:991200")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAxe(page);

    await page.goto("/podujatia/map-e2e-online-event", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Online podujatie" })).toBeVisible();
    await expect(page.getByTestId("public-location-map")).toHaveCount(0);

    await page.goto("/podujatia/map-e2e-cancelled-event", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "MAP E2E Zrušené podujatie" })).toBeVisible();
    await expect(page.getByTestId("public-location-map")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
