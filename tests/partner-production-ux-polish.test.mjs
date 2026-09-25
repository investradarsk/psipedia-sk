import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");

const [
  layout,
  header,
  partnerCss,
  newEventPage,
  editEventPage,
  worker,
  passwordField,
  passwordAuthForm,
  passwordResetForm,
  securitySettings,
  logoutButton,
  partnerShell,
  settingsActions,
  loginPage,
  resetPage,
  partnerHome,
  profilesPage,
  partnerEventsPage,
  requestsPage,
  promotionPage,
  commercialPanel,
  uiLabels,
  locationSelector,
  newProfileForm,
] = await Promise.all([
  "app/layout.tsx",
  "components/site-header.tsx",
  "app/partner/partner.css",
  "app/partner/podujatia/nove/page.tsx",
  "app/partner/podujatia/[resourceId]/upravit/page.tsx",
  "worker/index.ts",
  "components/partner-password-field.tsx",
  "components/partner-password-auth-form.tsx",
  "components/partner-password-reset-form.tsx",
  "components/partner-security-settings.tsx",
  "components/partner-logout-button.tsx",
  "components/partner-shell.tsx",
  "components/partner-settings-actions.tsx",
  "app/partner/prihlasenie/page.tsx",
  "app/partner/obnova-hesla/page.tsx",
  "app/partner/page.tsx",
  "app/partner/profily/page.tsx",
  "app/partner/podujatia/page.tsx",
  "app/partner/ziadosti/page.tsx",
  "app/partner/propagacia/page.tsx",
  "components/partner-commercial-panel.tsx",
  "lib/partner-ui-labels.ts",
  "components/slovakia-location-selector.tsx",
  "components/partner-new-profile-form.tsx",
].map(read));

test("public header derives Partner auth state on the server", () => {
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /PARTNER_SESSION_COOKIE/);
  assert.match(layout, /partnerToken \? await getPartnerSession/);
  assert.match(layout, /partnerAuthenticated=\{Boolean\(partnerSession\)\}/);

  assert.match(header, /partnerAuthenticated: boolean/);
  assert.match(header, /partnerAuthenticated \? "\/partner" : "\/partner\/prihlasenie"/);
  assert.match(header, /partnerAuthenticated \? "Partner účet" : "Prihlásiť sa"/);
  assert.match(header, /href=\{partnerHref\}/);
  assert.match(header, />\{partnerLabel\}<\/Link>/);
});

test("Partner-specific header state cannot enter the shared public HTML cache", () => {
  assert.match(
    worker,
    /request\.headers\.has\("authorization"\) \|\| request\.headers\.has\("cookie"\) \|\| request\.headers\.has\("cf-access-jwt-assertion"\)/,
  );
  assert.match(layout, /export const dynamic = "force-dynamic"/);
});

test("Partner shell uses the measured sticky header height as shared scroll offset", () => {
  assert.match(header, /--psipedia-sticky-header-height/);
  assert.match(header, /new ResizeObserver\(update\)/);
  assert.match(header, /header\.getBoundingClientRect\(\)\.height/);
  assert.match(
    partnerCss,
    /scroll-margin-top: calc\(var\(--psipedia-sticky-header-height, 0px\) \+ 16px\)/,
  );
});

test("Partner event copy is external-facing and contains no internal canonical/admin jargon", () => {
  assert.match(
    newEventPage,
    /Po schválení administrátorom sa podujatie uloží ako koncept\. Priložený obrázok prejde rovnakou moderátorskou kontrolou; SEO údaje a zverejnenie zostávajú redakčným krokom\./,
  );
  assert.doesNotMatch(newEventPage, /canonical|admin flow/i);
  assert.doesNotMatch(editEventPage, /canonical|admin flow|\bslug\b/i);
  assert.match(editEventPage, /Webová adresa a stav zverejnenia/);
});

test("password controls are accessible and preserve password-manager semantics", () => {
  assert.match(passwordField, /type=\{visible \? "text" : "password"\}/);
  assert.match(passwordField, /type="button"/);
  assert.match(passwordField, /"Zobraziť heslo"/);
  assert.match(passwordField, /"Skryť heslo"/);
  assert.match(passwordField, /aria-pressed=\{visible\}/);
  assert.match(passwordField, /aria-controls=\{inputId\}/);

  assert.match(passwordAuthForm, /autoComplete=\{mode === "login" \? "current-password" : "new-password"\}/);
  assert.match(passwordResetForm, /autoComplete="new-password"/);
  assert.match(securitySettings, /autoComplete="current-password"/);
  assert.match(securitySettings, /autoComplete="new-password"/);

  assert.match(passwordAuthForm, /Heslo musí mať aspoň 12 znakov\./);
  assert.match(passwordResetForm, /Heslo musí mať aspoň 12 znakov\./);
  assert.match(securitySettings, /Heslo musí mať aspoň 12 znakov\./);
  assert.match(partnerCss, /\.partner-password-toggle\{[\s\S]*min-width:48px;[\s\S]*min-height:48px;/);
});

test("logout is discoverable in the Partner shell and keeps the secure backend flow", () => {
  assert.match(partnerShell, /<PartnerLogoutButton \/>/);
  assert.match(settingsActions, /<PartnerLogoutButton[\s\S]*accessibleName="Odhlásiť sa"[\s\S]*onBusyChange=\{setLogoutBusy\}/);
  assert.match(logoutButton, /fetch\("\/api\/partner\/auth\/logout"/);
  assert.match(logoutButton, /method: "POST"/);
  assert.match(logoutButton, /window\.location\.replace\("\/partner\/prihlasenie"\)/);
  assert.doesNotMatch(settingsActions, /\bsessions?\b/i);
  assert.doesNotMatch(resetPage, /\bsessions?\b/i);
});

test("Partner-facing terminology and raw codes are localized", () => {
  assert.match(profilesPage, /partnerRoleLabel\(item\.role\)/);
  assert.match(profilesPage, /partnerResourceStatusLabel\(item\.status\)/);
  assert.doesNotMatch(profilesPage, /Partner členstvo|aktívne členstvo/i);

  assert.match(partnerEventsPage, /partnerRoleLabel\(item\.role\)/);
  assert.doesNotMatch(partnerEventsPage, /Partner Events|Partner zdroj|admin schválení/i);

  assert.match(requestsPage, /getPartnerEditableFields/);
  assert.match(requestsPage, /profileFieldLabel\(change\.resourceType, key\)/);
  assert.match(requestsPage, /partnerEventOperationLabel\(submission\.operation\)/);
  assert.match(requestsPage, /profileCategoryLabel\(submission\.resourceType, submission\.categoryOrType\)/);
  assert.doesNotMatch(requestsPage, /changedFields\.join|>Canonical profil →<|Nemáte OWNER profil/);

  assert.doesNotMatch(partnerHome, /aktuálneho členstva|spravujete .*zdroj/i);
  assert.match(commercialPanel, /Profil alebo podujatie \(voliteľné\)/);
  assert.doesNotMatch(commercialPanel, /Profil alebo zdroj/);
  assert.match(commercialPanel, /Sponzorované zvýraznenie/);

  assert.match(promotionPage, /partnerCommercialStatusLabel\(item\.status\)/);
  assert.match(promotionPage, /partnerPaymentStatusLabel\(item\.paymentStatus\)/);
  assert.match(promotionPage, /partnerPaymentMethodLabel\(item\.paymentMethod\)/);
  assert.match(promotionPage, /partnerRoleLabel\(r\.role\)/);
  assert.match(promotionPage, /Overenie iba potvrdzuje oprávnenie spravovať profil/);
});

test("shared Partner labels cover roles, commercial states, payments and event operations", () => {
  for (const expected of [
    'OWNER: "Vlastník"',
    'MANAGER: "Manažér"',
    'EDITOR: "Editor"',
    'NEW: "Nové"',
    'CONTACTED: "Kontaktované"',
    'INTERESTED: "Záujem potvrdený"',
    'DRAFT: "Koncept"',
    'OFFERED: "Ponuka odoslaná"',
    'AGREED: "Dohodnuté"',
    'ACTIVE: "Aktívne"',
    'PAUSED: "Pozastavené"',
    'EXPIRED: "Ukončené"',
    'CANCELLED: "Zrušené"',
    'BANK_TRANSFER: "Bankový prevod"',
    'BY_AGREEMENT: "Podľa dohody"',
    'AWAITING_PAYMENT: "Čaká na platbu"',
    'PAID: "Zaplatené"',
    'CREATE: "Nové podujatie"',
    'UPDATE: "Úprava podujatia"',
    'CIVIC_ASSOCIATION", "Občianske združenie"',
  ]) {
    assert.ok(uiLabels.includes(expected), `missing Partner UI mapping: ${expected}`);
  }
});

test("Google descriptive copy follows the same availability flag as the CTA", () => {
  assert.match(loginPage, /googleEnabled \? "Prihláste sa cez Google/);
  assert.match(loginPage, /: "Prihláste sa heslom alebo jednorazovým odkazom na e-mail\."/);
  assert.match(loginPage, /\{googleEnabled \? <a className="button button--google partner-google-button"/);
});


test("Slovakia location selector is dependent, searchable and keyboard/screen-reader accessible", () => {
  assert.match(locationSelector, /SLOVAK_REGIONS\.map/);
  assert.match(locationSelector, /getSlovakDistricts\(selectedRegion\)/);
  assert.match(locationSelector, /searchSlovakMunicipalities\(selectedDistrict, query/);
  assert.match(locationSelector, /setSelectedDistrict\(""/);
  assert.match(locationSelector, /setSelectedCity\(""/);
  assert.match(locationSelector, /onChange\(\{ region, district: "", city: "" \}\)/);
  assert.match(locationSelector, /onChange\(\{ region: selectedRegion, district, city: "" \}\)/);
  assert.match(locationSelector, /role="combobox"/);
  assert.match(locationSelector, /aria-autocomplete="list"/);
  assert.match(locationSelector, /aria-activedescendant/);
  assert.match(locationSelector, /event\.key === "ArrowDown"/);
  assert.match(locationSelector, /event\.key === "Enter"/);
  assert.match(locationSelector, /Obec \/ mesto/);
  assert.match(newProfileForm, /countryCode\.trim\(\)\.toUpperCase\(\) === "SK"/);
  assert.match(newProfileForm, /Kraj \/ región/);
  assert.match(partnerCss, /\.partner-location-selector\{grid-column:1\/-1;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(partnerCss, /@media\(max-width:760px\)\{\.partner-location-selector\{grid-template-columns:minmax\(0,1fr\)\}/);
});
