import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAxeClean(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  expect(violations, violations.map((item) => item.id + ": " + item.help).join("\n")).toEqual([]);
}

const origin = "http://localhost:5173";
const mutationHeaders = {
  origin,
  "content-type": "application/json",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

test("automation source management is responsive and axe-clean on admin desktop/mobile projects", async ({ page }) => {
  const response = await page.goto("/admin/automatizacie/zdroje", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "Zdroje a discovery", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prehľad automatizácií", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Čaká na tvoje rozhodnutie", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monitorované zdroje", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automatické hľadanie nových zdrojov", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});

test("manual source lifecycle covers create edit review enable test run-now and disable", async ({ page, request }, testInfo) => {
  const suffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const sourceKey = ("e2e-manual-" + suffix).slice(0, 70);
  const label = "E2E Manual " + testInfo.project.name;
  const source = {
    sourceKey,
    label,
    entityType: "DIRECTORY",
    connectorType: "MANUAL_IMPORT",
    sourceUrl: "",
    cadenceMinutes: 1440,
    throttleMs: 1000,
    timeoutMs: 8000,
    retryMaxAttempts: 2,
    retryBackoffMs: 1000,
    maxRecordsPerRun: 100,
    config: {},
  };

  const unauthorized = await request.post("/api/admin/automation-sources", {
    data: source,
    headers: { "content-type": "application/json" },
  });
  expect(unauthorized.status()).toBe(403);

  const createdResponse = await request.post("/api/admin/automation-sources", {
    data: source,
    headers: mutationHeaders,
  });
  expect(createdResponse.status()).toBe(201);
  const createdPayload = await createdResponse.json() as { source: { id: number; enabled: boolean; reviewStatus: string } };
  const id = createdPayload.source.id;
  expect(createdPayload.source.enabled).toBe(false);
  expect(createdPayload.source.reviewStatus).toBe("PENDING");

  const editedLabel = label + " edited";
  const saveResponse = await request.put(`/api/admin/automation-sources/${id}`, {
    data: { action: "save", source: { ...source, label: editedLabel } },
    headers: mutationHeaders,
  });
  expect(saveResponse.ok()).toBe(true);
  const saved = await saveResponse.json() as { source: { label: string; enabled: boolean; reviewStatus: string } };
  expect(saved.source.label).toBe(editedLabel);
  expect(saved.source.enabled).toBe(false);
  expect(saved.source.reviewStatus).toBe("PENDING");

  const approveResponse = await request.put(`/api/admin/automation-sources/${id}`, {
    data: { action: "approve", notes: "E2E explicit source review" },
    headers: mutationHeaders,
  });
  expect(approveResponse.ok()).toBe(true);
  const approved = await approveResponse.json() as { source: { reviewStatus: string; enabled: boolean } };
  expect(approved.source.reviewStatus).toBe("APPROVED");
  expect(approved.source.enabled).toBe(false);

  const enableResponse = await request.put(`/api/admin/automation-sources/${id}`, {
    data: { action: "enable" },
    headers: mutationHeaders,
  });
  expect(enableResponse.ok()).toBe(true);
  const enabled = await enableResponse.json() as { source: { enabled: boolean; reviewStatus: string } };
  expect(enabled.source.enabled).toBe(true);
  expect(enabled.source.reviewStatus).toBe("APPROVED");

  const previewResponse = await request.post(`/api/admin/automation-sources/${id}/test`, {
    data: {},
    headers: mutationHeaders,
  });
  expect(previewResponse.ok()).toBe(true);
  const preview = await previewResponse.json() as {
    preview: {
      ok: boolean;
      recordsFound: number;
      recordsNormalized: number;
      writes: { observations: number; findings: number; canonical: number; publications: number };
    };
  };
  expect(preview.preview.ok).toBe(true);
  expect(preview.preview.recordsFound).toBe(0);
  expect(preview.preview.recordsNormalized).toBe(0);
  expect(preview.preview.writes).toEqual({ observations: 0, findings: 0, canonical: 0, publications: 0 });

  const runResponse = await request.post(`/api/admin/automation-sources/${id}/run`, {
    data: {},
    headers: mutationHeaders,
  });
  expect(runResponse.status()).toBe(202);
  const run = await runResponse.json() as {
    accepted: boolean;
    run: { status: string };
    safety: { canonicalWrite: boolean; publication: boolean };
  };
  expect(run.accepted).toBe(true);
  expect(run.run.status).toBe("RUNNING");
  expect(run.safety).toEqual({ canonicalWrite: false, publication: false });

  let completedRun: { status: string | null; checked: number; newFindings: number; updatedFindings: number; errors: number } | null = null;
  await expect.poll(async () => {
    const statusResponse = await request.get(`/api/admin/automation-sources/${id}/run`);
    expect(statusResponse.ok()).toBe(true);
    const payload = await statusResponse.json() as {
      run: { status: string | null; checked: number; newFindings: number; updatedFindings: number; errors: number };
    };
    completedRun = payload.run;
    return payload.run.status;
  }, {
    message: "background source run should complete",
    timeout: 10_000,
    intervals: [50, 100, 200, 500],
  }).toBe("SUCCESS");
  expect(completedRun).toMatchObject({
    status: "SUCCESS",
    checked: 0,
    newFindings: 0,
    updatedFindings: 0,
    errors: 0,
  });

  const disableResponse = await request.put(`/api/admin/automation-sources/${id}`, {
    data: { action: "disable" },
    headers: mutationHeaders,
  });
  expect(disableResponse.ok()).toBe(true);
  const disabled = await disableResponse.json() as { source: { enabled: boolean; reviewStatus: string } };
  expect(disabled.source.enabled).toBe(false);
  expect(disabled.source.reviewStatus).toBe("APPROVED");

  const detailResponse = await page.goto(`/admin/automatizacie/zdroje/${id}`, { waitUntil: "domcontentloaded" });
  expect(detailResponse?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: editedLabel, exact: true })).toBeVisible();
  await expect(page.getByText("Schválený", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Vypnutý", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("SUCCESS", { exact: true }).first()).toBeVisible();

  const testSourceButton = page.getByRole("button", { name: "Otestovať zdroj", exact: true });
  await expect(testSourceButton).toBeVisible();
  const buttonStyle = await testSourceButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      minHeight: Number.parseFloat(style.minHeight),
      borderWidth: Number.parseFloat(style.borderTopWidth),
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      cursor: style.cursor,
    };
  });
  expect(["inline-flex", "flex"]).toContain(buttonStyle.display);
  expect(buttonStyle.minHeight).toBeGreaterThanOrEqual(44);
  expect(buttonStyle.borderWidth).toBeGreaterThan(0);
  expect(buttonStyle.borderRadius).toBeGreaterThanOrEqual(8);
  expect(buttonStyle.cursor).toBe("pointer");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);
});
