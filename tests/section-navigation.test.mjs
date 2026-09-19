import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("editorial section tabs use the managed subsection source of truth", () => {
  const tabs = read("components/portal-section-tabs.tsx");
  assert.match(tabs, /section\.subpages\.filter/);
  assert.match(tabs, /subpage\.visible !== false/);
  assert.match(tabs, /portalSubpageHref\(section, subpage\)/);
  assert.match(tabs, /aria-current=\{active \? "page"/);
  assert.doesNotMatch(tabs, /pred-kupou-psa|zdravie|psie-sporty/);
  assert.doesNotMatch(tabs, /Adresa URL|adminFieldLabels/);
  assert.doesNotMatch(tabs, /\?category=|\?kategoria=|URLSearchParams/);
});

test("managed subsection writes reject technical labels and malformed slugs", () => {
  const store = read("lib/section-store.ts");
  assert.match(store, /adminFieldLabels/);
  assert.match(store, /normalizedLabel\.endsWith\(" adresa url"\)/);
  assert.match(store, /Adresa podsekcie musí byť platný slug bez úvodnej alebo koncovej pomlčky/);
  assert.match(store, /repairCorruptManagedSubpages/);
  assert.match(store, /system:data-repair/);
});

test("section editor keeps subsection name and address in separate fields", () => {
  const editor = read("components/admin-section-editor.tsx");
  assert.match(editor, /<span>Názov<\/span>/);
  assert.match(editor, /value=\{subpage\.label\}/);
  assert.match(editor, /updateSubpage\(section\.slug, subIndex, \{ label: event\.currentTarget\.value \}\)/);
  assert.match(editor, /<span>Slug \/ adresa<\/span>/);
  assert.match(editor, /value=\{settingsSubpage\.slug\}/);
  assert.match(editor, /updateSubpage\(settingsSection\.slug, settingsTarget\.subIndex, \{/);
});

test("editorial hubs expose direct content before the area directory", () => {
  const hub = read("components/portal-hub.tsx");
  const tabsPosition = hub.indexOf("<PortalSectionTabs section={section}");
  const contentPosition = hub.indexOf("{isEditorialHub && latestContent}");
  const directoryPosition = hub.indexOf("portal-directory");
  assert.ok(tabsPosition >= 0, "hub musí používať spoločné SectionTabs");
  assert.ok(contentPosition > tabsPosition, "obsah musí nasledovať po sekčnej navigácii");
  assert.ok(directoryPosition > contentPosition, "články musia byť dostupné pred rozcestníkom oblastí");
  assert.match(hub, /featuredArticleSlugs/);
});

test("portal hub callouts cannot pull back over section tabs", () => {
  const css = read("app/design-system.css");
  const hub = read("components/portal-hub.tsx");

  assert.match(
    css,
    /\.portal-section-tabs\s*\+\s*\.care-urgent,\s*\.portal-section-tabs\s*\+\s*\.activity-fit,\s*\.portal-section-tabs\s*\+\s*\.puppy-start\s*\{[\s\S]*?margin-top:\s*var\(--ps-space-stack\);[\s\S]*?\}/,
    "hub callouty musia po SectionTabs rezervovať kladnú vertikálnu medzeru",
  );
  assert.match(
    css,
    /\.portal-section-tabs\s*\+\s*\.portal-topic-body\s*\{[\s\S]*?margin-top:\s*0;[\s\S]*?padding-top:\s*var\(--ps-space-stack\);[\s\S]*?\}/,
    "PortalTopic musí používať jedinú kladnú medzeru bez dvojitého marginu",
  );
  assert.doesNotMatch(
    css,
    /\.portal-section-tabs\s*\+\s*\.shell\s*\{/,
    "spacing nesmie byť naviazaný na globálny shell, ktorý zdieľa aj admin",
  );

  const tabsPosition = hub.indexOf("<PortalSectionTabs section={section}");
  for (const className of ["care-urgent", "activity-fit", "puppy-start"]) {
    assert.ok(
      hub.indexOf(className) > tabsPosition,
      `${className} musí nasledovať po spoločnej sekčnej navigácii`,
    );
  }
});

test("structured topic landing pages keep the section system and active tab", () => {
  const topic = read("components/portal-topic.tsx");
  assert.match(topic, /isStructuredTopic && <PortalSectionTabs section=\{section\} activeSlug=\{subpage\.slug\}/);
  assert.match(topic, /subpage\.homeSteps/);
  assert.match(topic, /subpage\.warningSigns/);
  assert.match(topic, /subpage\.expertAdvice/);
  assert.match(topic, /subpage\.serviceLinks/);
  assert.match(topic, /featuredArticleSlugs/);
});

test("section tabs remain compact and horizontally scrollable on small screens", () => {
  const css = read("app/design-system.css");
  assert.match(css, /\.section-tabs-inner[\s\S]*overflow-x: auto/);
  assert.match(css, /scroll-snap-type: x proximity/);
  assert.match(css, /\.section-tab\.is-active/);
  assert.match(css, /\.section-tab\[aria-current="page"\]/);
  assert.match(css, /\.section-tab\s*\{[\s\S]*?min-height:\s*44px/);
});


test("SECTION-PUBLIC uses the shared visual foundation without global CSS ownership", () => {
  const section = read("components/editorial-section.tsx");
  const css = read("components/editorial-section.module.css");
  assert.match(section, /PublicSectionHeader/);
  assert.match(section, /PublicContentList/);
  assert.match(section, /PublicDataCard/);
  assert.match(section, /StructuredData/);
  assert.match(section, /buildCollectionPageJsonLd/);
  assert.doesNotMatch(section, /SectionHero/);
  assert.doesNotMatch(section, /ArticleCard/);
  assert.doesNotMatch(section, /[\u{1F300}-\u{1FAFF}]/u);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
});

test("SECTION-PUBLIC preserves urgent health guidance and removes generic puppy template labels", () => {
  const section = read("components/editorial-section.tsx");
  assert.match(section, /Keď ide o čas/);
  assert.match(section, /Má pes akútny problém\?/);
  assert.match(section, /Kedy volať ihneď/);
  assert.match(section, /Nájsť veterinára/);
  assert.match(section, /Praktické kroky/);
  assert.doesNotMatch(section, /Krok za krokom|Čo urobiť teraz/);
});

test("SECTION-PUBLIC navigation scopes mobile overflow to the navigation component", () => {
  const tabs = read("components/portal-section-tabs.tsx");
  const css = read("components/portal-section-tabs.module.css");
  assert.match(tabs, /styles\.nav/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /flex-wrap:\s*nowrap/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /overscroll-behavior-x:\s*contain/);
  assert.match(css, /\.section-tab\.is-active/);
});

test("SECTION-PUBLIC keeps canonical training taxonomy and legacy redirect compatibility", () => {
  const portal = read("lib/portal.ts");
  const redirect = read("app/aktivity/-vycvik-a-aktivity-trening/route.ts");
  assert.match(portal, /slug:\s*"trening",\s*label:\s*"Tréning"/);
  assert.doesNotMatch(portal, /slug:\s*"-vycvik-a-aktivity-trening"/);
  assert.match(redirect, /NextResponse\.redirect\(new URL\("\/aktivity\/trening", request\.url\), 301\)/);
});

test("SECTION-PUBLIC upgrades the repository-managed first-days puppy page", () => {
  const portal = read("lib/portal.ts");
  assert.match(portal, /slug:\s*"prve-dni",\s*label:\s*"Prvé dni doma"/);
  assert.match(portal, /Prvé dni doma sú najmä o bezpečí, odpočinku a predvídateľnom režime/);
  assert.match(portal, /seoTitle:\s*"Prvé dni so šteniatkom – pokojný štart doma"/);
  assert.match(portal, /metaDescription:\s*"Praktický prehľad prvých dní so šteniatkom/);
  assert.match(portal, /Zdravie a starostlivosť", href:\s*"\/starostlivost"/);
});


test("ADMIN-CORE navigation validates hierarchy, internal paths and active duplicates", () => {
  const store = read("lib/navigation-store.ts");
  assert.match(store, /normalizeInternalHref/);
  assert.match(store, /Navigácia obsahuje cyklus v parent\/child väzbách/);
  assert.match(store, /Navigácia podporuje iba jednu úroveň podmenu/);
  assert.match(store, /Aktívne položky/);
  assert.match(store, /smerujú na rovnakú adresu/);
  assert.match(store, /parsed\.origin !== "https:\/\/psipedia\.sk"/);
});

test("ADMIN-CORE navigation editor exposes a lightweight structural preview", () => {
  const editor = read("components/admin-navigation-editor.tsx");
  const css = read("app/globals.css");
  assert.match(editor, /Preview výslednej štruktúry/);
  assert.match(editor, /Nie je to druhý renderer verejného headeru/);
  assert.match(editor, /previewFamilies/);
  assert.match(editor, /role="alert"/);
  assert.match(css, /\.admin-navigation-preview/);
  assert.match(css, /\.admin-navigation-fields input,[\s\S]*?min-height:\s*44px/);
});

test("ADMIN-CORE keeps public navigation on the existing SiteHeader contract", () => {
  const header = read("components/site-header.tsx");
  assert.match(header, /navigationItems\.filter\(\(item\) => item\.visible\)/);
  assert.match(header, /storedChildren\.length \? storedChildren : fallbackChildren/);
  assert.match(header, /setMenuOpen\(false\)/);
});
