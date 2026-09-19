import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const landing = read("components/help-page.tsx");
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
const adminEditor = read("components/admin-help-editor.tsx");
const adminQuery = read("lib/help-admin-query.ts");
const adminStore = read("lib/help-store.ts");
const adminImport = read("lib/help-import-preview.ts");
const adminStyles = read("components/admin-help-bulk.module.css");

const emojiUi = /[🐾🔎📍📅🚨❤️🛡️🐕🤝🏠🛟💛]/u;

test("Help landing uses the compact public foundation instead of a photo marketing hero", () => {
  assert.match(landing, /<PublicFoundation/);
  assert.match(landing, /<PublicSectionHeader/);
  assert.match(landing, /variant="compact"/);
  assert.doesNotMatch(landing, /SectionHero|heroImage|help-hero--photo/);
  assert.match(landing, /data-help-category-nav/);
});

test("Help category navigation routes canonical modules without emoji UI", () => {
  assert.match(landing, /category === "adopcia"\) return "\/pomoc-psom\/adopcia"/);
  assert.match(landing, /category === "stratene-a-najdene"\) return "\/pomoc-psom\/stratene-psy"/);
  assert.match(categoryRoute, /redirect\("\/pomoc-psom\/stratene-psy"\)/);
  assert.match(landing, /<HelpCategoryIcon/);
  assert.doesNotMatch(landing, emojiUi);
  assert.doesNotMatch(browser, emojiUi);
  assert.doesNotMatch(card, emojiUi);
  assert.doesNotMatch(adoption, emojiUi);
  assert.doesNotMatch(lostFound, emojiUi);
  assert.doesNotMatch(detail, emojiUi);
  assert.doesNotMatch(organization, emojiUi);
  assert.doesNotMatch(icons, emojiUi);
});

test("Help landing counts come from canonical adoption and lost-found stores", () => {
  assert.match(rootRoute, /getPublicAdoptions/);
  assert.match(rootRoute, /listPublicDogReports\("LOST"/);
  assert.match(rootRoute, /listPublicDogReports\("FOUND"/);
  assert.match(rootRoute, /"stratene-a-najdene": lost\.total \+ found\.total/);
  assert.match(rootRoute, /adopcia: adoptions\.pagination\.total/);
});

test("generic Help browser does not merge dedicated adoption or lost-found domains", () => {
  assert.match(browser, /dedicatedCategories = new Set<HelpCategorySlug>\(\["adopcia", "stratene-a-najdene"\]\)/);
  assert.match(landing, /item\.category !== "stratene-a-najdene"/);
  assert.doesNotMatch(browser, /category\.slug !== "adopcia"/);
});

test("fundraising progress is rendered only when both real amounts exist", () => {
  assert.match(helpModel, /item\.goalAmount === null/);
  assert.match(helpModel, /item\.raisedAmount === null/);
  assert.doesNotMatch(helpModel, /raisedAmount \?\? 0/);
  assert.match(card, /item\.raisedAmount !== null/);
  assert.match(card, /item\.goalAmount !== null/);
  assert.match(detail, /item\.raisedAmount === null && item\.goalAmount === null/);
  assert.doesNotMatch(detail, /raisedAmount \?\? 0/);
});

test("adoption and lost-found listings expose canonical data-first fields", () => {
  assert.match(adoption, /dog\.organizationName/);
  assert.match(adoption, /dog\.organizationSlug/);
  assert.match(adoption, /dog\.lastVerifiedAt/);
  assert.match(adoption, /dog\.publishedAt/);
  assert.match(lostFound, /listPublicDogReports\(type/);
  assert.match(lostFound, /dogReportTypeLabel\(type\)/);
  assert.match(lostFound, /formatDogReportDate\(report\.eventDate\)/);
});

test("empty states and 390px mobile contract are explicit", () => {
  assert.match(browser, /Momentálne nemáme publikovaný prípad pre tieto filtre\./);
  assert.match(lostFound, /Momentálne nemáme publikovaný prípad pre tieto filtre\./);
  assert.match(adoption, /Momentálne nemáme publikovaný profil pre tieto filtre\./);
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /grid-template-columns:1fr/);
  assert.match(styles, /min-height:44px/);
  assert.doesNotMatch(styles, /overflow-x:\s*(?:scroll|auto)/);
});


test("Help Admin owns only generic Help and routes dedicated domains to their canonical admins", () => {
  assert.match(adminQuery, /HELP_ADMIN_DEDICATED_CATEGORIES = \["adopcia", "utulky", "stratene-a-najdene"\]/);
  assert.match(adminQuery, /HELP_ADMIN_CREATE_CATEGORIES = \["docasna-opatera", "zbierky", "dobrovolnictvo"\]/);
  assert.match(adminDashboard, /href="\/admin\/adopcie"/);
  assert.match(adminDashboard, /href="\/admin\/stratene-najdene"/);
  assert.match(adminDashboard, /href="\/admin\/organizacie"/);
  assert.match(adminEditor, /HELP_ADMIN_CREATE_CATEGORIES/);
  assert.doesNotMatch(adminEditor, /helpCategories\.filter/);
  assert.match(adminStore, /Adopcie sa spravujú v canonical sekcii Adopcie/);
  assert.match(adminStore, /Lost\/Found sekcii/);
  assert.match(adminImport, /isHelpAdminDedicatedCategory/);
});

test("Help Admin mobile controls declare touch-safe targets without changing shared AdminShell", () => {
  assert.match(adminStyles, /min-height:44px/);
  assert.match(adminStyles, /@media\(max-width:760px\)/);
  assert.match(adminStyles, /grid-template-columns:1fr/);
});
