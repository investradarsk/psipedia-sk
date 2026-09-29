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


async function installLostFoundTurnstileMock(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { turnstile: unknown }).turnstile = {
      render(_container: HTMLElement, options: Record<string, unknown>) {
        const callback = options.callback as ((token: string) => void) | undefined;
        queueMicrotask(() => callback?.("e2e-lost-found-turnstile"));
        return "lost-found-e2e-widget";
      },
      remove() {},
    };
  });
}

function publicReportMultipart(name: string, email: string, overrides: Record<string, string> = {}) {
  return {
    type: "FOUND",
    dogName: name,
    sex: "UNKNOWN",
    breed: "",
    breedUnknown: "1",
    color: "čierna",
    approximateAge: "neznámy",
    size: "MEDIUM",
    description: "Lokálne E2E hlásenie nájdeného psa určené iba na overenie bezpečného moderation flow.",
    distinguishingMarks: "Biela škvrna na hrudi.",
    collarDescription: "Bez obojka.",
    chipped: "UNKNOWN",
    eventDate: "2026-09-29",
    lastSeenDateTime: "",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    locationDescription: "Približne pri mestskom parku.",
    contactName: "E2E Public Reporter",
    contactPhone: "+421900123456",
    contactEmail: email,
    website: "",
    turnstileToken: "e2e-lost-found-turnstile",
    ...overrides,
  };
}

async function postPublicReport(page: Page, name: string, email: string, overrides: Record<string, string> = {}) {
  return page.request.post("/api/lost-found/submissions", {
    headers: { origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
    multipart: publicReportMultipart(name, email, overrides),
  });
}

async function adminReportHref(page: Page, name: string) {
  await page.goto("/admin/stratene-najdene?q=" + encodeURIComponent(name), { waitUntil: "domcontentloaded" });
  const row = page.locator("tr").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  const href = await row.locator('a[href^="/admin/stratene-najdene/"]').first().getAttribute("href");
  expect(href).toMatch(/^\/admin\/stratene-najdene\/\d+$/);
  return href as string;
}

test("public submission form is accessible and mobile-safe at 390 px", async ({ page }, testInfo) => {
  if (testInfo.project.name.includes("mobile")) await page.setViewportSize({ width: 390, height: 844 });
  await installLostFoundTurnstileMock(page);
  const response = await page.goto("/pomoc-psom/stratene-a-najdene/nahlasit", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Nahlásiť strateného alebo nájdeného psa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odoslať hlásenie" })).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
});

test("valid public submission stays private until admin approval, then publishes without contact PII", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Canonical write lifecycle runs once on desktop.");
  await installLostFoundTurnstileMock(page);
  const unique = "Public Found " + Date.now() + "-" + testInfo.retry;
  const email = "public-found-" + Date.now() + "@example.invalid";
  const phone = "+421900123456";

  await page.goto("/pomoc-psom/stratene-a-najdene/nahlasit", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Typ hlásenia *").selectOption("FOUND");
  await page.locator('input[name="dogName"]').fill(unique);
  await page.getByLabel("Dátum udalosti").fill("2026-09-29");
  await page.getByLabel("Popis *").fill("Nájdený pes pri mestskom parku. Pokojný, čierny a dobre socializovaný.");
  await page.getByLabel("Kraj *").selectOption("Nitriansky kraj");
  await page.getByLabel("Obec alebo mesto *").fill("Nitra");
  await page.getByLabel("Približné miesto").fill("Okolie mestského parku.");
  await page.locator('input[name="contactPhone"]').fill(phone);
  await page.locator('input[name="contactEmail"]').fill(email);

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/lost-found/submissions") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Odoslať hlásenie" }).click();
  const submitResponse = await responsePromise;
  expect(submitResponse.status()).toBe(201);
  const payload = await submitResponse.json() as Record<string, unknown>;
  expect(payload.success).toBe(true);
  expect(payload).not.toHaveProperty("status");
  expect(payload).not.toHaveProperty("reportId");
  expect(payload).not.toHaveProperty("id");
  await expect(page.getByRole("heading", { level: 1, name: "Hlásenie sme prijali" })).toBeVisible();

  await page.goto("/pomoc-psom/najdene-psy?q=" + encodeURIComponent(unique), { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(unique);

  const adminHref = await adminReportHref(page, unique);
  await page.goto(adminHref, { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[type="email"]')).toHaveValue(email);
  const inputValues = await page.locator("input").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(inputValues).toContain(phone);

  const approveResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/lost-found/") && response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "Publikovať ako aktívne" }).click();
  expect((await approveResponse).status()).toBe(200);
  await expect(page.getByText("Hlásenie je aktívne a verejné.")).toBeVisible();

  const publicLink = page.getByRole("link", { name: /Verejný náhľad/ });
  await expect(publicLink).toBeVisible();
  const publicHref = await publicLink.getAttribute("href");
  expect(publicHref).toMatch(/^\/pomoc-psom\/najdene-psy\//);

  await page.goto(publicHref as string, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: unique })).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(email);
  expect(html).not.toContain(phone);
  const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(schema.join("\n")).not.toContain(email);
  expect(schema.join("\n")).not.toContain(phone);
});

test("public invalid, honeypot and rate-limited submissions fail safely without technical leakage", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Mutation abuse controls run once on desktop.");
  const stamp = String(Date.now());

  const invalid = await postPublicReport(page, "Invalid Future " + stamp, "invalid-" + stamp + "@example.invalid", { eventDate: "2999-01-01" });
  expect(invalid.status()).toBe(422);
  const invalidBody = await invalid.json() as { error?: string };
  expect(invalidBody.error).toMatch(/budúcnosti|dátum/i);
  expect(JSON.stringify(invalidBody)).not.toMatch(/SQL|D1|stack|PENDING/i);

  const spamName = "Honeypot " + stamp;
  const spam = await page.request.post("/api/lost-found/submissions", {
    headers: { origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
    multipart: { website: "https://spam.invalid/" + stamp },
  });
  expect(spam.status()).toBe(201);
  await page.goto("/admin/stratene-najdene?q=" + encodeURIComponent(spamName), { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(spamName);

  const rateName = "Rate Limit " + stamp;
  const rateEmail = "rate-" + stamp + "@example.invalid";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await postPublicReport(page, rateName, rateEmail);
    expect(response.status(), "attempt " + attempt).toBe(201);
  }
  const limited = await postPublicReport(page, rateName, rateEmail);
  expect(limited.status()).toBe(429);
  const limitedBody = await limited.json() as { error?: string };
  expect(limitedBody.error).toMatch(/priveľa/i);

  await page.goto("/admin/stratene-najdene?q=" + encodeURIComponent(rateName), { waitUntil: "domcontentloaded" });
  const rows = page.locator("tr").filter({ hasText: rateName });
  await expect(rows).toHaveCount(1);
});

test("admin can reject a public submission and it never becomes public", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Canonical rejection lifecycle runs once on desktop.");
  const stamp = String(Date.now());
  const name = "Rejected Found " + stamp;
  const email = "rejected-" + stamp + "@example.invalid";
  const submitted = await postPublicReport(page, name, email);
  expect(submitted.status()).toBe(201);

  const adminHref = await adminReportHref(page, name);
  await page.goto(adminHref, { waitUntil: "domcontentloaded" });
  const rejectResponse = page.waitForResponse((response) =>
    response.url().includes("/api/admin/lost-found/") && response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "Zamietnuť" }).click();
  expect((await rejectResponse).status()).toBe(200);
  await expect(page.getByText("Hlásenie bolo uložené.")).toBeVisible();

  await page.goto("/pomoc-psom/najdene-psy?q=" + encodeURIComponent(name), { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(name);
});
