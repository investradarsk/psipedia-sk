import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationEntityEnrichmentTemplate,
  automationEntityEnrichmentTemplates,
} from "../lib/data-automation-enrichment-template.ts";
import {
  automationEnrichmentCompleteness,
  normalizeAutomationEnrichmentProposal,
} from "../lib/data-automation-enrichment-normalize.ts";
import {
  automationEnrichmentIdentityMatches,
  automationEnrichmentSearchPlans,
  mergeAutomationEnrichmentEvidence,
} from "../lib/data-automation-enrichment-evidence.ts";
import { enrichAutomationRecordSchemaFirst } from "../lib/data-automation-entity-enrichment.ts";
import { fetchAutomationSourceRecords } from "../lib/data-automation-connectors.ts";
import { productionAutomationHtmlAdapters } from "../lib/data-automation-real-sources.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function source(overrides = {}) {
  return {
    id: 1,
    sourceKey: "entity-enrichment-test",
    label: "Entity enrichment test",
    entityType: "DIRECTORY",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.sk/",
    config: {
      htmlAdapterKey: "generic-directory-profile",
      staticFields: { category: "veterinari" },
    },
    enabled: false,
    cadenceMinutes: 10080,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 20,
    nextCheckAt: null,
    reviewStatus: "APPROVED",
    ...overrides,
  };
}

function allowedCanonicalFields(entityType) {
  const apply = read("lib/data-automation-apply.ts");
  const order = ["EVENT","ORGANIZATION","HELP_ITEM","ADOPTION","FOSTER","LOST_FOUND","DIRECTORY"];
  const start = apply.indexOf("  " + entityType + ": {");
  assert.ok(start >= 0, "missing apply config for " + entityType);
  const later = order
    .map((type) => apply.indexOf("  " + type + ": {", start + 1))
    .filter((value) => value > start);
  const end = later.length ? Math.min(...later) : apply.indexOf("\n};", start);
  const block = apply.slice(start, end);
  const allowed = new Set(
    [...block.matchAll(/^\s{6}([A-Za-z_][A-Za-z0-9_]*):\s*(?:field|numberField|bool|jsonField)\(/gm)]
      .map((match) => match[1]),
  );
  const metadata = block.match(/metadataFields:\s*\[([^\]]*)\]/)?.[1] ?? "";
  for (const match of metadata.matchAll(/"([^"]+)"/g)) allowed.add(match[1]);
  return allowed;
}

test("AUTOMATION-ENTITY-ENRICHMENT-2 registry covers every current automation entity with canonical-only fields", () => {
  const entityTypes = ["EVENT","ORGANIZATION","HELP_ITEM","ADOPTION","FOSTER","LOST_FOUND","DIRECTORY"];
  assert.deepEqual(Object.keys(automationEntityEnrichmentTemplates).sort(), entityTypes.sort());

  for (const entityType of entityTypes) {
    const template = automationEntityEnrichmentTemplate(entityType);
    assert.equal(template.entityType, entityType);
    const allowed = allowedCanonicalFields(entityType);
    for (const field of Object.values(template.fields)) {
      assert.ok(allowed.has(field.canonicalField), entityType + " unsupported field " + field.canonicalField);
      assert.ok(["IDENTITY","HIGH_VALUE","OPTIONAL"].includes(field.priority));
    }
  }
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 completeness finds missing high-value contact fields", () => {
  const result = automationEnrichmentCompleteness("ORGANIZATION", {
    name: "Útulok ABC",
    websiteUrl: "https://utulok.example/",
  });
  assert.equal(result.completeForDraft, true);
  assert.ok(result.missingHighValue.includes("publicPhone"));
  assert.ok(result.missingHighValue.includes("publicEmail"));
  assert.ok(result.missingEnrichable.includes("publicPhone"));
  assert.ok(result.missingEnrichable.includes("publicEmail"));
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 central normalization strips wrappers and rejects unsafe social roots", () => {
  const normalized = normalizeAutomationEnrichmentProposal("DIRECTORY", {
    name: "  Veterina ABC  ",
    category: "veterinari",
    publicEmail: "mailto:INFO@EXAMPLE.SK?subject=hello",
    publicPhone: "tel:+421 900 111 222",
    facebookUrl: "https://facebook.com/",
    instagramUrl: "https://instagram.com/accounts/login/",
    description: "<p>Explicitný <strong>opis</strong>.</p><script>alert(1)</script>",
  });
  assert.equal(normalized.name, "Veterina ABC");
  assert.equal(normalized.publicEmail, "info@example.sk");
  assert.equal(normalized.publicPhone, "+421900111222");
  assert.equal(Object.hasOwn(normalized, "facebookUrl"), false);
  assert.equal(Object.hasOwn(normalized, "instagramUrl"), false);
  assert.equal(normalized.description, "Explicitný opis.");
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 complete high-value DIRECTORY does not spend targeted search for optional fields", () => {
  const plans = automationEnrichmentSearchPlans({
    entityType: "DIRECTORY",
    sourceUrl: "https://vet.example/",
    proposed: {
      name: "Vet ABC",
      category: "veterinari",
      websiteUrl: "https://vet.example/",
      publicPhone: "+421 900 111 222",
      publicEmail: "info@vet.example",
      description: "Explicitný opis veterinárneho pracoviska.",
      city: "Nitra",
      district: "Nitra",
      region: "Nitriansky kraj",
      address: "Hlavná 1, Nitra",
      postalCode: "949 01",
      street: "Hlavná",
      houseNumber: "1",
      addressFormat: "STREET",
    },
  });
  assert.deepEqual(plans, []);
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 groups phone email and social discovery into one contact request", () => {
  const plans = automationEnrichmentSearchPlans({
    entityType: "ORGANIZATION",
    sourceUrl: "https://utulok.example/",
    proposed: { name: "Útulok ABC", websiteUrl: "https://utulok.example/" },
  });
  const contact = plans.filter((plan) => plan.group === "CONTACT");
  assert.equal(contact.length, 1);
  assert.match(contact[0].query, /site:utulok\.example/);
  assert.ok(contact[0].missingFields.includes("publicPhone"));
  assert.ok(contact[0].missingFields.includes("publicEmail"));
  assert.ok(contact[0].missingFields.includes("facebookUrl"));
  assert.ok(contact[0].missingFields.includes("instagramUrl"));
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 identity gate rejects a different company and accepts same official domain", () => {
  const proposed = { name: "Vet ABC", city: "Nitra", websiteUrl: "https://vetabc.sk/" };
  assert.equal(automationEnrichmentIdentityMatches({
    entityType: "DIRECTORY",
    proposed,
    sourceUrl: "https://vetabc.sk/",
    result: { url: "https://vetxyz.sk/kontakt", title: "Vet XYZ Bratislava", snippet: "Kontakt", rank: 0 },
  }), false);
  assert.equal(automationEnrichmentIdentityMatches({
    entityType: "DIRECTORY",
    proposed,
    sourceUrl: "https://vetabc.sk/",
    result: { url: "https://vetabc.sk/kontakt", title: "Kontakt", snippet: "Vet ABC Nitra", rank: 0 },
  }), true);
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 stronger first-party evidence wins and conflicting weaker evidence is flagged", () => {
  const first = mergeAutomationEnrichmentEvidence({
    entityType: "ORGANIZATION",
    base: { name: "Útulok ABC" },
    incoming: { publicPhone: "+421 900 111 111" },
    evidenceType: "FIRST_PARTY_PAGE",
    sourceUrl: "https://utulok.example/kontakt",
  });
  const weaker = mergeAutomationEnrichmentEvidence({
    entityType: "ORGANIZATION",
    base: first.proposed,
    incoming: { publicPhone: "+421 900 222 222" },
    evidenceType: "SEARCH_SNIPPET",
    sourceUrl: "https://directory.example/utulok-abc",
    existingEvidence: first.evidence,
  });
  assert.equal(weaker.proposed.publicPhone, "+421900111111");
  assert.ok(weaker.conflicts.includes("publicPhone"));
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 targeted search failure is best-effort and preserves a valid primary record", async () => {
  const record = {
    sourceRecordId: "site:https://utulok.example/",
    sourceUrl: "https://utulok.example/",
    sourceTimestamp: null,
    rawRecord: { name: "Útulok ABC" },
    proposed: { name: "Útulok ABC", websiteUrl: "https://utulok.example/" },
  };
  const enriched = await enrichAutomationRecordSchemaFirst({
    entityType: "ORGANIZATION",
    record,
    targetedSearch: async () => {
      throw new Error("mock_timeout");
    },
  });
  assert.equal(enriched.proposed.name, "Útulok ABC");
  assert.equal(enriched.proposed.websiteUrl, "https://utulok.example/");
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 production DIRECTORY follows bounded semantic same-domain pages through controlled fetch", async () => {
  const home = `<!doctype html><html><head>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"VeterinaryCare",
      "@id":"https://example.sk/",
      "url":"https://example.sk/",
      "name":"Vet ABC"
    }</script>
  </head><body>
    <a href="/kontakt">Kontakt</a>
    <a href="/o-nas">O nás</a>
    <a href="/blog">Blog</a>
  </body></html>`;
  const contact = `<!doctype html><html><head><meta name="description" content="Veterinárna ambulancia pre spoločenské zvieratá."></head><body>
    <section class="kontakt">
      <p>Telefón: <a href="tel:+421900111222">+421 900 111 222</a></p>
      <p>E-mail: <a href="mailto:info@example.sk">info@example.sk</a></p>
      <p>Adresa: Hlavná 1<br>949 01 Nitra</p>
      <a href="https://facebook.com/vetabc">Facebook</a>
    </section>
  </body></html>`;
  const about = `<!doctype html><html><body><p>O nás</p></body></html>`;
  const calls = [];
  const records = await fetchAutomationSourceRecords(source(), {
    htmlAdapters: productionAutomationHtmlAdapters,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      if (parsed.pathname === "/kontakt") return new Response(contact, { status: 200, headers: { "content-type": "text/html" } });
      if (parsed.pathname === "/o-nas") return new Response(about, { status: 200, headers: { "content-type": "text/html" } });
      return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
    },
    sleep: async () => {},
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].proposed.publicPhone, "+421 900 111 222");
  assert.equal(records[0].proposed.publicEmail, "info@example.sk");
  assert.equal(records[0].proposed.facebookUrl, "https://facebook.com/vetabc");
  assert.equal(records[0].proposed.description, "Veterinárna ambulancia pre spoločenské zvieratá.");
  assert.ok(calls.includes("/kontakt"));
  assert.ok(calls.includes("/o-nas"));
  assert.equal(calls.includes("/blog"), false);
  assert.ok(calls.length <= 4, "primary + at most three bounded follow-up fetches");
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 dedicated search budget family stays separate from discovery counters", () => {
  const store = read("lib/data-automation-discovery-store.ts");
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(store, /reserveAutomationEntityEnrichmentRequest/);
  assert.match(store, /operation_key LIKE 'entity-enrichment:%'/);
  assert.match(store, /operation_key NOT LIKE 'entity-enrichment:%'/);
  assert.match(runner, /entity-enrichment:\$\{dayBucket\}/);
  assert.match(runner, /entityEnrichmentRequestsPerRun/);
  assert.match(runner, /reserveAutomationEntityEnrichmentRequest/);
});

test("AUTOMATION-ENTITY-ENRICHMENT-2 preserves exact-address ownership and no-generated-description invariant", () => {
  const direct = read("lib/data-automation-direct-entity.ts");
  const organization = read("lib/data-automation-organization-enrichment.ts");
  const evidence = read("lib/data-automation-enrichment-evidence.ts");
  assert.match(direct, /enrichAutomationRecordSchemaFirst[\s\S]*enrichDirectoryProposalWithExactAddress/);
  assert.match(evidence, /DIRECTORY" && field\.group === "LOCATION"/);
  assert.doesNotMatch(organization, /generatedDescription/);
  assert.match(organization, /description: description\?\.slice\(0, 5000\)/);
});
