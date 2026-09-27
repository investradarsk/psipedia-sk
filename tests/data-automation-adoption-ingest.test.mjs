import assert from "node:assert/strict";
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
  assert.deepEqual(records[0].proposed, {
    name: "Triny",
    organizationName: "Útulok Trnava",
    city: "Trnava",
    district: "Trnava",
    region: "Trnavský kraj",
    status: "ACTIVE",
    externalSourceUrl: "https://www.trnava.utulok.sk/psy/triny",
    sex: "FEMALE",
    ageNote: "6 rokov 3 mesiace",
    approximateAgeMonths: 75,
    breedName: "Cane Corso",
    sizeNote: "55 cm",
    weightKg: 31.5,
    color: "hnedá",
  });
});

test("Trnava detail adapter preserves adopted lifecycle signal for human review", () => {
  const records = trnavaAdoptionDetailAdapter({
    html: activeHtml.replace("<h1>Triny</h1>", "<h1>Doby</h1><strong>Adoptovaný</strong>"),
    source: source("https://trnava.utulok.sk/psy/doby"),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].proposed.status, "ADOPTED");
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
