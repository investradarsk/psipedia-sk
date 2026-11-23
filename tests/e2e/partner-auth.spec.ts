import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial", retries: 0 });

const AUTH_TOKENS = {
  "desktop-chromium": "partner-e2e-desktop-auth-token-0000000000000001",
  "mobile-chromium": "partner-e2e-mobile-auth-token-000000000000000002",
} as const;

const AUTH_EMAILS = {
  "desktop-chromium": "partner-desktop-e2e@example.sk",
  "mobile-chromium": "partner-mobile-e2e@example.sk",
} as const;

async function dismissCookieConsent(page:Page){
  const reject=page.getByRole("button",{name:"Odmietnuť analytiku"});
  await reject.waitFor({state:"visible",timeout:2_000}).catch(()=>{});
  if(await reject.isVisible().catch(()=>false))await reject.click();
}

const AUTH_ACCOUNT_IDS = {
  "desktop-chromium": "partner-e2e-desktop",
  "mobile-chromium": "partner-e2e-mobile",
} as const;

async function openMobileMenu(page: Page) {
  // The SSR trigger is visible before SiteHeader attaches its React handlers.
  await expect(page.locator('[data-search-ready="true"]')).toBeAttached();
  const trigger = page.getByRole("button", { name: "Otvoriť menu" });
  await trigger.click();
  await expect(page.getByRole("button", { name: "Zavrieť menu" })).toHaveAttribute("aria-expanded", "true");
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const path of ["/partner/registracia", "/partner/prihlasenie"]) {
  test(path + " is usable, accessible and overflow-safe", async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("main#obsah")).toBeVisible();
    await expect(page.getByLabel("E-mail",{exact:true})).toBeVisible();
    const passwordInput = page.getByLabel("Heslo",{exact:true});
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type","password");
    await expect(passwordInput).toHaveAttribute("autocomplete", path === "/partner/prihlasenie" ? "current-password" : "new-password");
    const showPassword = page.getByRole("button",{name:"Zobraziť heslo"}).first();
    await expect.poll(async () => {
      if (await showPassword.isVisible()) await showPassword.click();
      return passwordInput.getAttribute("type");
    }).toBe("text");
    const hidePassword = page.getByRole("button",{name:"Skryť heslo"}).first();
    await hidePassword.focus();
    await page.keyboard.press("Enter");
    await expect(passwordInput).toHaveAttribute("type","password");
    await expect(page.getByRole("button",{name:"Zobraziť heslo"}).first()).toBeFocused();
    if (path === "/partner/registracia") {
      await expect(page.getByLabel("Potvrdenie hesla",{exact:true})).toHaveAttribute("autocomplete","new-password");
      await expect(page.getByText("Heslo musí mať aspoň 12 znakov.",{exact:true})).toBeVisible();
      await expect(page.getByRole("button", { name: "Vytvoriť Partner účet" })).toBeDisabled();
    } else {
      await expect(page.getByRole("button", { name: "Prihlásiť sa" })).toBeDisabled();
      await expect(page.getByRole("link", { name: "Zabudli ste heslo?" })).toBeVisible();
    }
    const methodSelector = page.getByRole("group", { name: "Spôsob prihlásenia" });
    const passwordMethod = methodSelector.getByRole("button", { name: "Heslo", exact: true });
    const emailMethod = methodSelector.getByRole("button", { name: "E-mailový odkaz" });
    await expect(passwordMethod).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Pracovný e-mail")).toHaveCount(0);
    await emailMethod.click();
    await expect(emailMethod).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať prihlasovací odkaz" })).toBeDisabled();
    await expect(page.getByLabel("Heslo", { exact: true })).toHaveCount(0);
    await passwordMethod.click();
    await expect(page.getByLabel("Heslo", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Pracovný e-mail")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("forgot and reset password surfaces are accessible and overflow-safe", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/partner/zabudnute-heslo");
  await expect(page.getByRole("heading", { name: "Zabudli ste heslo?" })).toBeVisible();
  await expect(page.getByLabel("E-mail",{exact:true})).toBeVisible();
  await expect(page.getByRole("button", { name: "Poslať odkaz na obnovenie hesla" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  const forgotAccessibility = await new AxeBuilder({ page }).analyze();
  expect(forgotAccessibility.violations).toEqual([]);

  await page.goto("/partner/obnova-hesla");
  await expect(page.getByRole("heading", { name: "Obnovenie hesla" })).toBeVisible();
  await expect(page.getByText("Odkaz na obnovenie hesla nie je platný alebo už expiroval.")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/partner/obnova-hesla#token=e2e-password-token");
  const newPassword = page.getByLabel("Nové heslo",{exact:true});
  await expect(newPassword).toBeVisible();
  await expect(newPassword).toHaveAttribute("type","password");
  await expect(newPassword).toHaveAttribute("autocomplete","new-password");
  await expect(page.getByLabel("Potvrdenie nového hesla",{exact:true})).toHaveAttribute("autocomplete","new-password");
  await expect(page.getByText("Heslo musí mať aspoň 12 znakov.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Zobraziť heslo"}).first().click();
  await expect(newPassword).toHaveAttribute("type","text");
  await expectNoHorizontalOverflow(page);
  const resetAccessibility = await new AxeBuilder({ page }).analyze();
  expect(resetAccessibility.violations).toEqual([]);
});

test("mocked Google OAuth return bridge creates a 200 same-site navigation boundary", async ({ page }) => {
  const targets = [
    { intent: "LINK", target: "/partner/prepojit-google" },
    { intent: "LOGIN", target: "/partner" },
    { intent: "REGISTER", target: "/partner/onboarding?returnTo=" + encodeURIComponent("/partner") },
  ];

  for (const { intent, target } of targets) {
    const response = await page.request.get(
      "/partner/google-navrat?to=" + encodeURIComponent(target),
      { maxRedirects: 0 },
    );
    expect(response.status(), intent + " bridge status").toBe(200);
    expect(response.headers()["location"], intent + " bridge must not server-redirect").toBeUndefined();
    expect(response.headers()["set-cookie"], intent + " bridge must not touch cookies").toBeUndefined();
    const html = await response.text();
    expect(html).toContain("Dokončujem prihlásenie");
    expect(html).toContain(target.split("?")[0]);
  }

  for (const unsafe of [
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/api/partner/auth/google/callback",
    "/admin",
  ]) {
    const response = await page.request.get(
      "/partner/google-navrat?to=" + encodeURIComponent(unsafe),
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["location"]).toBeUndefined();
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const html = await response.text();
    expect(html).toContain('href="/partner"');
    expect(html).not.toContain('href="https://attacker.example');
    expect(html).not.toContain('href="//attacker.example');
  }

  const rendered = await page.goto(
    "/partner/google-navrat?to=" + encodeURIComponent("/partner/prihlasenie?google=mocked"),
    { referer: "https://accounts.google.com/", waitUntil: "domcontentloaded" },
  );
  expect(rendered?.status()).toBe(200);
  await expect(page).toHaveURL(/\/partner\/prihlasenie\?google=mocked$/);
  await expect(page.getByRole("heading", { name: "Prihlásenie do Partner účtu" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

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

test("anonymous LOST and FOUND creation preserve their exact type through Partner login", async ({ page }) => {
  for (const kind of ["LOST", "FOUND"] as const) {
    const target = kind === "LOST" ? "/partner/koncepty/novy/strateny" : "/partner/koncepty/novy/najdeny";
    // Old bookmarked query links must canonicalize to the path-based entry.
    await page.goto("/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=" + kind, { waitUntil: "domcontentloaded" });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/partner/prihlasenie");
    expect(url.searchParams.get("returnTo")).toBe(target);
    await expect(page.getByRole("link", { name: "Vytvoriť Partner účet" }))
      .toHaveAttribute("href", "/partner/registracia?returnTo=" + encodeURIComponent(target));
  }
});

test("public header exposes Partner login as a utility action without overflow", async ({ page }, testInfo) => {
  // The isolated Partner E2E D1 fixture does not seed Homepage-only visual tables.
  // Exercise the same shared public header on a static public page instead.
  const response = await page.goto("/kontakt");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Ako ti môžeme pomôcť?" })).toBeVisible();
  await dismissCookieConsent(page);
  if(testInfo.project.name==="mobile-chromium"){
    await openMobileMenu(page);
    const mobileNav=page.getByRole("navigation",{name:"Mobilná navigácia"});
    const login=mobileNav.getByRole("link",{name:"Partner účet"});
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href","/partner/prihlasenie");
  }else{
    const login=page.locator("[data-header-masthead]").getByRole("link",{name:"Partner účet"});
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href","/partner/prihlasenie");
    const mainNav=page.getByRole("navigation",{name:"Hlavná navigácia"});
    await expect(mainNav.getByRole("link",{name:"Partner účet"})).toHaveCount(0);
  }
  await expect(page.locator('[data-partner-login-entry]:visible')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
});

test("anonymous Directory profile offers Partner claim only and retires legacy correction URL", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/adresar/veterinari/partner-e2e-veterina");
  await expect(page.getByRole("heading", { name: "Spravujete tento profil?" })).toBeVisible();
  await expect(page.getByText("Správa základných údajov profilu je bezplatná.")).toBeVisible();
  await expect(page.getByText("Premium profil",{exact:true})).toBeVisible();
  await expect(page.getByText("Sponzorované",{exact:true})).toBeVisible();
  const claimPath="/partner/prevziat-profil/DIRECTORY_PROFILE/990001";
  const claimLink=page.getByRole("link",{name:"Spravovať tento profil"});
  await expect(claimLink).toHaveAttribute("href","/partner/prihlasenie?returnTo="+encodeURIComponent(claimPath));
  await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveCount(0);
  // Existing bookmarks must not serve the retired anonymous correction form.
  await page.goto("/adresar/veterinari/partner-e2e-veterina/upravit");
  await expect(page).toHaveURL(/\/adresar\/veterinari\/partner-e2e-veterina$/);
  await expect(page.getByRole("link",{name:"Spravovať tento profil"})).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByText("Overený správca")).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("valid one-time link creates a session and exposes membership dashboard/settings", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof AUTH_TOKENS;
  if (project === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  const token = AUTH_TOKENS[project];
  const expectedEmail = AUTH_EMAILS[project];
  const contactName = project === "desktop-chromium" ? "E2E Partner Desktop" : "E2E Partner Mobile";
  const contactPhone = project === "desktop-chromium" ? "+421 900 101 202" : "+421 900 303 404";
  const relationship = project === "desktop-chromium" ? "E2E manažér" : "E2E správca";
  const updatedRelationship = relationship + " aktualizovaný";
  expect(token).toBeTruthy();

  const mobileReturnTo="/partner/prevziat-profil/DIRECTORY_PROFILE/990001";
  const verificationUrl=project==="mobile-chromium"
    ? "/partner/overenie#token="+encodeURIComponent(token)+"&returnTo="+encodeURIComponent(mobileReturnTo)
    : "/partner/overenie#token="+encodeURIComponent(token);
  await page.goto(verificationUrl);
  await expect(page).toHaveURL(/\/partner\/onboarding(?:\?|$)/);
  await expect(page.getByRole("heading",{name:"Dokončite Partner účet"})).toBeVisible();

  const registerReturnTo = project === "mobile-chromium" ? mobileReturnTo : "/partner";
  const registerBridgeResponse = await page.goto(
    "/partner/google-navrat?to=" + encodeURIComponent("/partner/onboarding?returnTo=" + encodeURIComponent(registerReturnTo)),
    { referer: "https://accounts.google.com/", waitUntil: "domcontentloaded" },
  );
  expect(registerBridgeResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/partner\/onboarding\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(registerReturnTo);
  await expect(page.getByRole("heading",{name:"Dokončite Partner účet"})).toBeVisible();

  await expectNoHorizontalOverflow(page);
  const onboardingAccessibility = await new AxeBuilder({ page }).analyze();
  expect(onboardingAccessibility.violations).toEqual([]);

  // The SSR form can be visible before React hydrates its controlled fields.
  // Filling it before the accessibility scan allowed hydration to clear the
  // required name in CI, preventing the browser from submitting anything.
  const contactNameInput = page.getByLabel("Meno a priezvisko *");
  const contactPhoneInput = page.getByLabel("Telefón");
  const contactRelationshipInput = page.getByLabel("Vaša úloha / vzťah k profilu");
  await contactNameInput.fill(contactName);
  await contactPhoneInput.fill(contactPhone);
  await contactRelationshipInput.fill(relationship);
  await expect(contactNameInput).toHaveValue(contactName);
  await expect(contactPhoneInput).toHaveValue(contactPhone);
  await expect(contactRelationshipInput).toHaveValue(relationship);

  const onboardingSaveResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/partner/onboarding" &&
    response.request().method() === "POST",
  );
  await page.getByRole("button",{name:"Pokračovať do Partner účtu"}).click();
  const onboardingSaved = await onboardingSaveResponse;
  // The successful POST immediately triggers a full-page navigation, so
  // Playwright may no longer retain its response body for response.json().
  // Assert the HTTP success here and the protected dashboard/returnTo below.
  expect(onboardingSaved.status()).toBe(200);

  if(project==="mobile-chromium"){
    await expect(page).toHaveURL(/\/partner\/prevziat-profil\/DIRECTORY_PROFILE\/990001$/);
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    // The public profile now correctly blocks background clicks until the
    // first-visit cookie dialog is explicitly resolved.
    await dismissCookieConsent(page);
    await expect(page.getByRole("heading",{name:"Spravujete tento profil?"})).toBeVisible();
    const requestManagement=page.getByRole("link",{name:"Požiadať o správu profilu"});
    await expect(requestManagement).toHaveAttribute("href","/partner/prevziat-profil/DIRECTORY_PROFILE/990001");
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveCount(0);
    await requestManagement.click();
    await expect(page.getByRole("heading",{name:"Požiadať o správu záznamu"})).toBeVisible();
    await page.getByLabel(/Aký je váš vzťah k tomuto záznamu/).fill("E2E poverený správca");
    await page.getByRole("button",{name:"Odoslať žiadosť o prevzatie"}).click();
    await expect(page.getByRole("status")).toContainText("Žiadosť sme prijali a čaká na kontrolu.");
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByRole("heading",{name:"Žiadosť o správu profilu čaká na kontrolu."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Zobraziť stav žiadosti"})).toHaveAttribute("href","/partner/ziadosti");
    await expect(page.getByRole("link",{name:"Požiadať o správu profilu"})).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.goto("/partner");
  } else {
    await expect(page).toHaveURL(/\/partner$/);
  }
  await expect(page.getByRole("heading", { name: "Prehľad" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner navigácia" })).toBeVisible();
  // Step 2: both desktop and mobile show real self-service destinations.
  const dashboardActions = page.locator(".partner-dashboard-welcome");
  await expect(dashboardActions.getByRole("link", { name: "+ Pridať profil", exact: true })).toHaveAttribute("href", "/partner/koncepty/novy?typ=DIRECTORY_PROFILE");
  await expect(dashboardActions.getByRole("link", { name: "Pridať podujatie" })).toHaveAttribute("href", "/partner/koncepty/novy?typ=MANAGED_EVENT");
  await expect(dashboardActions.getByRole("link", { name: "Pridať pomoc psom" })).toHaveAttribute("href", "/partner/koncepty/novy?typ=ADOPTION_DOG");
  await expect(page.locator(".partner-dashboard-stat")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Čo spravujete" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // Partner claim search is usable for published existing events on both viewports.
  await page.goto("/partner/prevziat?type=MANAGED_EVENT&q=Partner%20E2E");
  await expect(page.getByRole("heading", { name: "Požiadať o správu" })).toBeVisible();
  const eventClaimRow = page.locator(".partner-claim-search-results li").filter({ hasText: "Partner E2E Publikované Podujatie" });
  await expect(eventClaimRow).toHaveCount(1);
  await expect(eventClaimRow.getByRole("link", { name: "Požiadať o správu" })).toHaveAttribute("href", "/partner/prevziat-profil/MANAGED_EVENT/990003");
  await expectNoHorizontalOverflow(page);
  await page.goto("/partner");

  const linkBridgeResponse = await page.goto(
    "/partner/google-navrat?to=" + encodeURIComponent("/partner/prepojit-google"),
    { referer: "https://accounts.google.com/", waitUntil: "domcontentloaded" },
  );
  expect(linkBridgeResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/partner\/prepojit-google$/);
  await expect(page.getByRole("heading", { name: "Prepojiť Google účet" })).toBeVisible();

  const loginBridgeResponse = await page.goto(
    "/partner/google-navrat?to=" + encodeURIComponent("/partner"),
    { referer: "https://accounts.google.com/", waitUntil: "domcontentloaded" },
  );
  expect(loginBridgeResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/partner$/);
  await expect(page.getByRole("heading", { name: "Prehľad" })).toBeVisible();

  if (project === "mobile-chromium") {
    await openMobileMenu(page);
    const mobileNav = page.getByRole("navigation", { name: "Mobilná navigácia" });
    const accountLink = mobileNav.getByRole("link", { name: "Partner účet" });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute("href", "/partner");
    await page.getByRole("button", { name: "Zavrieť menu" }).click();
    await expect.poll(
      () => page.locator("#mobile-menu").evaluate((element) => element.getBoundingClientRect().height),
      { timeout: 2_000 },
    ).toBeLessThanOrEqual(1);
  } else {
    const accountLink = page.locator("[data-header-masthead]").getByRole("link", { name: "Partner účet" });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute("href", "/partner");
  }

  await page.getByRole("navigation", { name: "Partner navigácia" }).getByRole("link", { name: "Moje profily" }).click();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" })).toBeVisible();
    await expect(page.getByText("Správca profilu")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    // The old new-profile page now redirects to the shared private canonical editor.
    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await expect(page).toHaveURL(/\/partner\/koncepty\/novy\?typ=DIRECTORY_PROFILE$/);
    await expect(page.getByRole("heading", { name: "Vytvoriť nový záznam" })).toBeVisible();
    const newDirectory = page.locator("form.partner-canonical-form");
    await expect(newDirectory.getByLabel("Druh záznamu")).toHaveValue("DIRECTORY_PROFILE");
    await expect(page.getByText(/Koncept zostane súkromný/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Scan the SSR form before editing it. Like onboarding, React hydration
    // may otherwise reset inputs filled before the client event handlers attach.
    const newDirectoryAccessibility = await new AxeBuilder({ page }).analyze();
    expect(newDirectoryAccessibility.violations).toEqual([]);
    await newDirectory.getByLabel("Hlavná kategória *").selectOption("veterinari");
    await newDirectory.getByLabel("Názov", { exact: true }).fill("Partner E2E Nová Služba");
    await newDirectory.getByLabel("Krátky popis").fill("Nová testovacia služba pre Partner E2E.");
    const directoryWeb = newDirectory.getByLabel("Web", { exact: true });
    await expect(directoryWeb).toHaveAttribute("type", "text");
    await directoryWeb.fill("partner-new-e2e.example");
    await expect(newDirectory.getByLabel("Hlavná kategória *")).toHaveValue("veterinari");
    await expect(newDirectory.getByLabel("Názov", { exact: true })).toHaveValue("Partner E2E Nová Služba");
    await expect(newDirectory.getByLabel("Krátky popis")).toHaveValue("Nová testovacia služba pre Partner E2E.");
    // Report the real server/HTML validation cause instead of an opaque redirect timeout.
    const createReply = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/partner/canonical-drafts" &&
      response.request().method() === "POST", { timeout: 8_000 }).catch(() => null);
    await newDirectory.getByRole("button", { name: "Uložiť koncept" }).click();
    const draftReply = await createReply;
    if (!draftReply) {
      const invalid = await newDirectory.locator(":invalid").evaluateAll(fields =>
        fields.map(field => ({ tag: field.tagName, name: field.getAttribute("name"),
          label: field.closest("label")?.textContent?.trim().slice(0, 100) })));
      const alerts = await page.getByRole("alert").allTextContents();
      throw new Error("Partner draft POST not issued; invalid=" + JSON.stringify(invalid) +
        "; alerts=" + JSON.stringify(alerts));
    }
    // A successful navigation may dispose the response body before Playwright
    // can read it; inspect the body only for failed HTTP responses.
    if (draftReply.status() !== 201) {
      const failureBody = await draftReply.text().catch(() => "(response body unavailable)");
      throw new Error("Partner draft POST " + draftReply.status() + ": " + failureBody.slice(0, 1_000));
    }
    await expect(page).toHaveURL(/\/partner\/koncepty\/[0-9a-f-]+$/);
    await expect(page.getByText("Rozpracovaný súkromný koncept", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Odoslať na schválenie" }).click();
    await expect(page).toHaveURL(/\/partner\/ziadosti$/);
    await page.goto("/partner");
    await expect(page.locator(".partner-dashboard-record").filter({ hasText: "Partner E2E Nová Služba" })).toContainText("Čaká na schválenie");
    await page.goto("/partner/profily");
    await page.getByRole("link", { name: "Upraviť údaje" }).click();
    await expect(page.getByRole("heading", { name: "Upraviť údaje" })).toBeVisible();
    // SSR fields can be visible before the controlled location handlers hydrate.
    await expect(page.locator(".partner-profile-edit-form")).toHaveAttribute("data-partner-edit-ready", "true");
    await page.getByLabel(/^Kraj/).selectOption("Trnavský kraj");
    await page.getByLabel(/^Okres/).selectOption("Trnava");
    const editMunicipality = page.getByRole("combobox", { name: "Obec / mesto" });
    await editMunicipality.fill("trnava");
    await editMunicipality.press("ArrowDown");
    await editMunicipality.press("Enter");
    await expect(editMunicipality).toHaveValue("Trnava");
    // Approved OWNER edits bypass moderation, but must update the canonical
    // record immediately and remain visible after reloading both views.
    const directoryDirectSave = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/partner/direct-profiles/partner-resource-e2e-directory" &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    expect((await directoryDirectSave).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Zmeny sú uložené v existujúcom profile.");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Obec / mesto" })).toHaveValue("Trnava");
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Trnava", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading",{name:"Tento profil spravujete cez Partner účet."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Upraviť profil"})).toHaveAttribute(
      "href",
      "/partner/profily/partner-resource-e2e-directory/upravit",
    );
    await expect(page.getByRole("link",{name:"Spravovať tento profil"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Požiadať o správu profilu"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  } else {
    await expect(page.getByRole("heading", { name: "Partner E2E Organizácia" })).toBeVisible();
    await expect(page.getByText("Správca profilu")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await expect(page).toHaveURL(/\/partner\/koncepty\/novy\?typ=DIRECTORY_PROFILE$/);
    await page.getByLabel("Druh záznamu").selectOption("HELP_ORGANIZATION");
    const newOrganization = page.locator("form.partner-canonical-form");
    await expect(newOrganization.getByLabel("Druh záznamu")).toHaveValue("HELP_ORGANIZATION");
    await newOrganization.getByLabel("Názov", { exact: true }).fill("Partner E2E Nová Organizácia Mobile");
    await newOrganization.getByLabel("Typ organizácie *").selectOption("CIVIC_ASSOCIATION");
    await newOrganization.getByLabel("Verejný telefón").fill("+421900111222");
    await newOrganization.getByLabel("Web", { exact: true }).fill("partner-org-e2e.example");
    await expect(newOrganization.getByLabel("Web", { exact: true })).toHaveAttribute("type", "text");
    await expectNoHorizontalOverflow(page);
    const organizationAccessibility = await new AxeBuilder({ page }).analyze();
    expect(organizationAccessibility.violations).toEqual([]);
    await newOrganization.getByRole("button", { name: "Uložiť koncept" }).click();
    await expect(page).toHaveURL(/\/partner\/koncepty\/[0-9a-f-]+$/);
    await expect(page.getByText("Rozpracovaný súkromný koncept", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Odoslať na schválenie" }).click();
    // The existing seeded organization is intentionally a similar match.
    // Explicit duplicate acknowledgment is required; do not bypass the
    // canonical duplicate safeguard in order to pass the mobile test.
    const duplicateAlert=page.getByRole("alert").filter({hasText:"Našli sme podobný profil"});
    await expect(duplicateAlert).toBeVisible();
    await duplicateAlert.getByRole("button",{name:"Skontroloval som to – napriek tomu odoslať"}).click();
    await expect(page).toHaveURL(/\/partner\/ziadosti$/);
    await page.goto("/partner");
    await expect(page.locator(".partner-dashboard-record").filter({ hasText: "Partner E2E Nová Organizácia Mobile" })).toContainText("Čaká na schválenie");
    await page.goto("/partner/profily");
    await page.getByRole("link", { name: "Upraviť údaje" }).click();
    await expect(page.getByRole("heading", { name: "Upraviť údaje" })).toBeVisible();
    // Wait for controlled input handlers before editing the server-rendered field.
    await expect(page.locator(".partner-profile-edit-form")).toHaveAttribute("data-partner-edit-ready", "true");
    await page.getByLabel("Verejný telefón").fill("+421900333444");
    const organizationDirectSave = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/partner/direct-profiles/partner-resource-e2e-organization" &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    expect((await organizationDirectSave).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Zmeny sú uložené v existujúcom profile.");
    await page.reload();
    await expect(page.getByLabel("Verejný telefón")).toHaveValue("+421900333444");
    await page.goto("/partner/ziadosti");
    // Direct OWNER saves must not create a second moderation proposal.
    const profileChangesSection=page.locator("section.partner-requests-section").filter({
      has: page.getByRole("heading",{name:"Úpravy profilov"}),
    });
    await expect(profileChangesSection.locator("article").filter({hasText:"Partner E2E Organizácia"})).toHaveCount(0);
    const newProfilesSection=page.locator("section.partner-requests-section").filter({
      has: page.getByRole("heading",{name:"Moje návrhy nových profilov"}),
    });
    // The submitted canonical draft is the new organization, not the older
    // manager-owned fixture referenced by the direct-edit assertion above.
    await expect(newProfilesSection.locator("article").filter({hasText:"Partner E2E Nová Organizácia Mobile"})).toContainText("Čaká na kontrolu");

    await page.goto("/organizacie/partner-e2e-organizacia");
    await expect(page.getByRole("heading",{name:"Tento profil spravujete cez Partner účet."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Upraviť profil"})).toHaveAttribute(
      "href",
      "/partner/profily/partner-resource-e2e-organization/upravit",
    );
    await expect(page.getByRole("link",{name:"Otvoriť Partner účet"})).toHaveAttribute("href","/partner/profily");
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Požiadať o správu profilu"})).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  // A private individual can report a dog without exposing their Partner account contact.
  const reportKind=project==="desktop-chromium"?"FOUND":"LOST";
  const reportName=project==="desktop-chromium"?"Partner E2E Nájdený Pes":"Partner E2E Stratený Pes";
  await page.goto(reportKind === "LOST" ? "/partner/koncepty/novy/strateny" : "/partner/koncepty/novy/najdeny");
  await expect(page.getByRole("heading",{name:"Vytvoriť nový záznam"})).toBeVisible();
  const dogReportForm=page.locator("form.partner-canonical-form");
  await expect(dogReportForm.getByLabel("Druh záznamu")).toHaveValue("LOST_FOUND_DOG");
  await expect(dogReportForm.getByLabel("Typ hlásenia *")).toHaveValue(reportKind);
  await expect(page.getByText("Údaje z účtu sa do verejných kontaktov neprenášajú.",{exact:false})).toBeVisible();
  await expect(dogReportForm.getByLabel("Verejný e-mail")).toHaveValue("");
  await expect(dogReportForm.getByLabel("Verejný telefón")).toHaveValue("");
  // The SSR inputs are visible before hydration. Scan accessibility first, then type.
  const dogReportAccessibility = await new AxeBuilder({ page }).analyze();
  expect(dogReportAccessibility.violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await dogReportForm.getByLabel("Meno psa").fill(reportName);
  await dogReportForm.getByLabel("Dátum udalosti").fill("2026-11-22");
  await dogReportForm.getByLabel("Kraj").fill("Nitriansky kraj");
  await dogReportForm.getByLabel("Obec").fill("Nitra");
  await dogReportForm.getByLabel("Popis udalosti").fill("Hlásenie z partnerského účtu na overenie vlastníctva a bezpečnej moderácie.");
  if(reportKind==="LOST"){
    await dogReportForm.getByLabel("Naposledy videný – dátum a čas").fill("2026-11-22T17:00");
  }else{
    await expect(dogReportForm.getByLabel("Naposledy videný – dátum a čas")).toHaveCount(0);
  }
  await dogReportForm.getByRole("button",{name:"Uložiť koncept"}).click();
  await expect(page).toHaveURL(/\/partner\/koncepty\/[0-9a-f-]+$/);
  const dogDraftUrl=new URL(page.url()).pathname;
  await expect(page.getByText("Rozpracovaný súkromný koncept",{exact:true})).toBeVisible();
  const category=reportKind==="LOST"?"stratene-psy":"najdene-psy";
  await page.goto("/pomoc-psom/"+category+"?q="+encodeURIComponent(reportName));
  await expect(page.locator("[data-public-filter-results]")).not.toContainText(reportName);
  const publicMarkup=await page.content();
  expect(publicMarkup).not.toContain(expectedEmail);
  await page.goto(dogDraftUrl);
  await page.getByRole("button",{name:"Odoslať na schválenie"}).click();
  await expect(page).toHaveURL(/\/partner\/ziadosti$/);
  await page.goto("/partner");
  await expect(page.locator(".partner-dashboard-record").filter({hasText:reportName})).toContainText("Čaká na schválenie");

  const ownedEventTitle=project==="desktop-chromium"?"Partner E2E Publikované Podujatie":"Partner E2E Koncept Podujatie";
  const newEventTitle=project==="desktop-chromium"?"Partner E2E Nové Podujatie Desktop":"Partner E2E Nové Podujatie Mobile";
  const originalVenue=project==="desktop-chromium"?"Areál Desktop":"Areál Mobile";
  const changedVenue=project==="desktop-chromium"?"Areál Desktop Zmenený":"Areál Mobile Zmenený";

  await page.goto("/partner/podujatia");
  await expect(page.getByRole("heading",{name:"Moje podujatia"})).toBeVisible();
  const ownedEventCard=page.locator("article.partner-resource-card").filter({hasText:ownedEventTitle});
  await expect(ownedEventCard).toContainText(project==="desktop-chromium"?"Publikované":"Koncept");
  await expect(ownedEventCard).toContainText("Správca profilu");
  await expectNoHorizontalOverflow(page);

  if (project === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  // New events are saved as unpublished canonical drafts, not legacy pending-only proposals.
  await page.getByRole("link",{name:"Pridať podujatie"}).first().click();
  await expect(page).toHaveURL(/\/partner\/koncepty\/novy\?typ=MANAGED_EVENT$/);
  await expect(page.getByRole("heading",{name:"Vytvoriť nový záznam"})).toBeVisible();
  await expect(page.getByLabel("Druh záznamu")).toHaveValue("MANAGED_EVENT");
  await expect(page.getByText("Koncept zostane súkromný a na stránke sa zobrazí až po schválení.", { exact: false })).toBeVisible();
  const partnerLayout = await page.evaluate(() => {
    const stickyHeader = document.querySelector<HTMLElement>(".site-header");
    const heading = document.querySelector<HTMLElement>(".partner-page-heading h1");
    const intro = document.querySelector<HTMLElement>(".partner-canonical-intro");
    if (!stickyHeader || !heading || !intro) return null;
    return {
      headerBottom: stickyHeader.getBoundingClientRect().bottom,
      headingTop: heading.getBoundingClientRect().top,
      introTop: intro.getBoundingClientRect().top,
      viewportWidth: window.innerWidth,
    };
  });
  expect(partnerLayout).not.toBeNull();
  expect(partnerLayout!.headingTop).toBeGreaterThanOrEqual(partnerLayout!.headerBottom - 1);
  expect(partnerLayout!.introTop).toBeGreaterThanOrEqual(partnerLayout!.headerBottom - 1);
  if (project === "mobile-chromium") expect(partnerLayout!.viewportWidth).toBe(390);
  const newEventForm = page.locator("form.partner-canonical-form");
  await newEventForm.getByLabel("Názov",{exact:true}).fill(newEventTitle);
  await newEventForm.getByLabel("Krátky popis").fill("Nové moderované Partner podujatie pre izolovaný E2E scenár.");
  await newEventForm.getByLabel("Typ podujatia").selectOption("Seminár");
  await newEventForm.getByLabel("Dátum začiatku").fill(project==="desktop-chromium"?"2099-12-01":"2099-12-02");
  await newEventForm.getByLabel("Čas začiatku").fill("10:00");
  await newEventForm.getByLabel("Dátum konca").fill(project==="desktop-chromium"?"2099-12-01":"2099-12-02");
  await newEventForm.getByLabel("Čas konca").fill("16:00");
  await newEventForm.getByLabel("Miesto").fill(project==="desktop-chromium"?"E2E Nový Areál Desktop":"E2E Nový Areál Mobile");
  await newEventForm.getByLabel("Mesto / Online").fill(project==="desktop-chromium"?"Nitra":"Trnava");
  await newEventForm.getByLabel("Kraj").selectOption(project==="desktop-chromium"?"Nitriansky kraj":"Trnavský kraj");
  await newEventForm.getByLabel("Organizátor").fill("Psipedia Partner E2E");
  await newEventForm.getByLabel("Popis",{exact:true}).fill("Toto je dostatočne dlhý opis nového Partner podujatia, ktoré musí prejsť moderáciou.");
  await newEventForm.getByLabel("Web",{exact:true}).fill("partner-event-e2e.example");
  await expect(newEventForm.getByLabel("Web",{exact:true})).toHaveAttribute("type","text");
  await expectNoHorizontalOverflow(page);
  const createAccessibility = await new AxeBuilder({page}).analyze();
  expect(createAccessibility.violations).toEqual([]);
  await newEventForm.getByRole("button",{name:"Uložiť koncept"}).click();
  await expect(page).toHaveURL(/\/partner\/koncepty\/[0-9a-f-]+$/);
  await expect(page.getByText("Rozpracovaný súkromný koncept",{exact:true})).toBeVisible();
  const canonicalBeforeApproval=await page.request.get("/api/admin/events");
  expect(canonicalBeforeApproval.ok()).toBeTruthy();
  const unpublishedEvents=await canonicalBeforeApproval.json() as {events?:Array<{title?:string;status?:string}>};
  expect(unpublishedEvents.events?.find(item=>item.title===newEventTitle)?.status).not.toBe("published");
  await page.getByRole("button",{name:"Odoslať na schválenie"}).click();
  await expect(page).toHaveURL(/\/partner\/ziadosti$/);
  await page.goto("/partner");
  await expect(page.locator(".partner-dashboard-record").filter({hasText:newEventTitle})).toContainText("Čaká na schválenie");
  await page.goto("/partner/podujatia");
  const editCard=page.locator("article.partner-resource-card").filter({hasText:ownedEventTitle});
  await editCard.getByRole("link",{name:"Upraviť"}).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Miesto")).toHaveValue(originalVenue);
  await page.getByLabel("Miesto").fill(changedVenue);
  await expect(page.getByLabel("Miesto")).toHaveValue(changedVenue);
  await expectNoHorizontalOverflow(page);
  const eventDirectSave = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/api/partner/direct-events/") &&
    response.request().method() === "PATCH",
  );
  await page.getByRole("button",{name:"Uložiť zmeny"}).click();
  expect((await eventDirectSave).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("Zmeny podujatia boli uložené.");
  const canonicalAfterUpdate=await page.request.get("/api/admin/events");
  expect(canonicalAfterUpdate.ok()).toBeTruthy();
  const canonicalAfterUpdateJson=await canonicalAfterUpdate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  const savedEvent=canonicalAfterUpdateJson.events?.find(item=>item.title===ownedEventTitle);
  expect(savedEvent?.venue).toBe(changedVenue);
  expect(savedEvent?.status).toBe(project==="desktop-chromium"?"published":"draft");

  // V2 submissions are tracked with their canonical drafts on the dashboard.
  await page.goto("/partner");
  await expect(page.locator(".partner-dashboard-record").filter({hasText:newEventTitle})).toContainText("Čaká na schválenie");
  await expectNoHorizontalOverflow(page);

  await page.goto("/partner/ziadosti");
  await expect(page.getByRole("heading", { name: "Žiadosti a overenia" })).toBeVisible();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" }).last()).toBeVisible();
    await page.getByRole("button", { name: "Požiadať o overenie" }).click();
    await page.getByRole("button", { name: "Odoslať na overenie" }).click();
    await expect(page.getByRole("status")).toContainText("Žiadosť o overenie čaká na kontrolu.");
  } else {
    const claimRow=page.locator(".partner-request-list article").filter({hasText:"E2E poverený správca"}).first();
    await expect(claimRow).toContainText("Čaká na kontrolu");
    await expect(claimRow).toContainText("E2E poverený správca");
  }
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Propagácia" }).click();
  await expect(page.getByRole("heading", { name: "Propagácia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium profil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sponzorované zvýraznenie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reklamná kampaň" })).toBeVisible();
  if (project === "mobile-chromium") {
    await page.getByLabel("Typ záujmu").selectOption("OTHER");
  }
  await page.getByLabel("Krátka správa").fill("E2E nezáväzný záujem");
  await page.getByRole("button", { name: "Odoslať nezáväzný záujem" }).click();
  await expect(page.getByRole("status")).toContainText("Ďakujeme. Váš záujem sme prijali.");
  await expect(page.getByRole("heading", { name: "Odoslané záujmy" })).toBeVisible();
  const commercialHistory = page.locator("section.partner-commercial-history").filter({
    has: page.getByRole("heading",{name:"Odoslané záujmy"}),
  });
  const commercialInterest = commercialHistory.locator("article").filter({hasText:"E2E nezáväzný záujem"});
  await expect(commercialInterest).toContainText("Nové");
  await expect(commercialInterest).not.toContainText("NEW");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Nastavenia" }).click();
  await expect(page).toHaveURL(/\/partner\/nastavenia$/);
  await expect(page.getByRole("heading", { name: "Nastavenia" })).toBeVisible();
  await expect(page.getByText(expectedEmail)).toBeVisible();
  await expect(page.getByText("Aktívny")).toBeVisible();
  await expect(page.getByLabel("Meno a priezvisko *")).toHaveValue(contactName);
  await expect(page.getByLabel("Telefón")).toHaveValue(contactPhone);
  await expect(page.getByLabel("Vaša úloha / vzťah k profilu")).toHaveValue(relationship);
  await page.getByLabel("Vaša úloha / vzťah k profilu").fill(updatedRelationship);
  await page.getByRole("button", { name: "Uložiť kontaktné údaje" }).click();
  await expect(page.getByRole("status")).toContainText("Kontaktné údaje boli uložené.");
  await expect(page.getByRole("heading", { name: "Prihlasovanie a bezpečnosť" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásiť sa z Partner účtu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásiť sa", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deaktivovať účet" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Odhlásiť sa", exact: true }).click();
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
  if (project === "mobile-chromium") {
    const loginLink = page.locator("#mobile-menu [data-partner-login-entry]");
    await expect(loginLink).toHaveText("Partner účet");
    await expect(loginLink).toHaveAttribute("href", "/partner/prihlasenie");
  } else {
    const loginLink = page.locator("[data-header-masthead]").getByRole("link", { name: "Partner účet" });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/partner/prihlasenie");
  }
});

test("stale Partner moderation approval is rejected at decision time without overwriting canonical data", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof AUTH_ACCOUNT_IDS;

  if (project === "desktop-chromium") {
    await page.goto("/admin/partners/changes?status=active&q=" + encodeURIComponent("Partner H5 Stale Profil"));
    const profileRequest = page.locator(".admin-commercial-list article").filter({ hasText: "Partner H5 Stale Profil" }).first();
    await expect(profileRequest).toBeVisible();
    const profileDetailHref = await profileRequest.getByRole("link", { name: "Detail →" }).getAttribute("href");
    expect(profileDetailHref).toBeTruthy();

    const profileResponse = await page.request.get("/api/admin/directory/990005");
    expect(profileResponse.ok()).toBeTruthy();
    const profileJson = await profileResponse.json() as { profile: Record<string, unknown> & { city?: string } };
    const externalProfileUpdate = await page.request.put("/api/admin/directory/990005", {
      headers: { origin: new URL(page.url()).origin },
      data: {
        ...profileJson.profile,
        description: "Izolovaný lokálny fixture s externou H5 zmenou pre stale-base E2E overenie.",
      },
    });
    expect(externalProfileUpdate.ok()).toBeTruthy();

    await page.goto(profileDetailHref!);
    await expect(page.getByText("⚠ STALE_BASE")).toBeVisible();
    const staleMessage = "Verejný profil sa od vytvorenia žiadosti zmenil. Obnovte stránku a skontrolujte rozdiely pred rozhodnutím.";
    const submissionId = profileDetailHref!.split("/").filter(Boolean).at(-1);
    expect(submissionId).toBeTruthy();
    const decisionResponse = await page.request.patch(`/api/admin/partners/changes/${submissionId}`, {
      headers: { origin: new URL(page.url()).origin },
      data: { action: "APPROVE" },
    });
    expect(decisionResponse.status()).toBe(409);
    await expect(decisionResponse.json()).resolves.toMatchObject({ error: staleMessage });

    await page.reload();
    await expect(page.getByText(/Čaká na rozhodnutie/).first()).toBeVisible();
    const canonicalAfter = await page.request.get("/api/admin/directory/990005");
    const canonicalAfterJson = await canonicalAfter.json() as { profile: { city?: string } };
    expect(canonicalAfterJson.profile.city).toBe("Nitra");
  }

  const eventId = 990006;
  const eventTitle = "Partner H5 Stale Podujatie";
  const originalVenue = "Areál H5";
  await page.goto("/admin/partners/events?status=active&operation=UPDATE&q=" + encodeURIComponent(eventTitle));
  const eventRequest = page.locator(".admin-commercial-list article").filter({ hasText: eventTitle }).first();
  await expect(eventRequest).toBeVisible();
  const eventDetailHref = await eventRequest.getByRole("link", { name: "Detail →" }).getAttribute("href");
  expect(eventDetailHref).toBeTruthy();

  const eventResponse = await page.request.get(`/api/admin/events/${eventId}`);
  expect(eventResponse.ok()).toBeTruthy();
  const eventJson = await eventResponse.json() as {
    event: { eventType: string; cancelled: boolean; updatedAt: string; venue: string };
  };
  const origin = new URL(page.url()).origin;
  const externalEventUpdate = await page.request.patch(`/api/admin/events/${eventId}`, {
    headers: { origin },
    data: {
      eventType: eventJson.event.eventType,
      cancelled: eventJson.event.cancelled,
      updatedAt: eventJson.event.updatedAt,
    },
  });
  expect(externalEventUpdate.ok()).toBeTruthy();

  await page.goto(eventDetailHref!);
  await expect(page.getByText("⚠ STALE_BASE")).toBeVisible();
  const eventSubmissionId = eventDetailHref!.split("/").filter(Boolean).at(-1);
  expect(eventSubmissionId).toBeTruthy();
  const staleEventResponse = await page.request.patch(`/api/admin/partners/events/${eventSubmissionId}`, {
    headers: { origin: new URL(page.url()).origin },
    data: { action: "APPROVE" },
  });
  expect(staleEventResponse.status()).toBe(409);
  const staleEventJson = await staleEventResponse.json() as { error?: string };
  expect(staleEventJson.error).toBe(
    "Podujatie sa od vytvorenia žiadosti zmenilo. Obnovte stránku a skontrolujte rozdiely pred rozhodnutím.",
  );
  await page.reload();
  await expect(page.getByText(/PENDING_REVIEW/).first()).toBeVisible();
  await expect(page.getByText("PENDING_REVIEW → APPROVED", { exact: true })).toHaveCount(0);
  const canonicalEventAfter = await page.request.get(`/api/admin/events/${eventId}`);
  const canonicalEventAfterJson = await canonicalEventAfter.json() as { event: { venue: string } };
  expect(canonicalEventAfterJson.event.venue).toBe(originalVenue);
  await expectNoHorizontalOverflow(page);
});

test("ownership-sensitive self-approval is blocked by the backend for direct admin API calls", async ({ page }) => {
  const claimResponse = await page.request.patch("/api/admin/partners/claims/partner-e2e-self-claim", {
    data: { action: "APPROVE", decisionNote: "" },
  });
  expect(claimResponse.status()).toBe(403);
  const claimJson = await claimResponse.json() as { error?: string };
  expect(claimJson.error).toContain("Vlastnú žiadosť s pridelením oprávnenia na správu musí schváliť iný administrátor.");

  await page.goto("/admin/partners/claims/partner-e2e-self-claim");
  await expect(page.getByText("Čaká na posúdenie · Profil služby", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Schváliť" })).toBeVisible();
  await expect(page.getByText("CLAIM_APPROVED", { exact: true })).toHaveCount(0);

  const verificationResponse = await page.request.patch("/api/admin/partners/verifications/partner-e2e-self-verification", {
    data: { action: "VERIFY", reviewNote: "" },
  });
  expect(verificationResponse.status()).toBe(403);
  const verificationJson = await verificationResponse.json() as { error?: string };
  expect(verificationJson.error).toContain("Vlastnú žiadosť s pridelením oprávnenia na správu musí schváliť iný administrátor.");

  await page.goto("/admin/partners/verifications/partner-e2e-self-verification");
  await expect(page.getByText(/PENDING_VERIFICATION · membership OWNER/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Overiť" })).toBeVisible();
  await expect(page.getByText("VERIFICATION_VERIFIED", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("internal admin Partner overview and account detail are protected admin pages", async ({ page }, testInfo) => {
  const project=testInfo.project.name as keyof typeof AUTH_EMAILS;
  // The partner account overview is a server-paginated accessible list,
  // not a table. Filter to the seeded account before opening its details.
  await page.goto("/admin/partners?q=" + encodeURIComponent(AUTH_EMAILS[project]));
  await expect(page.getByRole("heading",{name:"Partneri",exact:true})).toBeVisible();
  // Admin V2 keeps the legacy queues in a collapsed disclosure.
  await page.locator("[data-admin-partner-attention] summary").click();
  await expect(page.getByRole("link",{name:"Komerčné žiadosti (1)"})).toBeVisible();
  // Account ID is a stable row attribute, not visible row text.
  const accountItem=page.locator('[data-admin-partner-account="'+AUTH_ACCOUNT_IDS[project]+'"]');
  await expect(accountItem.getByText(AUTH_EMAILS[project])).toBeVisible();
  await accountItem.getByRole("link",{name:/Otvoriť partnera/}).click();
  await expect(page.getByRole("region",{name:"Prehľad partnera"}).getByText(AUTH_EMAILS[project])).toBeVisible();
  // Identity and security settings moved to the account tab.
  await page.getByRole("navigation",{name:"Sekcie detailu partnera"}).getByRole("link",{name:"Účet"}).click();
  await expect(page.getByRole("heading",{name:"Kontakt"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Prihlasovacie metódy"})).toBeVisible();
  const accountOverview=page.getByRole("region",{name:"Prehľad partnera"});
  await expect(accountOverview.getByText(project==="desktop-chromium"?"E2E Partner Desktop":"E2E Partner Mobile")).toBeVisible();
  await expect(accountOverview.getByText(project==="desktop-chromium"?"E2E manažér aktualizovaný":"E2E správca aktualizovaný")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Bezpečnostné akcie"})).toBeVisible();
  await page.goto("/admin/partners/commercial?status=NEW");
  await expect(page.getByRole("heading",{name:"Komerčné leady"})).toBeVisible();
  const leadRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]});
  await expect(leadRow).toContainText("E2E nezáväzný záujem");
  await leadRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:"Spracovanie leadu"})).toBeVisible();
  // Server-rendered controls can be interacted with before the React client
  // hydrates them. Wait for React to attach the controlled select's props
  // before changing its value; otherwise the PATCH can omit the new status.
  await page.waitForFunction(() => {
    const select = document.querySelector(".admin-commercial-actions select");
    return select !== null && Object.keys(select).some((key) => key.startsWith("__reactProps$"));
  });
  const statusSelect = page.getByLabel("Stav");
  await statusSelect.selectOption("CONTACTED");
  await expect(statusSelect).toHaveValue("CONTACTED");
  const leadUpdate = page.waitForResponse((response) =>
    response.url().includes("/api/admin/partners/commercial/")
    && response.request().method() === "PATCH",
  );
  await page.getByRole("button",{name:"Uložiť"}).click();
  const updatedLeadResponse = await leadUpdate;
  expect(updatedLeadResponse.ok()).toBeTruthy();
  expect(updatedLeadResponse.request().postDataJSON()).toMatchObject({ status: "CONTACTED" });
  await expect(page.getByRole("status")).toContainText("Zmena bola uložená.");
  await page.goto("/admin/partners");
  await page.locator("[data-admin-partner-attention] summary").click();
  await expect(page.getByRole("link",{name:"Komerčné žiadosti (0)"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Nové profily (1)"})).toBeVisible();
  await page.getByRole("link",{name:"Nové profily (1)"}).click();
  await expect(page.getByRole("heading",{name:"Nové profily"})).toBeVisible();

  if(project==="desktop-chromium"){
    const newRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Nová Služba"});
    await expect(newRow).toContainText("zhoda: Bez zhody");
    await newRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByRole("heading",{name:"Údaje na vytvorenie"})).toBeVisible();
    const createResponse=page.waitForResponse((response)=>
      response.url().includes("/api/admin/partners/submissions/") &&
      response.request().method()==="PATCH" && response.ok(),
    );
    await page.getByRole("button",{name:"Schváliť a publikovať"}).click();
    const createDialog=page.getByRole("dialog",{name:"Schváliť a publikovať profil?"});
    await expect(createDialog).toBeVisible();
    // Cancel stays read-only; the same action can be reopened and explicitly confirmed.
    await createDialog.getByRole("button",{name:"Zrušiť"}).click();
    await expect(createDialog).not.toBeVisible();
    await page.getByRole("button",{name:"Schváliť a publikovať"}).click();
    await createDialog.getByRole("button",{name:"Schváliť a publikovať"}).click();
    await createResponse;
    await expect(page.getByText("CREATED_NEW")).toBeVisible();
    const directoryResponse=await page.request.get("/api/admin/directory?limit=100");
    expect(directoryResponse.ok()).toBeTruthy();
    const directoryJson=await directoryResponse.json() as {items?:Array<{name?:string;status?:string}>;profiles?:Array<{name?:string;status?:string}>};
    const directoryItems=directoryJson.items??directoryJson.profiles??[];
    // This request already owns a canonical D1 draft (subject_id is set).
    // Admin APPROVE intentionally publishes that existing row; only the
    // historical no-subject-id CREATE path creates an unpublished draft.
    expect(directoryItems.find((item)=>item.name==="Partner E2E Nová Služba")?.status).toBe("published");
    await page.goto("/admin/partners/accounts/partner-e2e-desktop?tab=historia");
    const createdMembership=page.locator("section").filter({hasText:"História prístupov"}).locator("article").filter({hasText:"Partner E2E Nová Služba"});
    await expect(createdMembership).toContainText("Správca profilu");
    await page.goto("/admin/partners");
  }else{
    const newRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Nová Organizácia Mobile"});
    await expect(newRow).toContainText("zhoda: Vysoká zhoda");
    await newRow.getByRole("link",{name:"Detail →"}).click();
    // This V2 draft matches the seeded existing organization by its public phone,
    // not by a normalized website domain (the website field is plain text).
    await expect(page.getByText("Rovnaký verejný telefón")).toBeVisible();
    // V2 creates its canonical D1 draft before submission. Linking it to
    // a different existing profile is prohibited, so Admin publishes this draft.
    await expect(page.getByRole("button",{name:"Prepojiť tento profil"})).toHaveCount(0);
    const approveResponse=page.waitForResponse((response)=>
      response.url().includes("/api/admin/partners/submissions/") &&
      response.request().method()==="PATCH" && response.ok(),
    );
    await page.getByRole("button",{name:"Schváliť a publikovať"}).click();
    const approveDialog=page.getByRole("dialog",{name:"Schváliť a publikovať profil?"});
    await expect(approveDialog).toBeVisible();
    await approveDialog.getByRole("button",{name:"Schváliť a publikovať"}).click();
    await approveResponse;
    await expect(page.getByText("CREATED_NEW")).toBeVisible();
    await page.goto("/admin/partners/accounts/partner-e2e-mobile?tab=historia");
    const createdMembership=page.locator("section").filter({hasText:"História prístupov"}).locator("article").filter({hasText:"Partner E2E Nová Organizácia Mobile"});
    await expect(createdMembership).toContainText("Správca profilu");
    await page.goto("/admin/partners");
  }

  const eventCreateTitle=project==="desktop-chromium"?"Partner E2E Nové Podujatie Desktop":"Partner E2E Nové Podujatie Mobile";
  const ownedEventTitle=project==="desktop-chromium"?"Partner E2E Publikované Podujatie":"Partner E2E Koncept Podujatie";
  const changedVenue=project==="desktop-chromium"?"Areál Desktop Zmenený":"Areál Mobile Zmenený";
  const expectedPublicationStatus=project==="desktop-chromium"?"published":"draft";

  await page.goto("/admin/partners");
  // The old OWNER update is saved directly; only the new event and seeded
  // stale moderation fixture remain in the active admin queue.
  await page.locator("[data-admin-partner-attention] summary").click();
  await expect(page.getByRole("link",{name:"Podujatia (2)"})).toBeVisible();
  await page.getByRole("link",{name:"Podujatia (2)"}).click();
  await expect(page.getByRole("heading",{name:"Podujatia"})).toBeVisible();

  const createEventRow=page.locator(".admin-commercial-list article").filter({hasText:eventCreateTitle});
  await expect(createEventRow).toContainText("CREATE");
  await createEventRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:"Údaje na vytvorenie"})).toBeVisible();
  // The shared in-page admin dialog replaces the former native browser confirm.
  // Closing it must never create an event or change the moderation state.
  await page.getByRole("button",{name:"CREATE EVENT (DRAFT)"}).click();
  const createEventDialog=page.getByRole("dialog",{name:"Potvrdiť partnerské rozhodnutie"});
  await expect(createEventDialog).toBeVisible();
  await createEventDialog.getByRole("button",{name:"Zrušiť"}).click();
  await expect(createEventDialog).not.toBeVisible();
  await expect(page.getByText("CREATED_NEW")).not.toBeVisible();

  const createEventResponse=page.waitForResponse(response=>
    response.url().includes("/api/admin/partners/events/") &&
    response.request().method()==="PATCH" && response.ok(),
  );
  await page.getByRole("button",{name:"CREATE EVENT (DRAFT)"}).click();
  await expect(createEventDialog).toBeVisible();
  await expect(createEventDialog).toContainText("vytvoriť canonical podujatie ako DRAFT");
  await createEventDialog.getByRole("button",{name:"Potvrdiť"}).click();
  await createEventResponse;
  await expect(page.getByText("CREATED_NEW")).toBeVisible();

  const canonicalAfterCreate=await page.request.get("/api/admin/events");
  expect(canonicalAfterCreate.ok()).toBeTruthy();
  const canonicalAfterCreateJson=await canonicalAfterCreate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  // A current Partner CREATE request already owns a canonical D1 draft.
  // Admin APPROVE publishes that same event; only legacy requests without
  // subject_id create a new, unpublished DRAFT on approval.
  expect(canonicalAfterCreateJson.events?.find(item=>item.title===eventCreateTitle)?.status).toBe("published");

  await page.goto("/admin/partners/events?status=active");
  // An approved OWNER's direct save must not queue an UPDATE moderation job.
  const updateEventRow=page.locator(".admin-commercial-list article").filter({hasText:ownedEventTitle});
  await expect(updateEventRow).toHaveCount(0);
  const canonicalAfterUpdate=await page.request.get("/api/admin/events");
  expect(canonicalAfterUpdate.ok()).toBeTruthy();
  const canonicalAfterUpdateJson=await canonicalAfterUpdate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  const updatedEvent=canonicalAfterUpdateJson.events?.find(item=>item.title===ownedEventTitle);
  expect(updatedEvent?.venue).toBe(changedVenue);
  expect(updatedEvent?.status).toBe(expectedPublicationStatus);

  // The isolated Partner D1 fixture intentionally does not seed managed portal sections.
  // Canonical API assertions above prove the direct OWNER patch and publication-status preservation;
  // public route rendering is covered by the dedicated event/public E2E suites.
  await page.goto("/admin/partners");
  await page.locator("[data-admin-partner-attention] summary").click();
  await expect(page.getByRole("link",{name:"Podujatia (1)"})).toBeVisible();

  if(project==="desktop-chromium"){
    // The seeded stale request is the only active moderation change; direct
    // profile edits must never require a second Admin approval.
    await expect(page.getByRole("link",{name:"Návrhy úprav (1)"})).toBeVisible();
    await page.goto("/admin/partners/changes?status=active");
    const changeRow=page.locator(".admin-commercial-list article").filter({hasText:"Partner E2E Veterina"});
    await expect(changeRow).toHaveCount(0);
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Trnava",{exact:true}).first()).toBeVisible();
    await page.goto("/admin/partners");
    await page.locator("[data-admin-partner-attention] summary").click();
    // A newly approved canonical draft grants an OWNER directly and does not
    // create the legacy extra verification request.
    await expect(page.getByRole("link",{name:"Overenia (2)"})).toBeVisible();
    await page.goto("/admin/partners/verifications?status=PENDING_VERIFICATION");
    const verificationRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]}).filter({hasText:"Partner E2E Veterina"});
    await expect(verificationRow).toContainText("Čaká na overenie");
    await verificationRow.getByRole("link",{name:"Detail →"}).click();
    const verificationResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/partners/verifications/") &&
      response.request().method() === "PATCH" &&
      response.ok(),
    );
    await page.getByRole("button",{name:"Overiť",exact:true}).click();
    const verificationDialog=page.getByRole("dialog",{name:"Overiť správcu profilu?"});
    await expect(verificationDialog).toBeVisible();
    await verificationDialog.getByRole("button",{name:"Overiť správcu"}).click();
    await verificationResponse;
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Overený správca")).toBeVisible();
  }else{
    await expect(page.getByRole("link",{name:"Prevzatia (2)"})).toBeVisible();
    await page.goto("/admin/partners/claims?status=PENDING");
    const claimRow=page.locator(".admin-commercial-list article").filter({hasText:AUTH_EMAILS[project]});
    await expect(claimRow).toContainText("Konflikt správy profilu");
    await claimRow.getByRole("link",{name:"Detail →"}).click();
    await expect(page.getByText("Konflikt správy profilu").first()).toBeVisible();
    // The resource already has another active owner. Single-manager policy
    // must reject a second approval; this is not a successful claim.
    const claimResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/partners/claims/") &&
      response.request().method() === "PATCH",
    );
    await page.getByRole("button",{name:"Schváliť",exact:true}).click();
    const claimDialog=page.getByRole("dialog",{name:"Schváliť správu záznamu?"});
    await expect(claimDialog).toBeVisible();
    await claimDialog.getByRole("button",{name:"Schváliť prevzatie"}).click();
    const blockedClaimResponse = await claimResponse;
    expect(blockedClaimResponse.status()).toBe(409);
    await expect(page.getByText("Tento záznam už spravuje iný partner. Najprv mu odoberte prístup.")).toBeVisible();
    await page.goto("/admin/partners");
    await page.locator("[data-admin-partner-attention] summary").click();
    await expect(page.getByRole("link",{name:"Prevzatia (2)"})).toBeVisible();
    // Mobile's seeded self-verification is the sole remaining pending item.
    // Approved canonical drafts do not create an extra verification request.
    await expect(page.getByRole("link",{name:"Overenia (1)"})).toBeVisible();
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
