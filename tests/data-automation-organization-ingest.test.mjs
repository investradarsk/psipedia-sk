import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fetchAutomationSourceRecords,
  AutomationConnectorError,
} from "../lib/data-automation-connectors.ts";
import {
  organizationOfficialSiteAdapter,
  psiadusaOrganizationDirectoryAdapter,
  productionAutomationHtmlAdapters,
  svpsSheltersRegisterAdapter,
} from "../lib/data-automation-real-sources.ts";
import {
  ORGANIZATION_OFFICIAL_SITE_ADAPTER,
  ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER,
  candidateProvisioningConfigFor,
  organizationHtmlAdapterKeyForSourceUrl,
} from "../lib/data-automation-source-provisioning.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function source(overrides = {}) {
  return {
    id: 1,
    sourceKey: "candidate-1-example",
    label: "Example",
    entityType: "ORGANIZATION",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/",
    config: {},
    enabled: false,
    cadenceMinutes: 10080,
    throttleMs: 0,
    timeoutMs: 8000,
    retryMaxAttempts: 0,
    retryBackoffMs: 1000,
    maxRecordsPerRun: 100,
    nextCheckAt: null,
    ...overrides,
  };
}

const officialHtml = `<!doctype html>
<html>
<head>
  <meta property="og:site_name" content="OZ Šťastná labka">
  <meta property="og:title" content="OZ Šťastná labka">
  <title>OZ Šťastná labka</title>
</head>
<body>
  <h1>OZ Šťastná labka</h1>
  <p>Občianske združenie pomáha opusteným psom a zabezpečuje adopcie.</p>
</body>
</html>`;

const ambiguousHtml = `<!doctype html>
<html>
<head><title>Zoznam útulkov a organizácií</title></head>
<body><h1>Zoznam útulkov a organizácií</h1><p>Útulky, organizácie a pomoc psom.</p></body>
</html>`;

const directoryHtml = `
<table>
  <tr><th>Mesto</th><th>Názov</th><th>Kraj</th><th>Forma</th></tr>
  <tr>
    <td>Nitra</td>
    <td><a href="https://labka.example/">OZ Labka</a></td>
    <td>Nitriansky</td><td>Občianske združenie</td>
  </tr>
  <tr>
    <td>Trnava</td>
    <td><a href="https://psik.example/">Pomoc psíkom</a></td>
    <td>Trnavský</td><td>Nezisková organizácia</td>
  </tr>
</table>`;

test("ORGANIZATION-INGEST-1 single official site creates exactly one stable base record", () => {
  const records = organizationOfficialSiteAdapter({
    html: officialHtml,
    source: source({ sourceUrl: "https://stastnalabka.example/" }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceRecordId, "site:https://stastnalabka.example/");
  assert.equal(records[0].sourceUrl, "https://stastnalabka.example/");
  assert.equal(records[0].proposed.name, "OZ Šťastná labka");
  assert.equal(records[0].proposed.websiteUrl, "https://stastnalabka.example/");
  assert.equal(records[0].rawRecord.identitySource, "page_metadata");
});

test("ORGANIZATION-INGEST-1 ambiguous single-site identity fails closed", () => {
  const records = organizationOfficialSiteAdapter({
    html: ambiguousHtml,
    source: source({ sourceUrl: "https://example.sk/" }),
  });
  assert.deepEqual(records, []);
});

test("ORGANIZATION-INGEST-1 known Psia duša directory emits one record per organization", () => {
  const records = psiadusaOrganizationDirectoryAdapter({
    html: directoryHtml,
    source: source({ sourceUrl: "https://www.psiadusa.sk/zoznam-utulkov/" }),
  });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.proposed.name), ["OZ Labka", "Pomoc psíkom"]);
  assert.equal(records[0].proposed.city, "Nitra");
  assert.equal(records[0].proposed.websiteUrl, "https://labka.example/");
  assert.notEqual(records[0].proposed.name, "Zoznam útulkov a organizácií");
});

test("ORGANIZATION-INGEST-1 existing generic approved ORGANIZATION source gets safe runtime adapter fallback", async () => {
  const records = await fetchAutomationSourceRecords(
    source({
      sourceUrl: "https://www.psiadusa.sk/zoznam-utulkov/",
      config: {},
    }),
    {
      htmlAdapters: productionAutomationHtmlAdapters,
      fetchImpl: async () => new Response(directoryHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      sleep: async () => {},
    },
  );
  assert.equal(records.length, 2);
});

test("ORGANIZATION-INGEST-1 unknown directory-looking URL remains fail closed", async () => {
  await assert.rejects(
    fetchAutomationSourceRecords(
      source({
        sourceUrl: "https://example.sk/zoznam-organizacii/",
        config: {},
      }),
      {
        htmlAdapters: productionAutomationHtmlAdapters,
        fetchImpl: async () => new Response(directoryHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
        sleep: async () => {},
      },
    ),
    (error) => error instanceof AutomationConnectorError
      && error.code === "controlled_html_adapter_not_configured",
  );
});

test("ORGANIZATION-INGEST-1 candidate provisioning config is conservative and entity-isolated", () => {
  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://www.psiadusa.sk/zoznam-utulkov/",
    metadata: {},
  }), { htmlAdapterKey: ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER });

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://stastnalabka.example/",
    metadata: {},
  }), { htmlAdapterKey: ORGANIZATION_OFFICIAL_SITE_ADAPTER });

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "ORGANIZATION",
    canonicalUrl: "https://example.sk/register/utulky/",
    metadata: {},
  }), {});

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/",
    metadata: { directoryCategory: "VETERINARIAN" },
  }), {
    staticFields: {
      category: "VETERINARIAN",
      semanticKind: "FACILITY_OR_SERVICE_PROFILE",
    },
  });

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "EVENT",
    canonicalUrl: "https://example.sk/",
    metadata: {},
  }), {});

  assert.equal(
    organizationHtmlAdapterKeyForSourceUrl("https://example.sk/zoznam-organizacii/"),
    null,
  );
});

test("ORGANIZATION-INGEST-1 existing configured adapters and EVENT adapters stay registered", () => {
  assert.equal(productionAutomationHtmlAdapters["svps-shelters-register"], svpsSheltersRegisterAdapter);
  assert.equal(typeof productionAutomationHtmlAdapters["skj-exhibition-calendar"], "function");
  assert.equal(typeof productionAutomationHtmlAdapters["agility-sk-events"], "function");
  assert.equal(typeof productionAutomationHtmlAdapters["zsk-sr-events"], "function");
  assert.equal(typeof productionAutomationHtmlAdapters["szpz-mushing-events"], "function");
  assert.equal(typeof productionAutomationHtmlAdapters[ORGANIZATION_OFFICIAL_SITE_ADAPTER], "function");
  assert.equal(typeof productionAutomationHtmlAdapters[ORGANIZATION_PSIADUSA_DIRECTORY_ADAPTER], "function");
});

test("ORGANIZATION-INGEST-1 preview remains read-only and provisioning uses the shared helper", () => {
  const preview = read("lib/data-automation-preview.ts");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(preview, /writes:\s*\{ observations: 0, findings: 0, canonical: 0, publications: 0 \}/);
  assert.match(store, /candidateProvisioningConfigFor\(/);
  assert.doesNotMatch(store, /UPDATE automation_sources SET enabled=1[\s\S]*reviewAutomationSourceCandidate/);
});
