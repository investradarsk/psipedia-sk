import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const AUTH_TOKENS = {
  "desktop-chromium": "partner-e2e-desktop-auth-token-0000000000000001",
  "mobile-chromium": "partner-e2e-mobile-auth-token-000000000000000002",
} as const;

const AUTH_EMAILS = {
  "desktop-chromium": "partner-desktop-e2e@example.sk",
  "mobile-chromium": "partner-mobile-e2e@example.sk",
} as const;

const AUTH_ACCOUNT_IDS = {
  "desktop-chromium": "partner-e2e-desktop",
  "mobile-chromium": "partner-e2e-mobile",
} as const;

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const path of ["/partner/registracia", "/partner/prihlasenie"]) {
  test(path + " is usable, accessible and overflow-safe", async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expect(page.getByLabel("Pracovný e-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať prihlasovací odkaz" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("invalid verification link has a safe recovery state", async ({ page }) => {
  await page.goto("/partner/overenie");
  await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vyžiadať nový odkaz" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("anonymous Partner shell and settings redirect to login", async ({ page }) => {
  await page.goto("/partner");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
  await page.goto("/partner/nastavenia");
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
});

test("public Directory profile exposes free claim CTA and only asserts pre-verification state on desktop", async ({ page }, testInfo) => {
  await page.goto("/adresar/veterinari/partner-e2e-veterina");
  await expect(page.getByRole("heading", { name: "Spravujete tento profil?" })).toBeVisible();
  await expect(page.getByText("Správa základných údajov profilu je bezplatná.")).toBeVisible();
  const claimLink=page.getByRole("link",{name:"Spravovať tento profil"});
  await expect(claimLink).toHaveAttribute("href","/partner/prevziat-profil/DIRECTORY_PROFILE/990001");
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByText("Overený správca")).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});

test("valid one-time link creates a session and exposes membership dashboard/settings", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof AUTH_TOKENS;
  const token = AUTH_TOKENS[project];
  const expectedEmail = AUTH_EMAILS[project];
  expect(token).toBeTruthy();

  const mobileReturnTo="/partner/prevziat-profil/DIRECTORY_PROFILE/990001";
  const verificationUrl=project==="mobile-chromium"
    ? "/partner/overenie#token="+encodeURIComponent(token)+"&returnTo="+encodeURIComponent(mobileReturnTo)
    : "/partner/overenie#token="+encodeURIComponent(token);
  await page.goto(verificationUrl);
  if(project==="mobile-chromium"){
    await expect(page).toHaveURL(/\/partner\/prevziat-profil\/DIRECTORY_PROFILE\/990001$/);
    await expect(page.getByRole("heading",{name:"Prevziať existujúci profil"})).toBeVisible();
    await page.getByLabel(/Ako ste spojení/).fill("E2E poverený správca");
    await page.getByRole("button",{name:"Odoslať žiadosť o prevzatie"}).click();
    await expect(page.getByRole("status")).toContainText("Žiadosť sme prijali a čaká na kontrolu.");
    await page.goto("/partner");
  } else {
    await expect(page).toHaveURL(/\/partner$/);
  }
  await expect(page.getByRole("heading", { name: "Prehľad" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner navigácia" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Moje profily" }).click();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" })).toBeVisible();
    await expect(page.getByText("OWNER")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await expect(page.getByRole("heading", { name: "Pridať nový profil" })).toBeVisible();
    await page.getByLabel("Názov").fill("Partner E2E Nová Služba");
    await page.getByLabel("Kategória").selectOption("veterinari");
    await page.getByLabel("Krátky popis").fill("Nová testovacia služba pre Partner E2E.");
    await page.getByLabel("Popis", { exact: true }).fill("Toto je nový testovací Directory profil vytvorený cez moderovaný Partner flow.");
    await page.getByLabel("Mesto").fill("Žilina");
    await page.getByLabel("Okres").fill("Žilina");
    await page.getByLabel("Kraj").fill("Žilinský kraj");
    await page.getByLabel("Adresa").fill("Unikátna 123");
    await page.getByLabel("Web").fill("https://partner-new-e2e.example");
    await page.getByRole("button", { name: "Skontrolovať a odoslať" }).click();
    await expect(page.getByRole("status")).toContainText("Návrh nového profilu sme prijali a čaká na kontrolu.");

    await page.goto("/partner/profily");
    await page.getByRole("link", { name: "Upraviť údaje" }).click();
    await expect(page.getByRole("heading", { name: "Upraviť údaje" })).toBeVisible();
    await page.getByLabel("Mesto").fill("Trnava");
    await page.getByRole("button", { name: "Odoslať zmeny na kontrolu" }).click();
    await expect(page.getByRole("status")).toContainText("Zmeny sme prijali a čakajú na kontrolu.");
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Nitra", { exact: true }).first()).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Partner E2E Organizácia" })).toBeVisible();
    await expect(page.getByText("EDITOR")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await page.getByRole("radio", { name: /Organizácia na pomoc psom/ }).check();
    await page.getByLabel("Názov").fill("Partner E2E Organizácia");
    await page.getByLabel("Typ organizácie").selectOption("CIVIC_ASSOCIATION");
    await page.getByLabel("Verejný telefón").fill("+421900111222");
    await page.getByLabel("Web").fill("https://example.sk");
    await page.getByRole("button", { name: "Skontrolovať a odoslať" }).click();
    await expect(page.getByRole("heading", { name: "Našli sme profil, ktorý môže patriť vám." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Spravujete tento profil?" })).toHaveAttribute("href", "/partner/prevziat-profil/HELP_ORGANIZATION/990002");
    await page.getByRole("button", { name: "Nie je to môj profil — pokračovať" }).click();
    await expect(page.getByRole("status")).toContainText("Návrh nového profilu sme prijali a čaká na kontrolu.");

    await page.goto("/partner/profily");
    await page.getByRole("link", { name: "Upraviť údaje" }).click();
    await expect(page.getByRole("heading", { name: "Upraviť údaje" })).toBeVisible();
    await page.getByLabel("Verejný telefón").fill("+421900333444");
    await page.getByRole("button", { name: "Odoslať zmeny na kontrolu" }).click();
    await expect(page.getByRole("status")).toContainText("Zmeny sme prijali a čakajú na kontrolu.");
    await page.goto("/partner/ziadosti");
    const organizationChange = page.locator(".partner-request-list article").filter({ hasText: "Partner E2E Organizácia" }).first();
    await expect(organizationChange).toContainText("Čaká na kontrolu");
    page.once("dialog", dialog => void dialog.accept());
    await organizationChange.getByRole("button", { name: "Zrušiť návrh" }).click();
    await expect(organizationChange).toContainText("Zrušené");
  }
  await expectNoHorizontalOverflow(page);

  await page.goto("/partner/ziadosti");
  await expect(page.getByRole("heading", { name: "Žiadosti a overenia" })).toBeVisible();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Požiadať o overenie" }).click();
    await page.getByRole("button", { name: "Odoslať na overenie" }).click();
    await expect(page.getByRole("status")).toContainText("Žiadosť o overenie čaká na kontrolu.");
  } else {
    await expect(page.getByText("Čaká na kontrolu")).toBeVisible();
    await expect(page.getByText("E2E poverený správca")).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Propagácia" }).click();
  await expect(page.getByRole("heading", { name: "Propagácia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium profil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Propagovaný profil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reklamná kampaň" })).toBeVisible();
  if (project === "mobile-chromium") {
    await page.getByLabel("Typ záujmu").selectOption("OTHER");
  }
  await page.getByLabel("Krátka správa").fill("E2E nezáväzný záujem");
  await page.getByRole("button", { name: "Odoslať nezáväzný záujem" }).click();
  await expect(page.getByRole("status")).toContainText("Ďakujeme. Váš záujem sme prijali.");
  await expect(page.getByRole("heading", { name: "Odoslané záujmy" })).toBeVisible();
  await expect(page.getByText("E2E nezáväzný záujem")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Nastavenia" }).click();
  await expect(page).toHaveURL(/\/partner\/nastavenia$/);
  await expect(page.getByRole("heading", { name: "Nastavenia" })).toBeVisible();
  await expect(page.getByText(expectedEmail)).toBeVisible();
  await expect(page.getByText("Aktívny")).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásiť sa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deaktivovať účet" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Odhlásiť sa" }).click();
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
});

test("internal admin Partner overview and account detail are protected admin pages", async ({ page }, testInfo) => {
  const project=testInfo.project.name as keyof typeof AUTH_EMAILS;
  await page.goto("/admin/partners");
  await expect(page.getByRole("heading",{name:"Partneri"})).toBeVisible();
  await expect(page.getByRole("link",{name:/Komerčné leady 1/})).toBeVisible();
  const accountRow=page.getByRole("row").filter({hasText:AUTH_ACCOUNT_IDS[project]});
  await expect(accountRow.getByText(AUTH_EMAILS[project])).toBeVisible();
  await accountRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:AUTH_EMAILS[project]})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Bezpečnostné akcie"})).toBeVisible();
  await page.goto("/admin/partners/commercial?status=NEW");
  await expect(page.getByRole("heading",{name:"Komerčné leady"})).toBeVisible();
  const leadRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]});
  await expect(leadRow).toContainText("E2E nezáväzný záujem");
  await leadRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:"Spracovanie leadu"})).toBeVisible();
  await page.getByLabel("Stav").selectOption("CONTACTED");
  await page.getByRole("button",{name:"Uložiť"}).click();
  await expect(page.getByRole("status")).toContainText("Zmena bola uložená.");
  await page.goto("/admin/partners");
  await expect(page.getByRole("link",{name:/Komerčné leady 0/})).toBeVisible();
  await expect(page.getByRole("link",{name:/Nové profily 1/})).toBeVisible();
  await page.getByRole("link",{name:/Nové profily 1/}).click();
  await expect(page.getByRole("heading",{name:"Nové profily"})).toBeVisible();

  if(project==="desktop-chromium"){
    const newRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Nová Služba"});
    await expect(newRow).toContainText("duplicate NONE");
    await newRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByRole("heading",{name:"Údaje na vytvorenie"})).toBeVisible();
    const createResponse=page.waitForResponse((response)=>
      response.url().includes("/api/admin/partners/submissions/") &&
      response.request().method()==="PATCH" && response.ok(),
    );
    page.once("dialog",dialog=>void dialog.accept());
    await page.getByRole("button",{name:"Vytvoriť nový profil"}).click();
    await createResponse;
    await expect(page.getByText("CREATED_NEW")).toBeVisible();
    const directoryResponse=await page.request.get("/api/admin/directory?limit=100");
    expect(directoryResponse.ok()).toBeTruthy();
    const directoryJson=await directoryResponse.json() as {items?:Array<{name?:string;status?:string}>;profiles?:Array<{name?:string;status?:string}>};
    const directoryItems=directoryJson.items??directoryJson.profiles??[];
    expect(directoryItems.find((item)=>item.name==="Partner E2E Nová Služba")?.status).toBe("draft");
    await page.goto("/admin/partners/accounts/partner-e2e-desktop");
    const createdMembership=page.locator("section").filter({hasText:"Membership história"}).locator("article").filter({hasText:"Partner E2E Nová Služba"});
    await expect(createdMembership).toContainText("OWNER");
    await page.goto("/admin/partners");
  }else{
    const newRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Organizácia"});
    await expect(newRow).toContainText("duplicate HIGH");
    await newRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByText("Rovnaká webová doména")).toBeVisible();
    const linkResponse=page.waitForResponse((response)=>
      response.url().includes("/api/admin/partners/submissions/") &&
      response.request().method()==="PATCH" && response.ok(),
    );
    page.once("dialog",dialog=>void dialog.accept());
    await page.getByRole("button",{name:"Prepojiť tento profil"}).first().click();
    await linkResponse;
    await expect(page.getByText("LINKED_EXISTING")).toBeVisible();
    await page.goto("/admin/partners/accounts/partner-e2e-mobile");
    const linkedMembership=page.locator("section").filter({hasText:"Membership história"}).locator("article").filter({hasText:"Partner E2E Organizácia"});
    await expect(linkedMembership).toContainText("OWNER");
    await page.goto("/admin/partners");
  }

  if(project==="desktop-chromium"){
    await expect(page.getByRole("link",{name:/Úpravy 1/})).toBeVisible();
    await page.goto("/admin/partners/changes?status=active");
    const changeRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Veterina"});
    await expect(changeRow).toContainText("1 zmenených polí");
    await changeRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByRole("heading",{name:"OLD → NEW"})).toBeVisible();
    await expect(page.getByText("Nitra",{exact:true}).first()).toBeVisible();
    await expect(page.getByText("Trnava",{exact:true}).first()).toBeVisible();
    const changeResponse=page.waitForResponse((response)=>
      response.url().includes("/api/admin/partners/changes/") &&
      response.request().method()==="PATCH" &&
      response.ok(),
    );
    page.once("dialog",dialog=>void dialog.accept());
    await page.getByRole("button",{name:"Schváliť zmeny"}).click();
    await changeResponse;
    await page.goto("/admin/partners");
    await expect(page.getByRole("link",{name:/Úpravy 0/})).toBeVisible();
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Trnava",{exact:true}).first()).toBeVisible();
    await page.goto("/admin/partners");

    await expect(page.getByRole("link",{name:/Overenia 2/})).toBeVisible();
    await page.goto("/admin/partners/verifications?status=PENDING_VERIFICATION");
    const verificationRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]}).filter({hasText:"Partner E2E Veterina"});
    await expect(verificationRow).toContainText("PENDING_VERIFICATION");
    await verificationRow.getByRole("link",{name:"Detail →"}).click();
    const verificationResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/partners/verifications/") &&
      response.request().method() === "PATCH" &&
      response.ok(),
    );
    page.once("dialog", dialog => void dialog.accept());
    await page.getByRole("button",{name:"Overiť"}).click();
    await verificationResponse;
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Overený správca")).toBeVisible();
  }else{
    await expect(page.getByRole("link",{name:/Claims 1/})).toBeVisible();
    await page.goto("/admin/partners/claims?status=PENDING");
    const claimRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]});
    await expect(claimRow).toContainText("Ownership konflikt");
    await claimRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByText("Ownership konflikt").first()).toBeVisible();
    const claimResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/partners/claims/") &&
      response.request().method() === "PATCH" &&
      response.ok(),
    );
    page.once("dialog", dialog => void dialog.accept());
    await page.getByRole("button",{name:"Schváliť"}).click();
    await claimResponse;
    await page.goto("/admin/partners");
    await expect(page.getByRole("link",{name:/Claims 0/})).toBeVisible();
    await expect(page.getByRole("link",{name:/Overenia 2/})).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});

for (const token of [
  "partner-e2e-used-auth-token-00000000000000000003",
  "partner-e2e-revoked-auth-token-000000000000000004",
  "partner-e2e-expired-auth-token-000000000000000005",
  "partner-e2e-suspended-auth-token-0000000000000006",
  "partner-e2e-deactivated-auth-token-000000000000007",
]) {
  test("unusable magic link fails safely: " + token.slice(12, 20), async ({ page }) => {
    await page.goto("/partner/overenie#token=" + encodeURIComponent(token));
    await expect(page.getByRole("heading", { name: "Odkaz sa nepodarilo overiť" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vyžiadať nový odkaz" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
