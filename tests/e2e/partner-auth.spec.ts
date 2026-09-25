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
    await expect(page.getByLabel("E-mail",{exact:true})).toBeVisible();
    await expect(page.getByLabel("Heslo",{exact:true})).toBeVisible();
    if (path === "/partner/registracia") {
      await expect(page.getByLabel("Potvrdenie hesla",{exact:true})).toBeVisible();
      await expect(page.getByRole("button", { name: "Vytvoriť Partner účet" })).toBeDisabled();
    } else {
      await expect(page.getByRole("button", { name: "Prihlásiť sa" })).toBeDisabled();
      await expect(page.getByRole("link", { name: "Zabudli ste heslo?" })).toBeVisible();
    }
    await expect(page.getByLabel("Pracovný e-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Poslať prihlasovací odkaz" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}

test("forgot and reset password surfaces are accessible and overflow-safe", async ({ page }) => {
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

test("public header exposes Partner login as a utility action without overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await dismissCookieConsent(page);
  if(testInfo.project.name==="mobile-chromium"){
    await page.getByRole("button",{name:"Otvoriť menu"}).click();
    const mobileNav=page.getByRole("navigation",{name:"Mobilná navigácia"});
    const login=mobileNav.getByRole("link",{name:"Prihlásiť sa"});
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href","/partner/prihlasenie");
  }else{
    const login=page.locator("[data-header-masthead]").getByRole("link",{name:"Prihlásiť sa"});
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href","/partner/prihlasenie");
    const mainNav=page.getByRole("navigation",{name:"Hlavná navigácia"});
    await expect(mainNav.getByRole("link",{name:"Prihlásiť sa"})).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});

test("anonymous Directory profile separates management from public correction and preserves returnTo", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/adresar/veterinari/partner-e2e-veterina");
  await expect(page.getByRole("heading", { name: "Spravujete tento profil?" })).toBeVisible();
  await expect(page.getByText("Správa základných údajov profilu je bezplatná.")).toBeVisible();
  await expect(page.getByText("Premium profil",{exact:true})).toBeVisible();
  await expect(page.getByText("Sponzorované",{exact:true})).toBeVisible();
  const claimPath="/partner/prevziat-profil/DIRECTORY_PROFILE/990001";
  const claimLink=page.getByRole("link",{name:"Spravovať tento profil"});
  await expect(claimLink).toHaveAttribute("href","/partner/prihlasenie?returnTo="+encodeURIComponent(claimPath));
  await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveAttribute(
    "href",
    "/adresar/veterinari/partner-e2e-veterina/upravit",
  );
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

  await page.getByLabel("Meno a priezvisko *").fill(contactName);
  await page.getByLabel("Telefón").fill(contactPhone);
  await page.getByLabel("Vaša úloha / vzťah k profilu").fill(relationship);
  await expectNoHorizontalOverflow(page);
  const onboardingAccessibility = await new AxeBuilder({ page }).analyze();
  expect(onboardingAccessibility.violations).toEqual([]);
  await page.getByRole("button",{name:"Pokračovať do Partner účtu"}).click();

  if(project==="mobile-chromium"){
    await expect(page).toHaveURL(/\/partner\/prevziat-profil\/DIRECTORY_PROFILE\/990001$/);
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByRole("heading",{name:"Spravujete tento profil?"})).toBeVisible();
    const requestManagement=page.getByRole("link",{name:"Požiadať o správu profilu"});
    await expect(requestManagement).toHaveAttribute("href","/partner/prevziat-profil/DIRECTORY_PROFILE/990001");
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toBeVisible();
    await requestManagement.click();
    await expect(page.getByRole("heading",{name:"Prevziať existujúci profil"})).toBeVisible();
    await page.getByLabel(/Ako ste spojení/).fill("E2E poverený správca");
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
  await expectNoHorizontalOverflow(page);

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
    await page.getByRole("button", { name: "Otvoriť menu" }).click();
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

  await page.getByRole("link", { name: "Moje profily" }).click();
  if (project === "desktop-chromium") {
    await expect(page.getByRole("heading", { name: "Partner E2E Veterina" })).toBeVisible();
    await expect(page.getByText("OWNER")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await expect(page.getByRole("heading", { name: "Pridať nový profil" })).toBeVisible();
    await page.getByLabel("Názov", { exact: true }).fill("Partner E2E Nová Služba");
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
    await expect(page.getByRole("heading",{name:"Tento profil spravujete cez Partner účet."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Upraviť profil"})).toHaveAttribute(
      "href",
      "/partner/profily/partner-resource-e2e-directory/upravit",
    );
    await expect(page.getByRole("link",{name:"Spravovať tento profil"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Požiadať o správu profilu"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toBeVisible();
    await expectNoHorizontalOverflow(page);
  } else {
    await expect(page.getByRole("heading", { name: "Partner E2E Organizácia" })).toBeVisible();
    await expect(page.getByText("EDITOR")).toBeVisible();
    await expect(page.getByText("Neoverené")).toBeVisible();

    await page.getByRole("link", { name: "Pridať nový profil" }).click();
    await page.getByRole("radio", { name: /Organizácia na pomoc psom/ }).check();
    await page.getByLabel("Názov", { exact: true }).fill("Partner E2E Organizácia");
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
    const profileChangesSection=page.locator("section.partner-requests-section").filter({
      has: page.getByRole("heading",{name:"Úpravy profilov"}),
    });
    const organizationChange=profileChangesSection.locator("article").filter({hasText:"Partner E2E Organizácia"});
    await expect(organizationChange).toContainText("Čaká na kontrolu");
    page.once("dialog", dialog => void dialog.accept());
    await organizationChange.getByRole("button", { name: "Zrušiť návrh" }).click();
    await expect(organizationChange).toContainText("Zrušené");
    const newProfilesSection=page.locator("section.partner-requests-section").filter({
      has: page.getByRole("heading",{name:"Moje návrhy nových profilov"}),
    });
    await expect(newProfilesSection.locator("article").filter({hasText:"Partner E2E Organizácia"})).toContainText("Čaká na kontrolu");

    await page.goto("/organizacie/partner-e2e-organizacia");
    await expect(page.getByRole("heading",{name:"Tento profil spravujete cez Partner účet."})).toBeVisible();
    await expect(page.getByRole("link",{name:"Upraviť profil"})).toHaveAttribute(
      "href",
      "/partner/profily/partner-resource-e2e-organization/upravit",
    );
    await expect(page.getByRole("link",{name:"Otvoriť Partner účet"})).toHaveAttribute("href","/partner/profily");
    await expect(page.getByRole("link",{name:"Navrhnúť opravu údajov"})).toHaveAttribute("href","/opravy-a-podnety");
    await expect(page.getByRole("link",{name:"Požiadať o správu profilu"})).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  const ownedEventTitle=project==="desktop-chromium"?"Partner E2E Publikované Podujatie":"Partner E2E Koncept Podujatie";
  const newEventTitle=project==="desktop-chromium"?"Partner E2E Nové Podujatie Desktop":"Partner E2E Nové Podujatie Mobile";
  const originalVenue=project==="desktop-chromium"?"Areál Desktop":"Areál Mobile";
  const changedVenue=project==="desktop-chromium"?"Areál Desktop Zmenený":"Areál Mobile Zmenený";

  await page.goto("/partner/podujatia");
  await expect(page.getByRole("heading",{name:"Moje podujatia"})).toBeVisible();
  const ownedEventCard=page.locator("article.partner-resource-card").filter({hasText:ownedEventTitle});
  await expect(ownedEventCard).toContainText(project==="desktop-chromium"?"Publikované":"Koncept");
  await expect(ownedEventCard).toContainText(project==="desktop-chromium"?"OWNER":"EDITOR");
  await expectNoHorizontalOverflow(page);

  if (project === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole("link",{name:"Pridať podujatie"}).first().click();
  await expect(page.getByRole("heading",{name:"Pridať podujatie"})).toBeVisible();
  await expect(page.getByText("Po schválení administrátorom sa podujatie uloží ako koncept. Obrázok, SEO údaje a zverejnenie následne doplní redakcia Psipedie.")).toBeVisible();
  const partnerLayout = await page.evaluate(() => {
    const stickyHeader = document.querySelector<HTMLElement>(".site-header");
    const heading = document.querySelector<HTMLElement>(".partner-page-heading h1");
    const intro = document.querySelector<HTMLElement>(".partner-new-profile-intro");
    if (!stickyHeader || !heading || !intro) return null;
    const headerBox = stickyHeader.getBoundingClientRect();
    return {
      headerBottom: headerBox.bottom,
      headingTop: heading.getBoundingClientRect().top,
      introTop: intro.getBoundingClientRect().top,
      viewportWidth: window.innerWidth,
    };
  });
  expect(partnerLayout).not.toBeNull();
  expect(partnerLayout!.headingTop).toBeGreaterThanOrEqual(partnerLayout!.headerBottom - 1);
  expect(partnerLayout!.introTop).toBeGreaterThanOrEqual(partnerLayout!.headerBottom - 1);
  if (project === "mobile-chromium") expect(partnerLayout!.viewportWidth).toBe(390);
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("Názov",{exact:true}).fill(newEventTitle);
  await page.getByLabel("Krátky popis").fill("Nové moderované Partner podujatie pre izolovaný E2E scenár.");
  await page.getByLabel("Typ podujatia").selectOption("Seminár");
  await page.getByLabel("Dátum začiatku").fill(project==="desktop-chromium"?"2099-12-01":"2099-12-02");
  await page.getByLabel("Čas začiatku").fill("10:00");
  await page.getByLabel("Dátum konca").fill(project==="desktop-chromium"?"2099-12-01":"2099-12-02");
  await page.getByLabel("Čas konca").fill("16:00");
  await page.getByLabel("Miesto").fill(project==="desktop-chromium"?"E2E Nový Areál Desktop":"E2E Nový Areál Mobile");
  await page.getByLabel("Mesto / Online").fill(project==="desktop-chromium"?"Nitra":"Trnava");
  await page.getByLabel("Kraj").selectOption(project==="desktop-chromium"?"Nitriansky kraj":"Trnavský kraj");
  await page.getByLabel("Adresa").fill("E2E Eventová 1");
  await page.getByLabel("Organizátor").fill("Psipedia Partner E2E");
  await page.getByLabel("Popis",{exact:true}).fill("Toto je dostatočne dlhý opis nového Partner podujatia, ktoré musí prejsť moderáciou.");
  await page.getByLabel("Praktické informácie").fill("Registrácia je povinná.");
  await page.getByLabel("Web").fill(project==="desktop-chromium"?"https://example.sk/new-event-desktop":"https://example.sk/new-event-mobile");
  await page.getByRole("textbox",{name:"Registrácia",exact:true}).fill(project==="desktop-chromium"?"https://example.sk/new-event-desktop/register":"https://example.sk/new-event-mobile/register");
  await expectNoHorizontalOverflow(page);
  const createAccessibility=await new AxeBuilder({page}).analyze();
  expect(createAccessibility.violations).toEqual([]);
  await page.getByRole("button",{name:"Odoslať na kontrolu"}).click();
  await expect(page.getByRole("status")).toContainText("Podujatie sme prijali a čaká na kontrolu.");

  const canonicalBeforeCreate=await page.request.get("/api/admin/events");
  expect(canonicalBeforeCreate.ok()).toBeTruthy();
  const canonicalBeforeCreateJson=await canonicalBeforeCreate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  expect(canonicalBeforeCreateJson.events?.find(item=>item.title===newEventTitle)).toBeUndefined();

  await page.goto("/partner/podujatia");
  const editCard=page.locator("article.partner-resource-card").filter({hasText:ownedEventTitle});
  await editCard.getByRole("link",{name:"Upraviť"}).click();
  await page.getByLabel("Miesto").fill(changedVenue);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button",{name:"Odoslať zmeny na kontrolu"}).click();
  await expect(page.getByRole("status")).toContainText("Zmeny podujatia sme prijali a čakajú na kontrolu.");

  const canonicalBeforeUpdate=await page.request.get("/api/admin/events");
  expect(canonicalBeforeUpdate.ok()).toBeTruthy();
  const canonicalBeforeUpdateJson=await canonicalBeforeUpdate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  expect(canonicalBeforeUpdateJson.events?.find(item=>item.title===ownedEventTitle)?.venue).toBe(originalVenue);

  await page.goto("/partner/ziadosti");
  const eventRequests=page.locator("section.partner-requests-section").filter({has:page.getByRole("heading",{name:"Návrhy podujatí"})});
  await expect(eventRequests.locator("article").filter({hasText:newEventTitle})).toContainText("Čaká na kontrolu");
  await expect(eventRequests.locator("article").filter({hasText:ownedEventTitle})).toContainText("Čaká na kontrolu");
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
  await expect(page.getByLabel("Meno a priezvisko *")).toHaveValue(contactName);
  await expect(page.getByLabel("Telefón")).toHaveValue(contactPhone);
  await expect(page.getByLabel("Vaša úloha / vzťah k profilu")).toHaveValue(relationship);
  await page.getByLabel("Vaša úloha / vzťah k profilu").fill(updatedRelationship);
  await page.getByRole("button", { name: "Uložiť kontaktné údaje" }).click();
  await expect(page.getByRole("status")).toContainText("Kontaktné údaje boli uložené.");
  await expect(page.getByRole("heading", { name: "Prihlasovanie a bezpečnosť" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásiť sa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deaktivovať účet" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Odhlásiť sa" }).click();
  await expect(page).toHaveURL(/\/partner\/prihlasenie$/);
  if (project === "mobile-chromium") {
    const loginLink = page.locator("#mobile-menu [data-partner-login-entry]");
    await expect(loginLink).toHaveText("Prihlásiť sa");
    await expect(loginLink).toHaveAttribute("href", "/partner/prihlasenie");
  } else {
    const loginLink = page.locator("[data-header-masthead]").getByRole("link", { name: "Prihlásiť sa" });
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
      data: {
        ...profileJson.profile,
        city: "Bratislava",
        description: "Izolovaný lokálny fixture s externou H5 zmenou pre stale-base E2E overenie.",
      },
    });
    expect(externalProfileUpdate.ok()).toBeTruthy();

    await page.goto(profileDetailHref!);
    await expect(page.getByText("⚠ STALE_BASE")).toBeVisible();
    page.once("dialog", dialog => void dialog.accept());
    await page.getByRole("button", { name: "Schváliť zmeny" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Verejný profil sa od vytvorenia žiadosti zmenil. Obnovte stránku a skontrolujte rozdiely pred rozhodnutím.",
    );

    await page.reload();
    await expect(page.getByText(/Čaká na rozhodnutie/).first()).toBeVisible();
    const canonicalAfter = await page.request.get("/api/admin/directory/990005");
    const canonicalAfterJson = await canonicalAfter.json() as { profile: { city?: string } };
    expect(canonicalAfterJson.profile.city).toBe("Bratislava");
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
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Schváliť zmeny" }).click();
  await expect(page.getByRole("status")).toContainText(
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
  await expect(page.getByText(/PENDING · DIRECTORY_PROFILE/)).toBeVisible();
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
  await page.goto("/admin/partners");
  await expect(page.getByRole("heading",{name:"Partneri"})).toBeVisible();
  await expect(page.getByRole("link",{name:/Komerčné leady 1/})).toBeVisible();
  const accountRow=page.getByRole("row").filter({hasText:AUTH_ACCOUNT_IDS[project]});
  await expect(accountRow.getByText(AUTH_EMAILS[project])).toBeVisible();
  await accountRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:AUTH_EMAILS[project]})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Kontakt"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Prihlasovacie metódy"})).toBeVisible();
  await expect(page.getByText(project==="desktop-chromium"?"E2E Partner Desktop":"E2E Partner Mobile")).toBeVisible();
  await expect(page.getByText(project==="desktop-chromium"?"E2E manažér aktualizovaný":"E2E správca aktualizovaný")).toBeVisible();
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

  const eventCreateTitle=project==="desktop-chromium"?"Partner E2E Nové Podujatie Desktop":"Partner E2E Nové Podujatie Mobile";
  const ownedEventTitle=project==="desktop-chromium"?"Partner E2E Publikované Podujatie":"Partner E2E Koncept Podujatie";
  const changedVenue=project==="desktop-chromium"?"Areál Desktop Zmenený":"Areál Mobile Zmenený";
  const expectedPublicationStatus=project==="desktop-chromium"?"published":"draft";

  await page.goto("/admin/partners");
  await expect(page.getByRole("link",{name:/Podujatia 3/})).toBeVisible();
  await page.getByRole("link",{name:/Podujatia 3/}).click();
  await expect(page.getByRole("heading",{name:"Podujatia"})).toBeVisible();

  const createEventRow=page.locator(".admin-commercial-list article").filter({hasText:eventCreateTitle});
  await expect(createEventRow).toContainText("CREATE");
  await createEventRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:"Údaje na vytvorenie"})).toBeVisible();
  const createEventResponse=page.waitForResponse(response=>
    response.url().includes("/api/admin/partners/events/") &&
    response.request().method()==="PATCH" && response.ok(),
  );
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"CREATE EVENT (DRAFT)"}).click();
  await createEventResponse;
  await expect(page.getByText("CREATED_NEW")).toBeVisible();

  const canonicalAfterCreate=await page.request.get("/api/admin/events");
  expect(canonicalAfterCreate.ok()).toBeTruthy();
  const canonicalAfterCreateJson=await canonicalAfterCreate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  expect(canonicalAfterCreateJson.events?.find(item=>item.title===eventCreateTitle)?.status).toBe("draft");

  await page.goto("/admin/partners/events?status=active");
  const updateEventRow=page.locator(".admin-commercial-list article").filter({hasText:ownedEventTitle});
  await expect(updateEventRow).toContainText("UPDATE");
  await updateEventRow.getByRole("link",{name:"Detail →"}).click();
  await expect(page.getByRole("heading",{name:"OLD → NEW"})).toBeVisible();
  await expect(page.getByText(changedVenue,{exact:true}).first()).toBeVisible();
  const approveEventResponse=page.waitForResponse(response=>
    response.url().includes("/api/admin/partners/events/") &&
    response.request().method()==="PATCH" && response.ok(),
  );
  page.once("dialog",dialog=>void dialog.accept());
  await page.getByRole("button",{name:"Schváliť zmeny"}).click();
  await approveEventResponse;
  await expect(page.getByText("UPDATED")).toBeVisible();

  const canonicalAfterUpdate=await page.request.get("/api/admin/events");
  expect(canonicalAfterUpdate.ok()).toBeTruthy();
  const canonicalAfterUpdateJson=await canonicalAfterUpdate.json() as {events?:Array<{title?:string;venue?:string;status?:string}>};
  const updatedEvent=canonicalAfterUpdateJson.events?.find(item=>item.title===ownedEventTitle);
  expect(updatedEvent?.venue).toBe(changedVenue);
  expect(updatedEvent?.status).toBe(expectedPublicationStatus);

  // The isolated Partner D1 fixture intentionally does not seed managed portal sections.
  // Canonical API assertions above prove the approved patch and publication-status preservation;
  // public route rendering is covered by the dedicated event/public E2E suites.
  await page.goto("/admin/partners");
  await expect(page.getByRole("link",{name:/Podujatia 1/})).toBeVisible();

  if(project==="desktop-chromium"){
    await expect(page.getByRole("link",{name:/Úpravy 2/})).toBeVisible();
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
    await expect(page.getByRole("link",{name:/Úpravy 1/})).toBeVisible();
    await page.goto("/adresar/veterinari/partner-e2e-veterina");
    await expect(page.getByText("Trnava",{exact:true}).first()).toBeVisible();
    await page.goto("/admin/partners");

    await expect(page.getByRole("link",{name:/Overenia 3/})).toBeVisible();
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
    await expect(page.getByRole("link",{name:/Claims 2/})).toBeVisible();
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
    await expect(page.getByRole("link",{name:/Claims 1/})).toBeVisible();
    await expect(page.getByRole("link",{name:/Overenia 4/})).toBeVisible();
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
