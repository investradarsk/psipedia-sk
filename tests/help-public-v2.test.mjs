import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const landing = read("components/help-page.tsx");
const overview = read("components/help-overview.tsx");
const helpNav = read("components/public-visual-system/public-help-category-nav.tsx");
const browser = read("components/help-browser.tsx");
const card = read("components/help-card.tsx");
const icons = read("components/help-public-icons.tsx");
const styles = read("components/help-public.module.css");
const helpModel = read("lib/help.ts");
const rootRoute = read("app/pomoc-psom/page.tsx");
const categoryRoute = read("app/pomoc-psom/[category]/page.tsx");
const adoption = read("components/adoption-catalog.tsx");
const lostFound = read("components/lost-found-dogs-page.tsx");
const detail = read("components/help-details/help-detail-shell.tsx");
const organization = read("components/organization-profile-detail.tsx");
const adminDashboard = read("components/admin-help-dashboard.tsx");
const adminHelpHub = read("app/admin/pomoc-psom/page.tsx");
const adminEditor = read("components/admin-help-editor.tsx");
const adminQuery = read("lib/help-admin-query.ts");
const adminStore = read("lib/help-store.ts");
const adminImport = read("lib/help-import-preview.ts");
const adminStyles = read("components/admin-help-bulk.module.css");

const emojiUi = /[🐾🔎📍📅🚨❤️🛡️🐕🤝🏠🛟💛]/u;

test("Help landing uses the canonical unified hero and curated category previews", () => {
  assert.match(overview, /<PublicFoundation/);
  assert.match(overview, /<UnifiedSectionHero/);
  assert.match(overview, /getSectionHeroVisual\("section\.pomoc-psom"\)/);
  assert.doesNotMatch(overview, /<PublicSectionHeader|heroImage|help-hero--photo/);
  assert.match(overview, /<PublicHelpCategoryNav/);
  assert.match(helpNav, /data-help-category-nav/);
  assert.match(overview, /data-help-overview-section/);
  assert.match(overview, /section\.items\.slice\(0, 5\)/);
  assert.match(rootRoute, /<HelpOverview sections=\{sections\} totalActive=\{totalActive\}/);
});

test("Help category navigation routes canonical modules without emoji UI", () => {
  assert.match(landing, /category === "adopcia"\) return "\/pomoc-psom\/adopcia"/);
  assert.match(landing, /category === "stratene-a-najdene"\) return "\/pomoc-psom\/stratene-a-najdene"/);
  assert.match(categoryRoute, /redirect\("\/pomoc-psom\/stratene-a-najdene"\)/);
  assert.match(landing, /<PublicHelpCategoryNav/);
  assert.match(helpNav, /<HelpCategoryIcon/);
  assert.doesNotMatch(landing, emojiUi);
  assert.doesNotMatch(overview, emojiUi);
  assert.doesNotMatch(browser, emojiUi);
  assert.doesNotMatch(card, emojiUi);
  assert.doesNotMatch(adoption, emojiUi);
  assert.doesNotMatch(lostFound, emojiUi);
  assert.doesNotMatch(detail, emojiUi);
  assert.doesNotMatch(organization, emojiUi);
  assert.doesNotMatch(icons, emojiUi);
});

test("Help landing counts and limited previews come from canonical public read predicates", () => {
  const landingRead = read("lib/help-landing-store.ts");
  assert.match(rootRoute, /getHelpLandingSnapshot\(\)/);
  assert.match(rootRoute, /adopcia: adoptions\.count/);
  assert.match(rootRoute, /"stratene-a-najdene": reports\.counts\.LOST \+ reports\.counts\.FOUND/);
  assert.match(rootRoute, /slice\(0, 5\)/);
  assert.match(rootRoute, /return "\/pomoc-psom\/stratene-a-najdene"/);
  assert.match(landingRead, /d\.status IN \('ACTIVE','RESERVED'\)/);
  assert.match(landingRead, /r\.status = 'ACTIVE'/);
  assert.match(landingRead, /h\.status = 'published'/);
  assert.match(landingRead, /PUBLIC_ORGANIZATION_PREDICATE/);
});

test("generic Help browser does not merge dedicated adoption or lost-found domains", () => {
  assert.match(
    landing,
    /const browserItems = items\.filter\(\(item\) => item\.category !== "stratene-a-najdene"\)/,
  );
  assert.doesNotMatch(browser, /getPublicAdoptions|listPublicDogReports/);
  assert.doesNotMatch(browser, /category\.slug !== "adopcia"/);
});

test("published resolved Help details remain discoverable through URL-backed SSR filters", () => {
  assert.match(categoryRoute, /initialActiveOnly = scalar\(rawSearchParams\.stav\) !== "vsetky"/);
  assert.match(categoryRoute, /initialRegion = regionFilter\(rawSearchParams\.region\)/);
  assert.match(categoryRoute, /generateMetadata\(\{ params, searchParams \}: Props\)/);
  assert.match(categoryRoute, /buildListingPageMetadata\(\{/);
  assert.match(categoryRoute, /searchParams: await searchParams/);
  assert.match(landing, /initialActiveOnly=\{initialActiveOnly\}/);
  assert.match(landing, /initialRegion=\{initialRegion\}/);
  assert.match(browser, /method="get"/);
  assert.match(browser, /name="q"/);
  assert.match(browser, /name="region"/);
  assert.match(browser, /name="stav"/);
  assert.match(browser, /value="vsetky">Aj ukončené/);
  assert.match(browser, /<PublicFilterDisclosure/);
  assert.doesNotMatch(browser, /useState|useMemo|window\.history/);
});

test("canonical organizations stay reachable through the Help hierarchy", () => {
  assert.match(
    helpModel,
    /if \(item\.category === "utulky"\) return `\/organizacie\/\$\{item\.slug\}`/,
  );
  assert.match(categoryRoute, /getPublishedHelpCaseCards\(category\)/);
  assert.match(card, /const href = helpCaseHref\(item\)/);
  assert.match(card, /<PublicHelpProfileCard[\s\S]*?href=\{href\}/);
});

test("fundraising cards and details consume the same category-aware financial block", () => {
  const financial = read("components/help-financial-progress.tsx");
  // Unified cards still display the same category-aware fundraiser totals
  // as the details; compact layout alone must not hide financial context.
  assert.match(card, /<PublicHelpProfileCard/);
  assert.match(card, /<HelpFinancialProgress item=\{item\} compact/);
  assert.match(detail, /HelpFinancialProgress/);
  assert.match(financial, /helpFinancials\(item\)/);
  assert.match(financial, /if \(!amounts\) return null/);
  assert.doesNotMatch(financial, /raisedAmount \?\? 0/);
});

test("adoption and lost-found listings expose canonical data-first fields", () => {
  assert.match(adoption, /dog\.organizationName/);
  // The shared card shows publicly available organization metadata; canonical
  // organization, publication and verification fields remain part of the
  // public card projection even when compact cards do not display timestamps.
  const adoptionModel = read("lib/adoption.ts");
  assert.match(adoption, /dog\.organizationName/);
  assert.match(adoption, /<PublicHelpProfileCard/);
  assert.match(adoptionModel, /"organizationName" \| "organizationSlug"/);
  assert.match(adoption, /dog\.organizationSlug/);
  assert.match(adoption, /href=\{"\/organizacie\/" \+ dog\.organizationSlug\}/);
  assert.match(adoptionModel, /"publishedAt" \| "lastVerifiedAt"/);
  assert.match(lostFound, /listPublicDogReports\(type/);
  assert.match(lostFound, /dogReportTypeLabel\(type\)/);
  assert.match(lostFound, /formatDogReportDate\(report\.eventDate\)/);
});

test("empty states and 390px mobile contract are explicit", () => {
  assert.match(browser, /Momentálne nemáme publikovaný prípad pre tieto filtre\./);
  assert.match(lostFound, /Momentálne nemáme publikovaný prípad pre tieto filtre\./);
  assert.match(adoption, /Momentálne nemáme publikovaný profil pre tieto filtre\./);
  assert.match(styles, /@media\s*\(max-width:\s*650px\)/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
  assert.match(styles, /min-height:\s*44px/);
  assert.doesNotMatch(styles, /overflow-x:\s*(?:scroll|auto)/);
});

test("Help Admin unified workspace uses canonical domain stores and dedicated editors", () => {
  assert.match(
    adminQuery,
    /HELP_ADMIN_DEDICATED_CATEGORIES = \["adopcia", "utulky", "stratene-a-najdene"\]/,
  );
  assert.match(
    adminQuery,
    /HELP_ADMIN_CREATE_CATEGORIES = \["docasna-opatera", "zbierky", "dobrovolnictvo"\]/,
  );
  assert.match(adminHelpHub, /await requireAdminPageUser\("\/admin\/pomoc-psom"\)/);
  assert.match(adminHelpHub, /slug: "adopcia"[^\n]*href: "\/admin\/adopcie"/);
  assert.match(adminHelpHub, /slug: "stratene-a-najdene"[^\n]*href: "\/admin\/stratene-najdene"/);
  assert.match(adminHelpHub, /slug: "organizacie"[^\n]*href: "\/admin\/organizacie"/);
  assert.match(adminHelpHub, /slug: "ostatna-pomoc"[^\n]*href: "\/admin\/pomoc"/);
  assert.match(adminHelpHub, /listAdoptionAdminDashboard\(\{ q, page \}\)/);
  assert.match(adminHelpHub, /listAdminDogReports\(\{ q, page, pageSize: 50 \}\)/);
  assert.match(adminHelpHub, /getOrganizationAdminPage\(parseOrganizationAdminFilters/);
  assert.match(adminHelpHub, /key === "type" && category === "utulky" \? "SHELTER" : null/);
  assert.match(adminHelpHub, /getManagedHelpDashboard\(parseHelpAdminFilters/);
  assert.match(adminHelpHub, /href: "\/admin\/adopcie\/" \+ item\.id/);
  assert.match(adminHelpHub, /href: "\/admin\/stratene-najdene\/" \+ item\.id/);
  assert.match(adminHelpHub, /href: "\/admin\/organizacie\/" \+ item\.id/);
  assert.match(adminHelpHub, /href: "\/admin\/pomoc\/" \+ item\.id/);
  assert.match(adminHelpHub, /adminDetailHref\(row\.href, returnHref\)/);
  const unified = read("components/admin-help-unified-table.tsx");
  assert.match(unified, /params\.set\("category", slug\)/);
  assert.match(unified, /return "\/admin\/pomoc-psom\?" \+ params/);
  const helpPage = read("app/admin/pomoc/page.tsx");
  const profileTabs = read("components/admin-profile-type-tabs.tsx");
  const workspace = read("lib/admin-profile-workspace.ts");
  assert.match(helpPage, /await requireAdminPageUser\("\/admin\/pomoc"\)/);
  assert.match(helpPage, /<AdminProfileTypeTabs active="ostatna-pomoc" \/>/);
  assert.match(helpPage, /<AdminProfileActions active="ostatna-pomoc" \/>/);
  assert.match(helpPage, /<AdminHelpDashboard\b/);
  assert.match(profileTabs, /adminProfileTypes\.map\(/);
  assert.match(profileTabs, /href=\{item\.href\}/);
  assert.match(profileTabs, /aria-current=\{item\.id === active \? "page" : undefined\}/);
  assert.match(workspace, /id: "ostatna-pomoc"[^\n]*href: "\/admin\/pomoc"/);
  assert.match(workspace, /return "\/admin\/pomoc-psom\?" \+ params\.toString\(\)/);
  assert.match(adminDashboard, /adminDetailHref\("\/admin\/pomoc\/" \+ item\.id, url\(\{ \.\.\.filters, page \}\)\)/);
  assert.match(adminEditor, /HELP_ADMIN_CREATE_CATEGORIES/);
  assert.doesNotMatch(adminEditor, /helpCategories\.filter/);
  assert.match(adminStore, /Adopcie sa spravujú v canonical sekcii Adopcie/);
  assert.match(adminStore, /Lost\/Found sekcii/);
  assert.match(adminImport, /isHelpAdminDedicatedCategory/);
});

test("Help Admin mobile controls declare touch-safe targets without changing shared AdminShell", () => {
  assert.match(adminStyles, /min-height:\s*44px/);
  assert.match(adminStyles, /@media\(max-width:760px\)/);
  assert.match(adminStyles, /grid-template-columns:\s*1fr/);
});

test("Help category pages expose one primary homepage-style search and preserve region/status facets", () => {
  assert.doesNotMatch(landing, /SectionHeroSearch/);
  assert.match(landing, /portalSearchSlot=/);
  assert.match(landing, /searchScope="help"/);
  assert.match(landing, /placeholder="Názov, mesto, organizácia alebo plemeno\.\.\."/);
  assert.match(browser, /data-help-secondary-filters/);
  assert.match(browser, /<input type="hidden" name="q"/);
  assert.match(browser, /Zobraziť celý zoznam/);
});

test("Help Admin exposes the actual public text-derived fields without shadow data stores", () => {
  const publicPresentation = read("lib/help-detail-presentation.ts");
  assert.match(adminEditor, /getHelpPresentation\(\{ description, contactNote \}\)/);
  assert.match(adminEditor, /getHelpLabelledSourceFields\(description\)/);
  assert.match(adminEditor, /getHelpLabelledSourceFields\(contactNote\)/);
  assert.match(adminEditor, /data-help-labelled-source/);
  assert.match(adminEditor, /data-help-derived-options-preview/);
  assert.match(adminEditor, /data-help-derived-contact-preview/);
  assert.match(adminEditor, /replaceHelpLabelledSourceValue\(text, occurrence, event\.target\.value\)/);
  assert.match(adminEditor, /removeHelpLabelledSourceField\(text, occurrence\)/);
  assert.match(adminEditor, /navigation\.markDirty\(\); setDescription\(next\)/);
  assert.match(adminEditor, /navigation\.markDirty\(\); setContactNote\(next\)/);
  assert.match(publicPresentation, /parseHelpLabelledText\(item\.description\)/);
  assert.match(publicPresentation, /parseHelpLabelledText\(item\.contactNote\)/);
  assert.match(publicPresentation, /helpLabelledMatches\(text\)/);
  // The existing payload still owns just the two text sources, not a new
  // derived DB column that could silently override or diverge from them.
  assert.match(adminEditor, /description, organization/);
  assert.match(adminEditor, /actionUrl: actionUrl \|\| null, contactNote, goalAmount/);
  assert.doesNotMatch(adminEditor, /public_fields_json|derived_fields_json/);
});


test("V2-10 Help uses premium tokens without losing semantic states", () => {
  const cardCss = read("components/public-visual-system/public-help-profile-card.module.css");
  const surfaceCss = read("components/public-visual-system/public-help-card-surface.module.css");
  const reportCss = read("components/lost-found-dogs.module.css");
  const formCss = read("components/lost-found-submission-form.module.css");
  const genericCss = read("components/help-details/help-detail.module.css");
  const adoptionCss = read("components/adoption.module.css");
  const orgCss = read("components/organization-profile-detail.module.css");
  const guideCss = read("components/help-public-premium.module.css");
  assert.match(cardCss, /font-family: var\(--ps-font-heading/);
  assert.match(cardCss, /font-family: var\(--ps-font-body/);
  assert.match(surfaceCss, /background: var\(--paper\)/);
  for (const css of [surfaceCss, reportCss, formCss, genericCss, adoptionCss, orgCss, guideCss]) {
    assert.match(css, /border-radius:\s*var\(--ps-radius-card\)/);
  }
  assert.match(formCss, /background: var\(--ps-premium-gradient\)/);
  assert.match(formCss, /color: var\(--ps-premium-on-dark\)/);
  assert.match(reportCss, /\.lost\s*\{[^}]*#fff0ec[^}]*#a13d28/);
  assert.match(reportCss, /\.found\s*\{[^}]*#eef4ff[^}]*#31588a/);
  assert.match(reportCss, /data-state="ADOPTED"[^}]*#e5f3e9/);
  assert.match(reportCss, /data-state="RESOLVED"/);
  assert.match(adoptionCss, /\.reserved\s*\{[^}]*#fff2d7[^}]*#80550b/);
  assert.match(genericCss, /\.tags \.urgent[^}]*#fff0e9/);
  assert.match(genericCss, /\.tags \.resolved[^}]*#f0f1ee/);
  assert.match(guideCss, /data-report-kind="LOST"[^}]*#a13d28/);
  assert.match(guideCss, /data-report-kind="FOUND"[^}]*#31588a/);
});

test("Help navigation remains present in the report hub, lists and profile details", () => {
  const nav = readFileSync(new URL("../components/public-visual-system/public-help-category-nav.tsx", import.meta.url), "utf8");
  assert.match(nav, /export function PublicHelpSectionNav/);
  assert.match(nav, /reportScope && <PublicHelpReportNav/);
  assert.match(nav, /dogReportBasePath\("LOST"\)/);
  assert.match(nav, /dogReportBasePath\("FOUND"\)/);
  assert.match(nav, /current: current === tab.key/);
  assert.doesNotMatch(nav, /<Link\b/);
  const paths = [
    ["app/pomoc-psom/stratene-a-najdene/page.tsx", /<PublicHelpSectionNav current="stratene-a-najdene" reportScope="all"/],
    ["components/lost-found-dogs-page.tsx", /reportScope=\{type\}/],
    ["components/lost-found-dog-detail.tsx", /<PublicHelpSectionNav current="stratene-a-najdene" reportScope=\{type\}/],
    ["components/adoption-detail.tsx", /<PublicHelpSectionNav current="adopcia"/],
    ["components/help-details/help-detail-shell.tsx", /<PublicHelpSectionNav current=\{item.category\}/],
    ["app/organizacie/page.tsx", /<PublicHelpSectionNav current="utulky"/],
    ["components/organization-profile-detail.tsx", /<PublicHelpSectionNav current="utulky"/],
  ];
  for (const [path, pattern] of paths) {
    assert.match(readFileSync(new URL("../" + path, import.meta.url), "utf8"), pattern, path);
  }
});
