import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  directoryLegacyPublicFactSources, directoryLegacyEditableFactKeys,
  directoryLegacyOpeningHoursSource, getDirectoryDetailPresentation,
} from "../lib/directory-detail-presentation.ts";
import {
  suppressLinkedBreederFact, suppressLinkedBreederQualification,
} from "../lib/breeder-relation-text.ts";
import {
  projectPublicProfileServices, canonicalPublicProfileServices,
} from "../lib/service-catalog-public-profile-services.ts";
import {
  getHelpLabelledSourceFields, replaceHelpLabelledSourceValue, getHelpPresentation,
} from "../lib/help-detail-presentation.ts";
import {
  resolvePublicBreedFacts, resolvePublicBreedFactsWithSources,
} from "../lib/breed-public-facts.mjs";
import { publicBreedMeasurementWithSource } from "../lib/breed-fci.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const directory = (category, importData = {}) => ({
  id: 500, name: "Testovací profil", slug: "testovaci-profil",
  category, status: "published", services: [], qualifications: [],
  excerpt: "", description: "", city: "Nitra", district: "",
  region: "Nitriansky kraj", address: "", priceNote: "",
  imageUrl: null, websiteUrl: "", verified: false, featured: false,
  importData, seo: {},
});

test("7/7 – every imported public directory fact is represented by the existing editor contract", () => {
  const data = {
    Plemeno: "Labradorský retriever", Klub: "Klub retrieverov",
    "FCI skupina": "8", Chovateľ: "Testovací chovateľ",
    "Otváracia doba": "Po–Pi 8:00–16:00", "Interná poznámka": "Nemá sa zobraziť",
  };
  const profile = directory("chovatelske-stanice", data);
  const facts = directoryLegacyPublicFactSources(profile);
  const editable = new Set(directoryLegacyEditableFactKeys(profile));
  assert.ok(facts.some(fact => fact.label === "Klub" && fact.value === data.Klub));
  for (const fact of facts)
    if (!["Organizácia", "Zameranie"].includes(fact.label))
      assert.ok(editable.has(fact.sourceKey), "Missing Admin fact editor: " + fact.sourceKey);
  assert.equal(facts.some(fact => fact.value === data["Interná poznámka"]), false);
  assert.deepEqual(directoryLegacyOpeningHoursSource(profile),
    {sourceKey: "Otváracia doba", value: data["Otváracia doba"]});
  assert.equal(getDirectoryDetailPresentation(profile).openingHours, data["Otváracia doba"]);
  assert.equal(suppressLinkedBreederFact("Plemeno", 1, 0), true);
  assert.equal(suppressLinkedBreederFact("Klub", 0, 1), true);
  assert.equal(suppressLinkedBreederFact("FCI skupina", 1, 1), false);
  assert.equal(suppressLinkedBreederQualification("Klub: Klub retrieverov", [], ["Klub retrieverov"]), true);
  assert.equal(suppressLinkedBreederQualification("Klub: Klub retrieverov", [], []), false);
});

test("7/7 – exact legacy/V3 projections are shared; UNKNOWN does not erase historic services", () => {
  const original = ["Očkovanie", "Očkovanie", "Historická služba"];
  const catalog = [{id:"svc.vet.vaccination", label:"Očkovanie",aliases:["Vakcinácia"],categories:["veterinari"]}];
  const snapshot = JSON.stringify({original,catalog});
  const yes = projectPublicProfileServices(original,"veterinari",
    [{option_id:"svc.vet.vaccination",choice:"yes"}],catalog);
  assert.deepEqual(yes.services,["Očkovanie","Historická služba"]);
  assert.deepEqual(yes.services,canonicalPublicProfileServices(original,"veterinari",
    [{option_id:"svc.vet.vaccination",choice:"yes"}],catalog));
  assert.equal(yes.visible[0].source,"catalog");
  const no = projectPublicProfileServices(original,"veterinari",
    [{option_id:"svc.vet.vaccination",choice:"no"}],catalog);
  assert.deepEqual(no.services,["Historická služba"]);
  assert.ok(no.suppressed.some(entry=>entry.reason==="explicit_no"));
  const unknown = projectPublicProfileServices(original,"veterinari",[],catalog);
  assert.deepEqual(unknown.services,["Očkovanie","Historická služba"]);
  assert.equal(JSON.stringify({original,catalog}),snapshot,"projection cannot mutate input or historical data");
});

test("7/7 – a Help public fact remains one editable source span, not an untraceable separate field", () => {
  const description = "Pomáhame psom. Dobrovoľníctvo: venčenie Materiálna pomoc: deky";
  const parsed = getHelpLabelledSourceFields(description);
  assert.deepEqual(parsed.map(x=>x.label),["Dobrovoľníctvo","Materiálna pomoc"]);
  const changed = replaceHelpLabelledSourceValue(description,0,"venčenie aj čistenie");
  const result = getHelpPresentation({description:changed,contactNote:"Telefón: +421 900 123 456"});
  assert.ok(changed.startsWith("Pomáhame psom."));
  assert.ok(changed.includes("Materiálna pomoc: deky"));
  assert.ok(result.helpOptions.some(x=>x.label==="Dobrovoľníctvo" &&
    x.value==="venčenie aj čistenie"));
  assert.ok(result.contacts.some(x=>x.label==="Telefón"));
});

test("7/7 – breed public/FCI source is inspectable with unchanged values and canonical precedence", () => {
  const fci = publicBreedMeasurementWithSource("", "height", ["55–60", "53–58"]);
  assert.equal(fci.source,"fci");
  assert.equal(fci.value,"53–60 cm");
  const legacy = {origin:"Slovensko",height:fci.value,weight:"23–30 kg",
    size:"Stredne veľký",lifespan:"10–12 rokov",fciGroup:8,fciSection:"Retrievery"};
  const numeric = {heightMinCm:54,heightMaxCm:61,weightMinKg:null,weightMaxKg:null};
  const receipt = resolvePublicBreedFactsWithSources(legacy,numeric,{height:fci.source});
  assert.equal(receipt.facts.height,"54–61 cm");
  assert.equal(receipt.sources.height,"controlled");
  assert.equal(receipt.sources.weight,"legacy");
  assert.deepEqual(receipt.facts,resolvePublicBreedFacts(legacy,numeric));
  assert.equal(legacy.height,"53–60 cm");
});

test("7/7 – Admin/D1/Notion safeguards require field-level receipts and preserve other sources", () => {
  const route = read("app/api/admin/directory/[id]/route.ts");
  const editor = read("components/admin-directory-editor.tsx");
  const sync = read("lib/notion-directory-sync.ts");
  const breedEditor = read("components/admin-breed-editor.tsx");
  const publicBreed = read("app/plemena/[slug]/page.tsx");
  assert.match(editor,/pilotMetadataOriginalValues/);
  assert.match(editor,/pilotMetadataFields, pilotMetadataOriginalValues/);
  assert.match(route,/!metadataOriginalValues \|\| keys\.some/);
  assert.match(route,/readDirectoryPublicMetadataValue\(before\.importData, key\)/);
  assert.match(route,/DIRECTORY_CONTACT_PRESERVATION_FAILED_AFTER_NOTION/);
  assert.match(route,/unconfirmedPublicFacts/);
  assert.match(sync,/source_data_json = json_set/);
  assert.match(sync,/DIRECTORY_PILOT_METADATA_WRITE_CONFLICT/);
  assert.match(sync,/DIRECTORY_PUBLIC_METADATA_STALE_VALUE/);
  assert.match(sync,/DIRECTORY_PILOT_METADATA_NOTION_FIELD_NOT_RICH_TEXT/);
  assert.match(breedEditor,/resolvePublicBreedFactsWithSources\(/);
  assert.match(publicBreed,/resolvePublicBreedFacts\(/);
  assert.doesNotMatch(breedEditor,/UPDATE managed_breeds|UPDATE breed_notion_controlled_values/);
});
