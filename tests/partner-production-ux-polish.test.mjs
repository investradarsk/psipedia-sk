import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");

const [
  layout,
  header,
  partnerCss,
  newEventPage,
  canonicalNewPage,
  canonicalForm,
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
  "app/partner/koncepty/novy/page.tsx",
  "components/partner-canonical-draft-form.tsx",
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
  // Partner identity is request-scoped and verified on the server while
  // independent navigation data loads concurrently.
  assert.match(layout, /partnerToken \? getPublicPartnerSession\(partnerToken\) : Promise\.resolve\(null\)/);
  assert.match(layout, /await Promise\.all\(\[\s*navigationPromise,/);
  assert.match(layout, /partnerAuthenticated=\{Boolean\(partnerSession\)\}/);

  assert.match(header, /partnerAuthenticated: boolean/);
  assert.match(header, /partnerAuthenticated \? "\/partner" : "\/partner\/prihlasenie"/);
  assert.match(header, /const partnerLabel = "Partner účet"/);
  assert.match(header, /href=\{partnerHref\}/);
  assert.match(header, />\{partnerLabel\}<\/Link>/);
});

test("public header never prefetches Partner account RSC routes from article pages", () => {
  assert.match(header, /<Link href=\{partnerHref\} prefetch=\{false\} className="header-contact-link" data-partner-login-entry>/);
  assert.match(header, /<Link href=\{partnerHref\} prefetch=\{false\} className="mobile-contact-link" data-partner-login-entry/);
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
  // The fixed header offset is now the sum of its independent masthead and
  // desktop navigation band; the open mobile menu must not inflate it.
  assert.match(header, /masthead\?\.getBoundingClientRect\(\)\.height/);
  assert.match(header, /desktopBand\?\.getBoundingClientRect\(\)\.height/);
  assert.match(header, /mastheadHeight \+ bandHeight \+ borderHeight/);
  assert.doesNotMatch(header, /Math\.ceil\(header\.getBoundingClientRect\(\)\.height\)/);
  assert.match(
    partnerCss,
    /scroll-margin-top: calc\(var\(--psipedia-sticky-header-height, 0px\) \+ 16px\)/,
  );
});

test("Partner event creation redirects to shared editor with accurate private-draft copy", () => {
  assert.match(newEventPage, /redirect\("\/partner\/koncepty\/novy\/podujatie"\)/);
  assert.match(canonicalNewPage, /PartnerCanonicalDraftForm/);
  assert.match(canonicalNewPage, /Uložte si neverejný koncept alebo ho odošlite na prvé schválenie/);
  assert.match(canonicalForm, /Koncept zostane súkromný a na stránke sa zobrazí až po schválení/);
  assert.match(canonicalForm, /Fotografie a galériu môžete nahrať po prvom uložení konceptu/);
  assert.doesNotMatch(newEventPage, /canonical|admin flow/i);
  assert.doesNotMatch(editEventPage, /canonical|admin flow|\bslug\b/i);
  assert.match(editEventPage, /Ak sa podujatie medzitým zmenilo/);
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
  assert.match(partnerCss, /\.partner-password-toggle\s*\{[^}]*min-width:\s*48px\s*;[^}]*min-height:\s*48px\s*;/);
});

test("logout is discoverable in the Partner shell and keeps the secure backend flow", async () => {
  const navigation = await read("components/partner-workspace-navigation.tsx");
  assert.match(partnerShell, /<PartnerWorkspaceNavigation \/>/);
  assert.match(navigation, /<details className="partner-nav-account">[\s\S]*?Môj účet[\s\S]*?<PartnerLogoutButton \/>[\s\S]*?<\/details>/);
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
    'OWNER: "Správca profilu"',
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

test("Partner login identifies its audience and only offers Google when configured", () => {
  assert.match(loginPage, /Pre majiteľov psov, poskytovateľov služieb, organizácie a organizátorov podujatí/);
  assert.match(loginPage, /<h2>Mám Partner účet<\/h2>/);
  assert.match(loginPage, /\{googleEnabled \? <a className="button button--google partner-google-button"/);
});


test("Slovakia location selector is dependent, searchable and keyboard/screen-reader accessible", () => {
  assert.match(locationSelector, /SLOVAK_REGIONS\.map/);
  assert.match(locationSelector, /const selectedRegion = value\.region/);
  assert.match(locationSelector, /const selectedDistrict = value\.district/);
  assert.match(locationSelector, /const selectedCity = value\.city/);
  assert.match(locationSelector, /getSlovakDistricts\(selectedRegion\)/);
  assert.match(locationSelector, /searchSlovakMunicipalities\(selectedDistrict, query/);
  assert.doesNotMatch(locationSelector, /setSelectedRegion|setSelectedDistrict|setSelectedCity/);
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
  assert.match(partnerCss, /\.partner-location-selector\s*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*;[^}]*display:\s*grid\s*;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(partnerCss, /@media\s*\(max-width:\s*760px\)\s*\{\s*\.partner-location-selector\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
});

test("Partner forms hide development vocabulary and translate stored choice codes", async () => {
  const optionLabels = await read("lib/partner-field-option-labels.ts");
  for (const [raw, human] of [
    ['UNKNOWN', 'Neviem'],
    ['LOST', 'Stratený pes'],
    ['FOUND', 'Nájdený pes'],
    ['UP_TO_DATE', 'Aktuálne'],
    ['ambulance', 'Ambulancia'],
    ['docasna-opatera', 'Dočasná opatera'],
  ]) {
    assert.ok(optionLabels.includes(raw + ':"' + human + '"') || optionLabels.includes('"' + raw + '":"' + human + '"'), raw + " is not translated");
  }
  const editing = await Promise.all([
    "components/partner-profile-edit-form.tsx",
    "components/partner-help-public-editor-form.tsx",
    "components/partner-event-form.tsx",
    "app/partner/podujatia/[resourceId]/upravit/page.tsx",
    "app/partner/pomoc/[resourceId]/upravit/page.tsx",
  ].map(read));
  for (const source of [canonicalForm, ...editing]) {
    assert.doesNotMatch(source, /SEO a interné polia|SEO a stav publikovania|Interné a SEO polia|Nevznikne automatický claim/i);
  }
  assert.match(canonicalForm, /partnerFieldOptionLabel\(x\)/);
  assert.match(editing[0], /partnerFieldOptionLabel\(option\)/);
  assert.match(editing[1], /partnerFieldOptionLabel\(option\)/);
  assert.match(editing[2], /partnerFieldOptionLabel\(option\)/);
  assert.match(partnerHome, /resourceTypeLabel\(draft.resourceType\)/);
  assert.doesNotMatch(partnerHome, /draft.resourceType.replaceAll/);
  assert.doesNotMatch(requestsPage, /item.resourceType.replaceAll/);
});

test("Partner authenticated workspace is compact and uses the public design system", async () => {
  assert.match(partnerShell, /className="partner-shell partner-shell--workspace"/);
  assert.match(partnerCss, /\.partner-shell--workspace\s*\{/);
  for (const token of ["var(--ink)", "var(--forest)", "var(--line)", "var(--paper)", "var(--sage-light)"]) {
    assert.ok(partnerCss.includes(token), "missing public brand token: "+token);
  }
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-page-heading h1\s*\{[\s\S]*?clamp\(1\.55rem,\s*2\.6vw,\s*2\.1rem\)/);
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-dashboard-welcome-aside\s*\{\s*display:\s*none;/);
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-profile-edit-form\s*\{[\s\S]*?gap:\s*14px;/);
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-dashboard-header nav\s*\{[\s\S]*?scrollbar-width:\s*thin;/);
  assert.match(partnerCss, /@media \(max-width: 640px\) \{[\s\S]*?\.partner-shell--workspace \.partner-dashboard-header nav a,[\s\S]*?min-height:\s*44px;/);
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-canonical-categories-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
  // Do not accidentally shrink controls on unauthenticated signup/login pages.
  assert.doesNotMatch(partnerShell, /<main[^>]*partner-shell--centered/);
  const chat = await read("components/partner-private-chat.tsx");
  const chatCss = await read("components/partner-private-chat.module.css");
  assert.match(chat, /styles.partnerChat/);
  assert.match(chatCss, /\.partnerChat \.timeline/);
  assert.match(chatCss, /max-height:390px/);
  assert.match(partnerCss, /\.partner-shell--workspace \.partner-field select,[\s\S]*?min-height: 44px;/);
});

test("Partner UX: live alphabetical claim suggestions, prominent CTAs and fixed navigation", async () => {
  const claimPage=await read("app/partner/prevziat/page.tsx");
  const claimSearch=await read("lib/partner-claim-search.ts");
  const claimHelp=await read("lib/partner-help-claims.ts");
  const claimApi=await read("app/api/partner/claim-search/route.ts");
  const claimForm=await read("components/partner-claim-search-form.tsx");
  const messagePage=await read("app/partner/spravy/page.tsx");
  assert.match(claimPage, /<PartnerClaimSearchForm/);
  assert.match(claimForm, /role="combobox"/);
  assert.match(claimForm, /aria-autocomplete="list"/);
  assert.match(claimForm, /ArrowDown/);
  assert.match(claimForm, /router\.push\(items\[active\]\.claimHref\)/);
  assert.match(claimForm, /setTimeout\(async\(\)=>/);
  assert.match(claimApi, /requirePartnerAccount/);
  assert.match(claimApi, /isPartnerClaimableResourceType/);
  assert.match(claimApi, /suggest:true/);
  assert.match(claimSearch, /query\.length < \(input\.suggest \? 1 : 2\)/);
  assert.match(claimSearch, /ORDER BY name COLLATE NOCASE/);
  assert.match(claimHelp, /suggest \? 1 : 2|suggest\?1:2/);
  assert.match(partnerHome, />\+ Pridať profil<\/Link>/);
  assert.match(partnerHome, /button button--coral/);
  assert.match(partnerHome, /Požiadať o správu profilu/);
  assert.match(partnerCss, /position:\s*sticky/);
  assert.match(partnerCss, /partner-canonical-categories-grid label input\[type="checkbox"\]/);
  assert.match(partnerCss, /flex:\s*0 0 18px/);
  assert.match(messagePage, /Späť na prehľad/);
});

test("Partner chat: authorized typing presence and real read receipts", async () => {
  const service=await read("lib/partner-chat.ts");
  const presence=await read("lib/partner-chat-presence.ts");
  const chat=await read("components/partner-private-chat.tsx");
  const partnerTyping=await read("app/api/partner/chat/typing/route.ts");
  const adminTyping=await read("app/api/admin/partners/chat/[accountId]/typing/route.ts");
  assert.match(service, /partner_last_read_at partnerLastReadAt/);
  assert.match(service, /admin_last_read_at adminLastReadAt/);
  assert.match(chat, /lastOwnRead/);
  assert.match(chat, /Prečítané/);
  assert.match(chat, /píše…/);
  assert.match(chat, /lastInputAt/);
  assert.match(chat, /timeline.current/);
  assert.doesNotMatch(chat, /scrollIntoView/);
  assert.match(presence, /quarantine\/partner-chat-presence\//);
  assert.match(presence, /FRESH_MS=12_000/);
  assert.match(presence, /R2Bucket/);
  assert.match(partnerTyping, /requirePartnerAccount/);
  assert.match(partnerTyping, /assertPartnerJsonMutation/);
  assert.match(adminTyping, /getAdminApiUser/);
  assert.match(adminTyping, /requirePartnerAdminMutation/);
});
