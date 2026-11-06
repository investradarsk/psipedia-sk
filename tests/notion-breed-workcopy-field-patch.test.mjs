import test from "node:test";
import assert from "node:assert/strict";
import { planBreedWorkCopyMergedFieldPatch as plan } from "../lib/notion-breed-workcopy-field-patch.mjs";
import { splitBreedWorkCopyField as split } from "../lib/notion-breed-workcopy-adapter.mjs";

const target = "FCI lebka";
const text = "Pôvodná hlava. — Oči podľa FCI: Tmavohnedé oči. — Tvárová časť podľa FCI: Čierny nos. — Uši podľa FCI: Stredné uši.";
const run = (field, currentText, newValue, expectedText = currentText, dst = target) =>
  plan({ target: dst, field, currentText, expectedText, newValue });
const valueOf = p => (p.properties?.[p.target]?.rich_text ?? []).map(x => x.text.content).join("");

test("one merged FCI subsection update preserves base, nose and ears exactly", () => {
  const p = run("FCI oči", text, "Jasné oči.");
  assert.equal(p.changed, true);
  assert.deepEqual(Object.keys(p.properties), [target]);
  assert.equal(valueOf(p), p.nextText);
  const before = split(target, text), after = split(target, p.nextText);
  assert.equal(after.base, before.base);
  assert.equal(after.sources["FCI tvár"], before.sources["FCI tvár"]);
  assert.equal(after.sources["FCI uši"], before.sources["FCI uši"]);
  assert.equal(after.sources["FCI oči"], "Jasné oči.");
});

test("updating the base text leaves all labeled FCI subsections untouched", () => {
  const p = run(target, text, "Nový odborný opis hlavy.");
  const before = split(target, text), after = split(target, p.nextText);
  assert.equal(after.base, "Nový odborný opis hlavy.");
  assert.deepEqual(after.sources, before.sources);
});

test("adding and removing one missing section leaves all other text untouched", () => {
  const bare = "Len pôvodná hlava.";
  const first = run("FCI oči", bare, "Tmavohnedé.");
  assert.equal(first.nextText, "Len pôvodná hlava. — Oči podľa FCI: Tmavohnedé.");
  const second = run("FCI oči", first.nextText, "");
  assert.equal(second.nextText, bare);
  const removed = run("FCI oči", text, "");
  const parsed = split(target, removed.nextText);
  assert.equal(parsed.sources["FCI oči"], undefined);
  assert.equal(parsed.sources["FCI tvár"], "Čierny nos.");
  assert.equal(parsed.sources["FCI uši"], "Stredné uši.");
});

test("base edits can introduce text before first labeled section without losing it", () => {
  const current = "Oči podľa FCI: Hnedé.";
  const p = run(target, current, "Základný text.");
  assert.equal(p.nextText, "Základný text. — Oči podľa FCI: Hnedé.");
  assert.equal(split(target, p.nextText).sources["FCI oči"], "Hnedé.");
});

test("unchanged field makes no PATCH; other edits cannot be acknowledged", () => {
  const p = run(target, text, "Pôvodná hlava.");
  assert.equal(p.changed, false);
  assert.deepEqual(p.properties, {});
  assert.throws(() => run("FCI oči", text, "Hnedé", "Stará verzia"),
    /BREED_WORKCOPY_CELL_CHANGED/);
});

test("duplicate markers fail closed before any patch is built", () => {
  const invalid = text + " — Oči podľa FCI: Druhý výskyt.";
  assert.throws(() => run("FCI oči", invalid, "Iné oči"),
    /BREED_WORKCOPY_MERGED_FIELD_INVALID/);
  assert.throws(() => run("FCI oči", text, "Nové oči. — Uši podľa FCI: Zmazané"),
    /BREED_WORKCOPY_PATCH_INVALID_RESULT/);
});

test("field target mapping and FCI typed fragments are validated", () => {
  assert.throws(() => run("FCI oči", text, "Test", text, "Výcvik"),
    /BREED_WORKCOPY_FIELD_NOT_MAPPED/);
  assert.throws(() => run("Platnosť FCI štandardu", "", "wrong date", "", "FCI zdroj poznámka"),
    /BREED_WORKCOPY_DATE_INVALID/);
  assert.throws(() => run("FCI nomenklatúra URL", "", "javascript:alert(1)", "", "FCI zdroj poznámka"),
    /BREED_WORKCOPY_FCI_URL_INVALID/);
});

test("unrelated merged editorial field uses the same independent update contract", () => {
  const current = "Prehľad. — Každodenné potreby: Denne chodiť. — Kategória plemena: Ovčiarske psy";
  const p = run("Potreby", current, "Dlhšie vychádzky", current, "Redakcia prehľad");
  const a = split("Redakcia prehľad", p.nextText);
  assert.equal(a.base, "Prehľad.");
  assert.equal(a.sources["Skupina"], "Ovčiarske psy");
  assert.equal(a.sources["Potreby"], "Dlhšie vychádzky");
});
