import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TRNAVA_ADOPTION_DETAIL_ADAPTER,
  trnavaAdoptionDetailAdapter,
} from "../lib/data-automation-adoption-adapters.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";

function source(sourceUrl) {
  return {
    id: 901,
    entityType: "ADOPTION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl,
    config: {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: TRNAVA_ADOPTION_DETAIL_ADAPTER,
      expectedMinRecords: 1,
    },
    maxRecordsPerRun: 10,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };
}

const activeHtml = `
<!doctype html>
<html lang="sk">
  <body>
    <h1>Triny</h1>
    <div>Pohlavie: fenka</div>
    <div>Vek: 6 rokov 3 mesiace</div>
    <div>Rasa: Cane Corso</div>
    <div>Veľkosť: 55 cm</div>
    <div>Váha: 31,5 kg</div>
    <div>Farba: hnedá</div>
    <div>Kastrácia: Áno</div>
    <div>Očkovaný: Áno</div>
    <div>Hendikep: Nie</div>
    <p>V prípade záujmu o adopciu nás kontaktujte.</p>
  </body>
</html>
`;

test("HELP-INGEST-1B production registry wires the Trnava ADOPTION adapter", () => {
  assert.equal(
    productionAutomationHtmlAdapters[TRNAVA_ADOPTION_DETAIL_ADAPTER],
    trnavaAdoptionDetailAdapter,
  );
});

test("Trnava detail adapter emits one stable ADOPTION record with canonical detail URL", () => {
  const records = trnavaAdoptionDetailAdapter({
    html: activeHtml,
    source: source("https://www.trnava.utulok.sk/psy/triny"),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].sourceRecordId, "https://www.trnava.utulok.sk/psy/triny");
  assert.equal(records[0].sourceUrl, "https://www.trnava.utulok.sk/psy/triny");
  assert.equal(records[0].rawRecord.age, "6 rokov 3 mesiace");
  assert.equal(records[0].rawRecord.size, "55 cm");
  assert.deepEqual(records[0].proposed, {
    name: "Triny",
    organizationName: "Útulok Trnava",
    city: "Trnava",
    district: "Trnava",
    region: "Trnavský kraj",
    externalSourceUrl: "https://www.trnava.utulok.sk/psy/triny",
    sex: "FEMALE",
    approximateAgeMonths: 75,
    breedName: "Cane Corso",
    weight: 31.5,
    color: "hnedá",
  });
});

test("Trnava detail adapter preserves adopted lifecycle signal outside canonical proposal", () => {
  const records = trnavaAdoptionDetailAdapter({
    html: activeHtml.replace("<h1>Triny</h1>", "<h1>Doby</h1><strong>Adoptovaný</strong>"),
    source: source("https://trnava.utulok.sk/psy/doby"),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].rawRecord.adopted, true);
  assert.equal(Object.hasOwn(records[0].proposed, "status"), false);
});

test("Trnava adapter fails closed for list pages and foreign hosts", () => {
  assert.deepEqual(trnavaAdoptionDetailAdapter({
    html: activeHtml,
    source: source("https://trnava.utulok.sk/psy/"),
  }), []);
  assert.deepEqual(trnavaAdoptionDetailAdapter({
    html: activeHtml,
    source: source("https://example.sk/psy/triny"),
  }), []);
});

test("Trnava adapter fails closed when a detail page has no dog heading", () => {
  assert.deepEqual(trnavaAdoptionDetailAdapter({
    html: activeHtml.replace("<h1>Triny</h1>", ""),
    source: source("https://trnava.utulok.sk/psy/triny"),
  }), []);
});


test("Trnava proposed payload is canonical-safe for the ADOPTION apply allowlist", () => {
  const records = trnavaAdoptionDetailAdapter({
    html: activeHtml,
    source: source("https://trnava.utulok.sk/psy/triny"),
  });
  assert.equal(records.length, 1);

  const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
  const adoptionConfig = applySource.match(/ADOPTION:\s*\{[\s\S]*?\n  FOSTER:/)?.[0] ?? "";
  const allowedFields = new Set(
    [...adoptionConfig.matchAll(/^\s{6}([A-Za-z_][A-Za-z0-9_]*):\s*(?:field|numberField|bool|jsonField)\(/gm)]
      .map((match) => match[1]),
  );
  const unsupported = Object.keys(records[0].proposed).filter((key) => !allowedFields.has(key));

  assert.deepEqual(unsupported, []);
  assert.equal(Object.hasOwn(records[0].proposed, "status"), false);
  assert.equal(Object.hasOwn(records[0].proposed, "ageNote"), false);
  assert.equal(Object.hasOwn(records[0].proposed, "sizeNote"), false);
  assert.equal(Object.hasOwn(records[0].proposed, "weightKg"), false);
  assert.equal(records[0].proposed.weight, 31.5);
});

test("ADOPTION canonical apply keeps CREATE_DRAFT lifecycle fail-closed", () => {
  const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
  const adoptionDraft = applySource.match(/if \(finding\.entityType === "ADOPTION"\)[\s\S]*?\n  if \(finding\.entityType === "LOST_FOUND"\)/)?.[0] ?? "";

  assert.match(adoptionDraft, /status:\s*"DRAFT"/);
  assert.match(adoptionDraft, /published_at:\s*null/);
  assert.match(applySource, /unsupportedAutomationApplyFields\(finding\.entityType, finding\.diff\)/);
});
