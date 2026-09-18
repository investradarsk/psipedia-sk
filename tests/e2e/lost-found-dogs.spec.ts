import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cases = [
  {
    type: "LOST",
    listPath: "/pomoc-psom/stratene-psy",
    detailPath: "/pomoc-psom/stratene-psy/strateny-e2e-rex-nitra",
    heading: "Stratené psy",
    detailHeading: "Rex",
  },
  {
    type: "FOUND",
    listPath: "/pomoc-psom/najdene-psy",
    detailPath: "/pomoc-psom/najdene-psy/najdeny-e2e-pes-nitra",
    heading: "Nájdené psy",
    detailHeading: "Pes bez známeho mena",
  },
] as const;

const privateValues = [
  "+421900000001",
  "+421900000002",
  "lost-e2e@example.invalid",
  "found-e2e@example.invalid",
  "e2e-admin@example.invalid",
  "Presná testovacia lokalita iba pre admina",
  "Neverejná E2E poznámka.",
];

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
}

async function expectPrivateValuesHidden(page: Page) {
  const body = page.locator("body");
  for (const value of privateValues) await expect(body).not.toContainText(value);
}

function screenshotMode(projectName: string) {
  return projectName.includes("mobile") ? "mobile" : "desktop";
}

for (const entry of cases) {
  test(`${entry.listPath}: renders active listing, filters, canonical and accessibility`, async ({ page }, testInfo) => {
    const response = await page.goto(entry.listPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${entry.listPath}`);
    await expect(page.locator('form[aria-label^="Filtrovať"]')).toBeVisible();
    await expect(page.getByLabel("Kraj")).toBeVisible();
    await expect(page.getByLabel("Okres alebo lokalita")).toBeVisible();
    await expect(page.getByLabel("Pohlavie")).toBeVisible();
    await expect(page.getByLabel("Veľkosť")).toBeVisible();
    await expect(page.getByLabel("Plemeno")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zobraziť hlásenie →" }).first()).toBeVisible();
    await expectPrivateValuesHidden(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    if (entry.type === "LOST") {
      await page.screenshot({ path: `.e2e-artifacts/lost-found/${screenshotMode(testInfo.project.name)}-listing.png`, fullPage: true });
    }
  });

  test(`${entry.detailPath}: renders public detail without private PII and passes accessibility`, async ({ page }, testInfo) => {
    const response = await page.goto(entry.detailPath, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: entry.detailHeading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://psipedia.sk${entry.detailPath}`);
    await expect(page.getByText(entry.type === "LOST" ? "STRATENÝ PES" : "NÁJDENÝ PES", { exact: true })).toBeVisible();
    await expect(page.getByText("Aktívne", { exact: true })).toBeVisible();
    if (entry.type === "LOST") await expect(page.getByText("Naposledy videný:", { exact: true })).toBeVisible();
    await expectPrivateValuesHidden(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    if (entry.type === "LOST") {
      await page.screenshot({ path: `.e2e-artifacts/lost-found/${screenshotMode(testInfo.project.name)}-detail.png`, fullPage: true });
    }
  });
}

test("admin lost-found dashboard is protected by the existing admin layer, paginated and accessible when empty", async ({ page }) => {
  const response = await page.goto("/admin/stratene-najdene?q=__e2e_no_match__", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Stratené a nájdené psy" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Čakajúce/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aktívne/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Vyriešené/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Expirované/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zamietnuté/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Zoznam hlásení" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("columnheader", { name: "Akcie" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test("authorized admin detail receives private contact fields from the private table", async ({ page }) => {
  const response = await page.goto("/admin/stratene-najdene/910001", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('input[type="email"]')).toHaveValue("lost-e2e@example.invalid");
  const inputValues = await page.locator("input").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(inputValues).toContain("+421900000001");
});


test("authenticated admin LOST/FOUND mutation contract covers create, edit, lifecycle, duplicate and archive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mutation contract runs once on desktop; mobile coverage remains read-only for overflow/accessibility.");

  const unique = `${Date.now()}-${testInfo.retry}`;
  const contactEmail = `lost-found-runtime-${unique}@example.invalid`;
  const basePayload = {
    type: "FOUND",
    slug: `najdeny-runtime-contract-${unique}`,
    dogName: "Runtime Contract",
    sex: "UNKNOWN",
    breedId: null,
    breed: "",
    breedUnknown: true,
    color: "čierna",
    approximateAge: "neznámy",
    size: "MEDIUM",
    description: "Testovacie hlásenie pre overenie LOST/FOUND runtime kontraktu.",
    distinguishingMarks: "",
    collarDescription: "",
    chipped: "UNKNOWN",
    mainImage: null,
    mainImageKey: null,
    gallery: [],
    eventDate: "2026-09-18",
    lastSeenDateTime: null,
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    locationDescription: "Izolovaná lokálna CI fixture.",
    publicLatitude: null,
    publicLongitude: null,
    publicLocationPrecision: "MUNICIPALITY",
    contactName: "Runtime Contract CI",
    contactPhone: "+421900000099",
    contactEmail,
    publicContactNote: "Kontakt sprostredkuje administrácia.",
    source: "EDITORIAL",
    sourceUrl: null,
    expiresAt: null,
    internalNote: "Neverejná runtime contract poznámka.",
  };

  const createResponse = await page.request.post("/api/admin/lost-found", {
    data: { ...basePayload, status: "DRAFT" },
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json() as { report: { id: number; status: string; contactEmail: string | null } };
  expect(created.report.status).toBe("DRAFT");
  expect(created.report.contactEmail).toBe(contactEmail);
  const reportId = created.report.id;

  const put = async (payload: Record<string, unknown>) => page.request.put(`/api/admin/lost-found/${reportId}`, {
    data: { ...basePayload, ...payload },
  });

  const pendingResponse = await put({ status: "PENDING" });
  expect(pendingResponse.status()).toBe(200);
  const pending = await pendingResponse.json() as { report: { status: string } };
  expect(pending.report.status).toBe("PENDING");

  const invalidResponse = await put({ status: "RESOLVED" });
  expect(invalidResponse.status()).toBe(400);
  const invalid = await invalidResponse.json() as { error?: string };
  expect(invalid.error).toContain("Nepovolený prechod stavu PENDING -> RESOLVED");

  const activeResponse = await put({ status: "ACTIVE" });
  expect(activeResponse.status()).toBe(200);
  const active = await activeResponse.json() as { report: { status: string; publishedAt: string | null; expiresAt: string | null } };
  expect(active.report.status).toBe("ACTIVE");
  expect(active.report.publishedAt).toBeTruthy();
  expect(active.report.expiresAt).toBeTruthy();

  const editedResponse = await put({ status: "ACTIVE", dogName: "Runtime Contract Edited" });
  expect(editedResponse.status()).toBe(200);
  const edited = await editedResponse.json() as { report: { status: string; dogName: string; contactEmail: string | null } };
  expect(edited.report.status).toBe("ACTIVE");
  expect(edited.report.dogName).toBe("Runtime Contract Edited");
  expect(edited.report.contactEmail).toBe(contactEmail);

  const resolvedResponse = await put({ status: "RESOLVED", dogName: "Runtime Contract Edited" });
  expect(resolvedResponse.status()).toBe(200);
  const resolved = await resolvedResponse.json() as { report: { status: string; resolvedAt: string | null } };
  expect(resolved.report.status).toBe("RESOLVED");
  expect(resolved.report.resolvedAt).toBeTruthy();

  const archivedResponse = await put({ status: "ARCHIVED", dogName: "Runtime Contract Edited" });
  expect(archivedResponse.status()).toBe(200);
  const archived = await archivedResponse.json() as { report: { status: string; archivedAt: string | null } };
  expect(archived.report.status).toBe("ARCHIVED");
  expect(archived.report.archivedAt).toBeTruthy();

  const canonicalCreate = await page.request.post("/api/admin/lost-found", {
    data: {
      ...basePayload,
      slug: `najdeny-runtime-canonical-${unique}`,
      dogName: "Runtime Canonical",
      contactEmail: `canonical-${unique}@example.invalid`,
      status: "DRAFT",
    },
  });
  expect(canonicalCreate.status()).toBe(201);
  const canonical = await canonicalCreate.json() as { report: { id: number } };

  const duplicateCreate = await page.request.post("/api/admin/lost-found", {
    data: {
      ...basePayload,
      slug: `najdeny-runtime-duplicate-${unique}`,
      dogName: "Runtime Duplicate",
      contactEmail: `duplicate-${unique}@example.invalid`,
      status: "DRAFT",
    },
  });
  expect(duplicateCreate.status()).toBe(201);
  const duplicate = await duplicateCreate.json() as { report: { id: number } };

  const duplicateResponse = await page.request.post(`/api/admin/lost-found/${duplicate.report.id}/duplicate`, {
    data: {
      duplicateOfId: canonical.report.id,
      duplicateReason: "CI regression duplicate",
    },
  });
  expect(duplicateResponse.status()).toBe(200);
  const duplicateResult = await duplicateResponse.json() as {
    report: { status: string; duplicateOfId: number | null; duplicateReason: string; archivedAt: string | null };
  };
  expect(duplicateResult.report.status).toBe("ARCHIVED");
  expect(duplicateResult.report.duplicateOfId).toBe(canonical.report.id);
  expect(duplicateResult.report.duplicateReason).toBe("CI regression duplicate");
  expect(duplicateResult.report.archivedAt).toBeTruthy();
});
