import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectRelevantExistingSourceForCandidate } from "../lib/data-automation-source-matching.ts";
import { szpzMushingEventsAdapter } from "../lib/data-automation-real-sources.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function source(overrides = {}) {
  return {
    id: 7,
    entityType: "EVENT",
    sourceUrl: "https://mushing.sk/preteky/",
    connectorType: "CONTROLLED_HTML",
    config: { htmlAdapterKey: "szpz-mushing-events", expectedMinRecords: 1 },
    label: "SZPZ – kalendár pretekov psích záprahov",
    ...overrides,
  };
}

const candidate = {
  entityType: "EVENT",
  canonicalUrl: "https://mushing.sk/",
  sourceUrl: "https://mushing.sk/",
};

test("candidate homepage reuses the one existing same-domain EVENT source instead of creating a generic duplicate", () => {
  const existing = source();
  const selected = selectRelevantExistingSourceForCandidate(candidate, [existing]);
  assert.equal(selected?.id, existing.id);
  assert.equal(selected?.sourceUrl, "https://mushing.sk/preteky/");
});

test("existing-source detection respects entity type", () => {
  const selected = selectRelevantExistingSourceForCandidate(candidate, [
    source({ id: 9, entityType: "DIRECTORY" }),
  ]);
  assert.equal(selected, null);
});

test("known adapter and source config are reused intact", () => {
  const existing = source();
  const selected = selectRelevantExistingSourceForCandidate(candidate, [existing]);
  assert.equal(selected?.connectorType, "CONTROLLED_HTML");
  assert.equal(selected?.config.htmlAdapterKey, "szpz-mushing-events");

  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /duplicateSourceId = relevantSource\.id/);
  assert.match(store, /Reuse the complete existing source, including a known adapter\/config/);
});

test("ambiguous or unknown same-domain candidate stays on safe pending provisioning path", () => {
  assert.equal(selectRelevantExistingSourceForCandidate(candidate, []), null);
  assert.equal(selectRelevantExistingSourceForCandidate(candidate, [
    source({ id: 1, sourceUrl: "https://mushing.sk/preteky/" }),
    source({ id: 2, sourceUrl: "https://mushing.sk/ine-podujatia/" }),
  ]), null);

  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /VALUES \(\?,\?,\?,\?,\?,'\{\}',0,1440/);
  assert.match(store, /'PENDING'/);
});

test("candidate approval performs only a safe read-only test and never enables or publishes", () => {
  const route = read("app/api/admin/automation-source-candidates/[id]/route.ts");
  const preview = read("lib/data-automation-preview.ts");
  assert.match(route, /sourceReadyForSafeTest/);
  assert.match(route, /previewAutomationSource/);
  assert.doesNotMatch(route, /setAutomationSourceEnabled|enabled\s*=\s*1|publish/i);
  assert.match(preview, /writes: \{ observations: 0, findings: 0, canonical: 0, publications: 0 \}/);
});

test("candidate review explains existing source and keeps technical details under Advanced", () => {
  const component = read("components/admin-automation-candidate-review.tsx");
  assert.match(component, /Tento web už máme ako zdroj/);
  assert.match(component, /Zdroj funguje/);
  assert.match(component, /Zdroj potrebuje technické nastavenie/);
  assert.match(component, /Pokročilé \/ technické údaje/);
});

test("source governance remains explicit and fail-closed but is secondary in the primary UX", () => {
  const component = read("components/admin-automation-source-detail.tsx");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(component, /Pokročilé — governance a pravidlá sledovania/);
  assert.match(component, /Zdroj potrebuje schválenie pravidelného sledovania/);
  assert.match(component, /disabled=\{busy \|\| !governanceEvaluation\.allowed\}/);
  assert.match(store, /automation_source_governance_blocked/);
  assert.doesNotMatch(component, /silent approval/i);
});

test("ready EVENT concept renders merged editorial fields and routes decisions through the existing review flow", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /Pripravený koncept podujatia/);
  assert.match(page, /finding\.findingType === "NEW_ENTITY"/);
  for (const label of ["Názov", "Dátum začiatku", "Dátum konca", "Miesto", "Obec \/ mesto", "Organizátor", "Registrácia", "Web podujatia", "Zdroj"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/admin\/operations\/automation\//);
  assert.match(page, />Upraviť<\/Link>/);
  assert.match(page, />Zverejniť<\/Link>/);
  assert.match(page, />Zamietnuť<\/Link>/);
  assert.match(page, /public publication zostáva manuálna/);
});

test("existing canonical EVENT renders change-review variant instead of a new-record concept", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  assert.match(page, /Navrhovaná zmena/);
  assert.match(page, /cluster\.canonicalEntityId/);
  assert.match(page, /Object\.entries\(findingDetail\.diff\)/);
  assert.match(page, /change\.before/);
  assert.match(page, /change\.after/);
});

test("cluster, observations, evidence and finding internals remain available only under Advanced after the editorial card", () => {
  const page = read("app/admin/automatizacie/[category]/cluster/[id]/page.tsx");
  const concept = page.indexOf("Pripravený koncept podujatia");
  const advanced = page.indexOf("<summary>Pokročilé</summary>");
  const observations = page.indexOf("<strong>Observations</strong>");
  assert.ok(concept >= 0 && advanced > concept && observations > advanced);
  assert.match(page, /evidence rows/);
  assert.match(page, /<h2>Findings<\/h2>/);
});

test("Bosorkin master calendar date remains authoritative even when the detail page contains another date-like field", async () => {
  const masterHtml = `
    <table>
      <tr>
        <td>26.09.2026</td>
        <td><a href="/pretek/bosorkin-canicross-2-jarne-kolo-2026/">Bosorkin canicross</a></td>
        <td>Košice</td>
      </tr>
    </table>`;
  const detailHtml = `
    <table>
      <tr><td>Usporiadateľ</td><td>SHT Haniska</td></tr>
      <tr><td>Miesto pretekov</td><td>Košice – Furčiansky lesopark</td></tr>
      <tr><td>Historický termín</td><td>11.04.2026</td></tr>
    </table>`;

  const records = await szpzMushingEventsAdapter({
    html: masterHtml,
    source: {
      id: 7,
      sourceKey: "szpz-mushing-events",
      label: "SZPZ – kalendár pretekov psích záprahov",
      entityType: "EVENT",
      connectorType: "CONTROLLED_HTML",
      sourceUrl: "https://mushing.sk/preteky/",
      config: { htmlAdapterKey: "szpz-mushing-events", expectedMinRecords: 1 },
      enabled: false,
      cadenceMinutes: 360,
      throttleMs: 1000,
      timeoutMs: 8000,
      retryMaxAttempts: 2,
      retryBackoffMs: 1000,
      maxRecordsPerRun: 100,
      nextCheckAt: null,
      reviewStatus: "APPROVED",
    },
    fetchHtml: async (url) => ({ html: detailHtml, finalUrl: url }),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].proposed.title, "Bosorkin canicross");
  assert.equal(records[0].proposed.startDate, "2026-09-26");
  assert.equal(records[0].proposed.endDate, "2026-09-26");
  assert.equal(records[0].proposed.organizer, "SHT Haniska");
  assert.equal(records[0].proposed.venue, "Košice – Furčiansky lesopark");
});
