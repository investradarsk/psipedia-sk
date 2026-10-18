import { expect, test } from "@playwright/test";

// Variant B screenshots exercise the real rendered page with mocked read-only
// category responses. No external Notion, D1 production or paid Gemini calls.
test("Gemini V4 all concepts: 22 categories, 3 sections and compact mobile rows", async ({ page }, testInfo) => {
  const widths = testInfo.project.name === "mobile-chromium" ? [390, 320] : [1440];
  const calls: string[] = [];
  let writes = 0;
  const examples: Record<string, Record<string, unknown>[]> = {
    "directory.veterinari": [{
      id: "00000000-0000-4000-8000-000000000011",
      name: "E2E veterinárna ambulancia", city: "Nitra",
      lastEditedAt: "2026-10-17T11:00:00Z", reviewState: "NEW",
      psipediaId: "", canonicalVerified: false,
    }],
    "events.vystavy": [{
      id: "00000000-0000-4000-8000-000000000022",
      name: "E2E výstava psov", city: "Trnava",
      lastEditedAt: "2026-10-17T12:00:00Z", reviewState: "IMPORTED",
      agenda: "events", psipediaId: "321", canonicalVerified: true,
    }],
    "help.utulky": [{
      id: "00000000-0000-4000-8000-000000000033",
      name: "E2E útulok", city: "Bratislava",
      lastEditedAt: "2026-10-17T13:00:00Z", reviewState: "IN_PROGRESS",
      agenda: "organizations", psipediaId: "", canonicalVerified: false,
    }],
  };

  await page.route(/\/api\/admin\/gemini-automation\/notion-drafts\?/, route => {
    const request = route.request();
    if (request.method() !== "GET") {
      writes++;
      return route.abort();
    }
    const key = new URL(request.url()).searchParams.get("stable_key") ?? "";
    calls.push(key);
    return route.fulfill({ status: 200, json: { drafts: examples[key] ?? [] } });
  });
  await page.route("**/api/admin/gemini-automation/run", route => {
    if (route.request().method() === "POST") writes++;
    return route.abort();
  });

  for (const width of widths) {
    calls.length = 0;
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 840 });
    const response = await page.goto("/admin/automatizacie-gemini/koncepty", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByText(/Načítaných všetkých 22 kategórií/)).toBeVisible();
    expect(new Set(calls).size).toBe(22);
    expect(writes).toBe(0);

    await expect(page.getByRole("heading", { name: "Služby pre psov" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Podujatia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pomoc psom" })).toBeVisible();
    await expect(page.getByText("E2E veterinárna ambulancia")).toBeVisible();
    await expect(page.getByText("E2E výstava psov")).toBeVisible();
    await expect(page.getByText("E2E útulok")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upraviť v sekcii →" }))
      .toHaveAttribute("href", "/admin/podujatia/321");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    await page.screenshot({
      path: ".e2e-artifacts/gemini-dashboard-v3/all-concepts-v4-" + width + ".png",
      fullPage: true,
    });

    const search = page.getByRole("searchbox", { name: "Hľadať koncept" });
    await search.fill("AMBULANCIA");
    await expect(page.getByText("E2E veterinárna ambulancia")).toBeVisible();
    await expect(page.getByText("E2E útulok")).toHaveCount(0);
    await search.fill("");

    const category = page.getByRole("combobox", { name: "Kategória" });
    await expect(category.locator("option")).toHaveCount(23); // 22 + all
    await category.selectOption("help.utulky");
    await expect(page.getByText("E2E útulok")).toBeVisible();
    await expect(page.getByText("E2E výstava psov")).toHaveCount(0);
    await page.getByRole("link", { name: "Otvoriť v kategórii →" }).click();
    await expect(page.getByRole("combobox", { name: "Kategória" })).toHaveValue("help.utulky");
    expect(writes).toBe(0);
  }
});
