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
  assert.match(page, /key: "coat",\s+eyebrow: "",\s+title: "Starostlivosť o srsť",\s+paragraphs: coatContent/);
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
