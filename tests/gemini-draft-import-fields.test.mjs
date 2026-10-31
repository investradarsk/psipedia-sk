import test from "node:test";
import assert from "node:assert/strict";
import { prepareGeminiDraftFields } from "../lib/gemini-draft-import-fields.ts";

test("Monty Gemini adoption can enter a private canonical draft with Slovak choices", () => {
  const original = { "Meno":"Monty", "Pohlavie":"Pes", "Veľkosť":"Stredný pes",
    "Hlavný obrázok URL":"https://example.org/monty.jpg", "Stav":"Nápad" };
  const result = prepareGeminiDraftFields("adoptions", original);
  assert.equal(result.values["Pohlavie"], "MALE");
  assert.equal(result.values["Veľkosť"], "MEDIUM");
  assert.equal(result.values["Stav"], "Nápad");
  assert.ok(result.warnings.some(x => x.includes("vek")));
  assert.equal(original["Pohlavie"], "Pes", "original Notion evidence is not mutated");
});

test("Kai adoption preserves unknown age and fills it in Admin, not an invented date", () => {
  const { values, warnings } = prepareGeminiDraftFields("adoptions", {
    "Meno":"Kai", "Pohlavie":"Pes", "Veľkosť":"Stredný",
    "Hmotnosť":16, "Vek mesiace":null, "Dátum narodenia":"",
    "Kraj":"Banskobystrický kraj",
  });
  assert.equal(values["Pohlavie"], "MALE");
  assert.equal(values["Veľkosť"], "MEDIUM");
  assert.equal(values["Hmotnosť"], 16);
  assert.equal(values["Dátum narodenia"], "");
  assert.ok(warnings.some(x=>x.includes("približný vek")));
});

test("Rocky and Blue can stay DRAFT with private or empty exact location", () => {
  const { values, warnings } = prepareGeminiDraftFields("lost-found", {
    "Názov":"Stratený pes – Rocky", "Psipedia stav":"DRAFT",
    "Typ":"LOST", "Pohlavie":"Pes", "Veľkosť":"Malý", "Čip":"Áno",
    "Miesto":"", "Mesto":"Ždiar",
  });
  assert.equal(values["Pohlavie"], "MALE");
  assert.equal(values["Veľkosť"], "SMALL");
  assert.equal(values["Čip"], "YES");
  assert.equal(values["Psipedia stav"], "DRAFT");
  assert.equal(values["Miesto"], "");
  assert.ok(!warnings.some(x=>x.includes("Presné miesto")));
});

test("unsafe or unparseable fields produce warnings rather than blocking a signed draft", () => {
  const { values, warnings } = prepareGeminiDraftFields("adoptions", {
    "Pohlavie":"?", "Veľkosť":"?", "Hmotnosť":-20,
    "Vek mesiace":"päť", "Hlavný obrázok URL":"javascript:alert(1)",
    "Kraj":"Neznámy", "Dátum narodenia":"bad",
  });
  assert.equal(values["Pohlavie"], "UNKNOWN");
  assert.equal(values["Veľkosť"], "UNKNOWN");
  assert.equal(values["Hmotnosť"], null);
  assert.equal(values["Vek mesiace"], null);
  assert.equal(values["Hlavný obrázok URL"], "");
  assert.equal(values["Kraj"], "");
  assert.equal(values["Dátum narodenia"], "");
  assert.ok(warnings.length >= 6);
});

test("all five non-directory agendas permit incomplete review fields without accidental public status", () => {
  const samples = [
    ["events", {"Stav":"Nápad", "Začiatok":"bad", "Web":"ftp://unsafe.com"}],
    ["organizations", {"Stav":"Nápad", "Web":"javascript:unsafe"}],
    ["adoptions", {"Stav":"Nápad"}],
    ["help-cases", {"Psipedia stav":"draft", "Cieľ":-1}],
    ["lost-found", {"Psipedia stav":"DRAFT", "Pohlavie":"Samec"}],
  ];
  for(const [agenda, source] of samples) {
    const { values, warnings } = prepareGeminiDraftFields(agenda, source);
    const status = source["Stav"] ?? source["Psipedia stav"];
    assert.equal(values["Stav"] ?? values["Psipedia stav"], status, String(agenda));
    assert.ok(Array.isArray(warnings));
  }
});

test("read-only native Gemini import warnings keep their identity and no-publication guard", async () => {
  const { readFile } = await import("node:fs/promises");
  const sync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url),"utf8");
  const editor = await readFile(new URL("../components/admin-gemini-origin-badge.tsx", import.meta.url),"utf8");
  assert.match(sync,/prepareGeminiDraftFields\(input.definition.key, values\)/);
  assert.match(sync,/recordGeminiImportReviewNotes\(input.database, input.definition.key/);
  assert.match(sync,/if \(!trustedGemini\) throw error/);
  assert.match(editor,/getGeminiImportReviewNotes/);
});
