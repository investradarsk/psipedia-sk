import test from "node:test";
import assert from "node:assert/strict";
import { breedComparisonValue } from "../lib/breed-comparison-values.ts";

test("long height descriptions retain their complete explanation", () => {
  const original =
    "Minimálna výška v kohútiku podľa FCI: pes 79 cm, suka 71 cm; pri psoch sa požaduje priemerná výška aspoň 86 cm.";
  const display = breedComparisonValue(original, "height");
  assert.equal(display.explanation, original);
  assert.equal(display.summary, "79 cm / 71 cm / 86 cm");
});
test("height summaries do not confuse weights or invent missing measurements", () => {
  const text =
    "Hmotnosť je 54,5 kg. Výška nebola v zdroji zaznamenaná, preto je potrebné overenie u chovateľa.";
  assert.deepEqual(breedComparisonValue(text, "height"), {
    summary: "Pozrieť podrobnosti",
    explanation: text,
  });
  assert.deepEqual(breedComparisonValue("71–79 cm", "height"), {
    summary: "71–79 cm",
    explanation: "",
  });
});
