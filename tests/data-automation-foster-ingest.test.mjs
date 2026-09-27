import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER,
  ZATULANE_PSIKY_SALA_FOSTER_SOURCE_SHAPE,
  zatulanePsikySalaFosterDetailAdapter,
} from "../lib/data-automation-foster-adapters.ts";
import { buildAutomationDiff } from "../lib/data-automation.ts";
import { unsupportedAutomationApplyFields } from "../lib/data-automation-apply.ts";

const fixture = readFileSync(
  new URL("./fixtures/data-automation/zatulane-psiky-sala-foster-detail.html", import.meta.url),
  "utf8",
);

function source(sourceUrl = "https://www.zatulanepsikysala.sk/pomoc/markyz/") {
  return {
    id: 951,
    entityType: "FOSTER",
    connectorType: "CONTROLLED_HTML",
    sourceUrl,
    config: {
      sourceShape: ZATULANE_PSIKY_SALA_FOSTER_SOURCE_SHAPE,
      htmlAdapterKey: ZATULANE_PSIKY_SALA_FOSTER_DETAIL_ADAPTER,
      expectedMinRecords: 1,
    },
    maxRecordsPerRun: 1,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    throttleMs: 0,
  };
}

function parse(html = fixture, sourceUrl) {
  return zatulanePsikySalaFosterDetailAdapter({
    html,
    source: source(sourceUrl),
  });
}

test("HELP-INGEST-1C parses one explicit item-level foster detail", () => {
  const records = parse();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].proposed, {
    title: "Markýz",
    dogName: "Markýz",
    actionUrl: "https://zatulanepsikysala.sk/pomoc/markyz",
    organization: "Zatúlané psíky Šaľa",
    breed: "Kríženec",
    description:
      "Markýz je priateľský psík, ktorý hľadá pokojné zázemie a človeka ochotného venovať mu čas, bezpečie a pravidelný kontakt.\n\n" +
      "V útulku sa učí fungovať pri bežnej manipulácii a pri vhodnom vedení dobre spolupracuje s ľuďmi, ktorých pozná.",
  });
});

test("stable identity and provenance use the canonical concrete detail URL", () => {
  const [record] = parse();
  assert.equal(record.sourceRecordId, "https://zatulanepsikysala.sk/pomoc/markyz");
  assert.equal(record.sourceUrl, "https://zatulanepsikysala.sk/pomoc/markyz");
  assert.equal(record.sourceTimestamp, null);
  assert.equal(record.rawRecord.detailUrl, record.sourceUrl);
  assert.deepEqual(record.rawRecord.supportModes, [
    "Trvalá adopcia",
    "Virtuálna adopcia",
    "Dočasná opatera",
  ]);
  assert.equal(record.rawRecord.birthDate, "06/2022");
  assert.equal(record.rawRecord.shelterSince, "12/2024");
});

test("FOSTER proposal is canonical-safe according to the real apply contract", () => {
  const [record] = parse();
  const diff = buildAutomationDiff(null, record.proposed);
  assert.deepEqual(unsupportedAutomationApplyFields("FOSTER", diff), []);
  assert.deepEqual(Object.keys(record.proposed).sort(), [
    "actionUrl",
    "breed",
    "description",
    "dogName",
    "organization",
    "title",
  ]);
});

test("source shape is explicit SINGLE_ITEM with no index-derived identity", () => {
  const [record] = parse();
  assert.equal(ZATULANE_PSIKY_SALA_FOSTER_SOURCE_SHAPE, "SINGLE_ITEM");
  assert.equal(source().config.sourceShape, "SINGLE_ITEM");
  assert.doesNotMatch(record.sourceRecordId, /(?:row-|index|\b0\b|\b1\b)/i);
});

test("malformed, empty, foreign-host and unsupported-path pages fail closed", () => {
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse(fixture.replace("<h1>Markýz</h1>", "")), []);
  assert.deepEqual(parse(fixture, "https://example.sk/pomoc/markyz/"), []);
  assert.deepEqual(parse(fixture, "https://zatulanepsikysala.sk/psy-na-adopciu/"), []);
  assert.deepEqual(parse(fixture, "https://zatulanepsikysala.sk/pomoc/"), []);
});

test("global foster CTA is insufficient without the item taxonomy signal", () => {
  const noItemFoster = fixture.replace(
    "<p>Trvalá adopcia, Virtuálna adopcia, Dočasná opatera</p>",
    "<p>Trvalá adopcia, Virtuálna adopcia</p>",
  );
  assert.match(noItemFoster, /support-cta">Dočasná opatera/);
  assert.deepEqual(parse(noItemFoster), []);
});

test("urgent is proposed only from an explicit item-level taxonomy token", () => {
  const [plain] = parse();
  assert.equal(Object.hasOwn(plain.proposed, "urgent"), false);
  assert.equal(plain.rawRecord.urgent, false);

  const urgentFixture = fixture.replace(
    "Trvalá adopcia, Virtuálna adopcia, Dočasná opatera",
    "Urgentná pomoc, Trvalá adopcia, Virtuálna adopcia, Dočasná opatera",
  );
  const [urgent] = parse(urgentFixture);
  assert.equal(urgent.proposed.urgent, true);
  assert.equal(urgent.rawRecord.urgent, true);
  assert.deepEqual(
    unsupportedAutomationApplyFields("FOSTER", buildAutomationDiff(null, urgent.proposed)),
    [],
  );
});

test("resolved is proposed only from an explicit adopted heading", () => {
  const [plain] = parse();
  assert.equal(Object.hasOwn(plain.proposed, "resolved"), false);
  assert.equal(plain.rawRecord.resolved, false);

  const resolvedFixture = fixture.replace(
    "<h1>Markýz</h1>",
    "<h1>Markýz – adoptovaný</h1>",
  );
  const [resolved] = parse(resolvedFixture);
  assert.equal(resolved.proposed.resolved, true);
  assert.equal(resolved.proposed.dogName, "Markýz");
  assert.equal(resolved.rawRecord.resolved, true);
  assert.deepEqual(
    unsupportedAutomationApplyFields("FOSTER", buildAutomationDiff(null, resolved.proposed)),
    [],
  );
});

test("disappearance is never interpreted as resolved", () => {
  assert.deepEqual(
    parse(fixture.replace("Dočasná opatera</p>", "Trvalá adopcia</p>")),
    [],
  );
});

test("adapter output is deterministic across repeated parses", () => {
  assert.deepEqual(parse(), parse());
});

test("explicit age is proposed only when the source actually contains it", () => {
  const [withoutAge] = parse();
  assert.equal(Object.hasOwn(withoutAge.proposed, "ageNote"), false);

  const [withAge] = parse(fixture.replace("<h2>Vek:</h2>", "<h2>Vek:</h2> 4 roky"));
  assert.equal(withAge.proposed.ageNote, "4 roky");
  assert.deepEqual(
    unsupportedAutomationApplyFields("FOSTER", buildAutomationDiff(null, withAge.proposed)),
    [],
  );
});

test("existing FOSTER CREATE_DRAFT contract remains draft-only and category-safe", () => {
  const draftService = readFileSync(new URL("../lib/canonical-draft-service.ts", import.meta.url), "utf8");
  assert.match(draftService, /const isFoster = input\.entityType === "FOSTER"/);
  assert.match(draftService, /const category = isFoster \? "docasna-opatera"/);
  assert.match(draftService, /status: "draft"/);
  assert.match(draftService, /published_at: null/);
});
