import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const page = read("app/plemena/[slug]/page.tsx");
const css = read("app/plemena/[slug]/breed-profile.module.css");

test("breed profile reuses the canonical Help public detail shell", () => {
  assert.match(page, /import \{ PublicHelpProfileDetailLayout \} from "@\/components\/public-visual-system\/public-help-profile-detail-layout"/);
  assert.match(page, /<PublicHelpProfileDetailLayout\s+aside=\{/);
  assert.match(page, /<DetailFactsCard title="Plemeno v skratke" facts=\{quickFacts\}/);
  assert.match(page, /data-testid="breed-quick-facts"/);
  assert.match(page, /data-testid="breed-content-layout"/);
  assert.doesNotMatch(page, /<PublicDetailLayout|<BreedSectionNav|coatSummary|coatExcerpt/);
});

test("coat detail is shown in one practical care section, not duplicated below hero", () => {
  assert.match(page, /const coatParagraphs = textParagraphs\(editorial\.coatCare\)/);
  assert.match(page, /const coatContent = coatParagraphs\.length \? coatParagraphs : textParagraphs\(breed\.coat\)/);
  assert.match(page, /key: "coat",\s+title: "Starostlivosť o srsť",\s+paragraphs: coatContent/);
  assert.doesNotMatch(page, /title: "Srsť a starostlivosť"|title: "Pohyb a každodenný život"/);
  assert.equal((page.match(/<DetailFactsCard title="Plemeno v skratke"/g) ?? []).length, 1);
});

test("all eight 1-to-5 breed ratings remain intact in the Help layout", () => {
  for (const label of [
    "Energia", "Trénovateľnosť", "Vzťah k deťom", "Vzťah k iným psom",
    "Vhodnosť do bytu", "Náročnosť starostlivosti", "Pĺznutie", "Lovecký inštinkt",
  ]) assert.ok(page.includes(label), label);
  assert.match(page, /<meter min=\{1\} max=\{5\} value=\{value\}/);
  assert.match(page, /id="hodnotenia"/);
  assert.match(css, /Breed v5: Help template/);
  assert.match(css, /\.page \.contentLayout \.ratingSection/);
  assert.match(css, /@media \(max-width: 800px\)/);
});

test("breed profile omits redundant V tomto profile navigation without removing facts", () => {
  assert.doesNotMatch(page, /V tomto profile|sidebarIndex|sectionNavItems|Rýchly prechod v profile/);
  assert.doesNotMatch(css, /sidebarIndex/);
  assert.match(page, /<DetailFactsCard title="Plemeno v skratke" facts=\{quickFacts\}/);
  assert.match(page, /data-testid="breed-utility-sidebar"/);
  assert.match(page, /id="hodnotenia"/);
  assert.match(page, /<PublicMagazineBanner/);
});

test("each breed section uses a single editorial heading with distinct practical cards", () => {
  const subsection = read("app/plemena/[slug]/breed-profile-accordion.tsx");
  assert.match(page, /<h2 id="breed-practical">Život a starostlivosť<\/h2>/);
  assert.match(page, /<h2 id="breed-fit">Je toto plemeno pre mňa\?<\/h2>/);
  assert.doesNotMatch(page, /Praktický pohľad|Každodenný život so psom|Praktické informácie|Všeobecná charakteristika/);
  assert.doesNotMatch(page, /<p className=\{styles\.eyebrow\}>|<span className="eyebrow">/);
  assert.doesNotMatch(subsection, /<small>|eyebrow/);
  assert.match(css, /\.page \.contentLayout \.accordion\s*\{[\s\S]*?border: 1px solid/);
  assert.match(css, /\.page \.contentLayout \.accordionList\s*\{[\s\S]*?gap: 12px/);
});

test("mobile facts appear second, directly after O plemene, without changing desktop aside", () => {
  const about = page.indexOf('<h2 id="breed-about">O plemene</h2>');
  const mobile = page.indexOf('data-testid="breed-quick-facts-mobile"');
  const ratings = page.indexOf('id="hodnotenia"');
  assert.ok(about >= 0 && about < mobile && mobile < ratings);
  assert.match(page, /className=\{styles\.desktopFacts\} data-testid="breed-quick-facts"/);
  assert.match(page, /className=\{styles\.mobileFacts\} data-testid="breed-quick-facts-mobile"/);
  assert.match(css, /\.mobileFacts \{ display: none/);
  assert.match(css, /@media \(max-width: 800px\) \{[\s\S]*?\.desktopFacts \{ display: none/);
  assert.match(css, /\.mobileFacts \{[\s\S]*?display: block/);
  assert.match(page, /<DetailFactsCard title="Plemeno v skratke" facts=\{quickFacts\}/);
});
