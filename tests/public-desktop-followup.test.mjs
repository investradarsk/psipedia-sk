import assert from "node:assert/strict";
import test from "node:test";
import { directoryCatalogFilters } from "../lib/directory-query.ts";
import { readFileSync } from "node:fs";
import { helpListing, helpListingPage, helpListingHref } from "../lib/help-listing.ts";
import {
  legacyRichTextToDocument,
  withoutLeadingEditorialLabel,
} from "../lib/editorial-content.ts";
import { breedComparisonValue } from "../lib/breed-comparison-values.ts";
import { directoryQualificationSections } from "../lib/directory-public-copy.ts";
import { mapItemTypeLabel } from "../lib/map-public-ui.ts";
import { eventTypeListingSeo } from "../lib/events.ts";

test("help pages apply filters and lifecycle before page slicing; page links retain context", () => {
  const items = Array.from({ length: 106 }, (_, i) => ({
    id: i + 1,
    category: "utulky",
    title: `Útulok ${i + 1}`,
    excerpt: "Pomoc psom",
    region: "Nitriansky kraj",
    resolved: false,
  }));
  const first = helpListing(items, { category: "utulky" });
  assert.equal(first.total, 106);
  assert.equal(first.totalPages, 9);
  assert.equal(first.items.length, 12);
  const last = helpListing(items, { category: "utulky", page: 9000 });
  assert.equal(last.page, 9);
  assert.equal(last.items.length, 10);
  assert.equal(new Set([...first.items, ...last.items].map((i) => i.id)).size, 22);
  const link = helpListingHref("/pomoc-psom/utulky", {
    query: "Útulok",
    region: "Nitriansky kraj",
    activeOnly: false,
    page: 2,
  });
  const url = new URL(link, "https://psipedia.sk");
  assert.equal(url.searchParams.get("q"), "Útulok");
  assert.equal(url.searchParams.get("region"), "Nitriansky kraj");
  assert.equal(url.searchParams.get("stav"), "vsetky");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(helpListingPage("bad"), 1);
  assert.equal(helpListingPage("2.5"), 1);
  const closed = { ...items[0], category: "zbierky", excerpt: "Ukončená zbierka", urgent: true };
  assert.equal(helpListing([closed], { category: "zbierky" }).total, 0);
  assert.equal(
    helpListing([closed], { category: "zbierky", activeOnly: false }).items[0].urgent,
    false,
  );
  assert.equal(
    helpListing(items, { query: "utulok 106", region: "Nitriansky kraj", page: 2 }).page,
    1,
  );
});

test("callout labels are removed only once at the beginning and inline marks survive", () => {
  for (const label of ["Tip z praxe", "Dôležité upozornenie"]) {
    const doc = legacyRichTextToDocument(`${label}: **Dôležitá rada.** Neskôr ${label} nemeníme.`);
    const before = JSON.stringify(doc);
    const clean = withoutLeadingEditorialLabel(doc, label);
    assert.equal(JSON.stringify(doc), before, "input is never modified");
    assert.equal(clean.content[0].content[0].text, "Dôležitá rada.");
    assert.equal(clean.content[0].content[0].marks[0].type, "bold");
    assert.equal(
      clean.content[0].content
        .map((n) => n.text ?? "")
        .join("")
        .includes(`Neskôr ${label}`),
      true,
    );
    assert.deepEqual(withoutLeadingEditorialLabel(clean, label), clean);
  }
  const same = {
    version: 1,
    type: "doc",
    content: [
      { type: "heading", level: 3, content: [{ type: "text", text: "Tip z praxe" }] },
      { type: "paragraph", content: [{ type: "text", text: "Rada." }] },
    ],
  };
  assert.equal(withoutLeadingEditorialLabel(same, "Tip z praxe").content.length, 1);
  const prose = legacyRichTextToDocument("Tip z praxe môže byť užitočný.");
  assert.equal(withoutLeadingEditorialLabel(prose, "Tip z praxe"), prose);
});

test("comparison keeps supplied explanations and never invents a measurement", () => {
  const text =
    "Štandard FCI č. 287 neurčuje záväzné hmotnostné rozpätie. Orientačne 16–23 kg podľa zdroja uvedeného v profile.";
  const value = breedComparisonValue(text, "weight");
  assert.equal(value.summary, "Hmotnosť nie je v štandarde určená");
  assert.equal(value.explanation, text);
  const lifespan =
    "Orientačne 12–16 rokov podľa uvedeného zdroja; individuálna dĺžka života závisí od mnohých okolností.";
  assert.equal(breedComparisonValue(lifespan, "lifespan").summary, "Orientačne 12–16 rokov");
  assert.equal(
    breedComparisonValue("Údaj o veku nie je uvedený. ".repeat(5), "lifespan").summary,
    "Pozrieť podrobnosti",
  );
  assert.equal(breedComparisonValue("", "weight").summary, "Neuvedené");
});

test("qualification prose and source notes have separate surfaces; technical traces are omitted", () => {
  const sections = directoryQualificationSections([
    "Certifikovaný tréner",
    "Zdroj údajov: Oficiálny web",
    "Notion: import",
    "Stav overenia: nový",
    "source_data_json: {}",
  ]);
  assert.deepEqual(sections, {
    qualifications: ["Certifikovaný tréner"],
    sources: ["Oficiálny web"],
  });
});

test("map labels and event category title match the existing category dictionaries", () => {
  assert.equal(
    mapItemTypeLabel({ entityType: "service", subcategory: "veterinari" }),
    "Veterinári",
  );
  assert.equal(
    mapItemTypeLabel({ entityType: "service", subcategory: "kynologicke-kluby" }),
    "Kynologické kluby",
  );
  assert.equal(
    mapItemTypeLabel({ entityType: "service", subcategory: "internal-value" }),
    "Služba",
  );
  assert.equal(eventTypeListingSeo("Seminár").title, "Semináre so psami");
});

test("public service form exposes catalogue service only, with legacy values preserved as hidden URL context", () => {
  const form = readFileSync("components/directory-filter-form.tsx", "utf8");
  assert.doesNotMatch(form, /name="(?:service|type)"/);
  assert.match(form, /name="svc"/);
  assert.match(form, /mapping.targetKind === "service"/);
  assert.match(form, /!serviceFacetIds.has\(facet.id\)/);
});

test("canonical catalogue selection replaces legacy restrictions with JavaScript disabled too", () => {
  const legacy = {
    service: "Legacy diagnostics",
    profileType: "Psí salón",
    canonicalService: "",
    facets: { "fyzioterapia.hydrotherapy": "yes", "fyzioterapia.home_visits": "yes" },
  };
  assert.equal(directoryCatalogFilters(legacy), legacy);
  const current = directoryCatalogFilters({
    ...legacy,
    canonicalService: "svc.physio.hydrotherapy",
  });
  assert.equal(current.service, "");
  assert.equal(current.profileType, "");
  assert.equal(current.facets["fyzioterapia.hydrotherapy"], undefined);
  assert.equal(current.facets["fyzioterapia.home_visits"], "yes");
});
