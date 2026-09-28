import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("psipedia-cookie-consent", "necessary"));
});

function idsForProject(projectName: string) {
  const mobile = /mobile/i.test(projectName);
  return {
    draft: mobile ? 990011 : 990001,
    published: mobile ? 990012 : 990002,
  };
}

test("canonical DRAFT can be permanently deleted only after destructive confirmation", async ({ page }, testInfo) => {
  const { draft } = idsForProject(testInfo.project.name);
  const response = await page.goto(`/admin/podujatia/${draft}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const deleteButton = page.getByRole("button", { name: "Vymazať koncept", exact: true });
  await expect(deleteButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await deleteButton.click();
    await expect(dialog).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
  await expect(dialog.getByRole("heading", { name: "Naozaj chcete tento koncept úplne vymazať?", exact: true })).toBeVisible();
  await expect(dialog.getByText("Táto akcia sa nedá vrátiť.", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Zrušiť", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(deleteButton).toBeVisible();

  await deleteButton.click();
  const alertPromise = page.waitForEvent("dialog");
  await dialog.getByRole("button", { name: "Vymazať koncept", exact: true }).click();
  const successAlert = await alertPromise;
  expect(successAlert.message()).toBe("Koncept bol úplne vymazaný.");
  await successAlert.accept();

  await expect(page).toHaveURL(/\/admin\/podujatia$/);
  const deletedResponse = await page.goto(`/admin/podujatia/${draft}`, { waitUntil: "domcontentloaded" });
  expect(deletedResponse?.status()).toBe(404);
});

test("published canonical record never exposes permanent delete action", async ({ page }, testInfo) => {
  const { published } = idsForProject(testInfo.project.name);
  const response = await page.goto(`/admin/podujatia/${published}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByRole("button", { name: "Vymazať koncept", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
