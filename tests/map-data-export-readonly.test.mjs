import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOnlineDirectory,
  protectCsvFormula,
  toCsv,
} from "../scripts/map-data-export-readonly.mjs";

test("online=true with a street address is physical evidence", () => {
  assert.equal(classifyOnlineDirectory({
    category: "veterinari",
    address: "Hlavná 1",
    city: "Nitra",
    region: "Nitriansky kraj",
    coverage: "",
    location_hint: "",
  }).classification, "ONLINE_TRUE_WITH_PHYSICAL_EVIDENCE");
});

test("online=true with a specific city is physical evidence even without street", () => {
  assert.equal(classifyOnlineDirectory({
    category: "treneri",
    address: "",
    city: "Trnava",
    region: "Trnavský kraj",
    coverage: "",
    location_hint: "",
  }).classification, "ONLINE_TRUE_WITH_PHYSICAL_EVIDENCE");
});

test("online/nationwide record with no physical evidence is likely online-only", () => {
  assert.equal(classifyOnlineDirectory({
    category: "chovatelske-kluby",
    address: "",
    city: "Slovensko",
    region: "Online",
    coverage: "Celé Slovensko",
    location_hint: "",
  }).classification, "LIKELY_ONLINE_ONLY");
});

test("physical category without location evidence remains ambiguous", () => {
  assert.equal(classifyOnlineDirectory({
    category: "fyzioterapia",
    address: "",
    city: "",
    region: "",
    coverage: "",
    location_hint: "",
  }).classification, "AMBIGUOUS");
});

test("CSV formula-control characters are neutralized", () => {
  assert.equal(protectCsvFormula("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(protectCsvFormula("+1"), "'+1");
  assert.equal(protectCsvFormula("normal"), "normal");
});

test("CSV serialization quotes commas and quotes", () => {
  assert.equal(
    toCsv([{ a: 'A, B', b: 'He said "hi"' }], ["a", "b"]),
    'a,b\n"A, B","He said ""hi"""\n',
  );
});
