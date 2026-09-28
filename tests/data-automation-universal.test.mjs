import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  automationSourceReadiness,
  buildAutomationCapabilityRegistry,
  productionAutomationCapabilityRegistry,
  resolveAutomationCapability,
} from "../lib/data-automation-capability-registry.ts";
import {
  genericDirectoryProfileAdapter,
  genericHelpItemPageAdapter,
  productionAutomationHtmlAdapters,
} from "../lib/data-automation-real-sources.ts";
import {
  candidateProvisioningConfigFor,
  qualifiedClubDirectoryCategory,
  SUPPORTED_DIRECTORY_CATEGORIES,
} from "../lib/data-automation-source-provisioning.ts";
import { universalAutomationDiscoveryRootPresets } from "../lib/data-automation-source-presets.ts";
import { createCanonicalDraft } from "../lib/canonical-draft-service.ts";
import { mapAutomationFindingToDraftInput } from "../lib/data-automation-draft-mapper.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const applySource = read("lib/data-automation-apply.ts");

function canonicalSafeProposal(entityType, proposed) {
  const nextEntity = entityType === "DIRECTORY" ? "ADOPTION" : entityType === "HELP_ITEM" ? "LOST_FOUND" : null;
  const start = applySource.indexOf("  " + entityType + ": {");
  const end = nextEntity ? applySource.indexOf("  " + nextEntity + ": {", start + 1) : -1;
  assert.ok(start >= 0 && end > start, "missing apply config for " + entityType);
  const block = applySource.slice(start, end);
  const allowed = new Set(
    [...block.matchAll(/^\s{6}([A-Za-z_][A-Za-z0-9_]*):\s*(?:field|numberField|bool|jsonField)\(/gm)]
      .map((match) => match[1]),
  );
  const metadataMatch = block.match(/metadataFields:\s*\[([^\]]*)\]/);
  if (metadataMatch) {
    for (const match of metadataMatch[1].matchAll(/"([^"]+)"/g)) allowed.add(match[1]);
  }
  return Object.keys(proposed).filter((key) => !allowed.has(key));
}

function source(entityType, config, sourceUrl = "https://example.sk/sluzba") {
  return {
    id: 1,
    sourceKey: "test-source",
    label: "Test",
    entityType,
    connectorType: "CONTROLLED_HTML",
    sourceUrl,
    config,
    enabled: false,
    cadenceMinutes: 1440,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 20,
    nextCheckAt: null,
  };
}

function jsonLdPage(node, extra = "") {
  return `<!doctype html><html><head>${extra}<script type="application/ld+json">${JSON.stringify(node)}</script></head><body><h1>${node.name ?? "Profil"}</h1></body></html>`;
}

const spektraVetLikeFixture = read("tests/fixtures/data-automation/spektravet-like-directory.html");


class DirectoryDraftMemoryStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async first() {
    const match = this.sql.match(/^INSERT INTO directory_profiles \((.+)\) VALUES \((.+)\) RETURNING id$/);
    if (!match) throw new Error("Unhandled DIRECTORY draft SQL: " + this.sql);
    const columns = match[1].split(",").map((value) => value.trim());
    assert.equal(columns.length, this.args.length);
    const row = { id: this.database.nextId++ };
    for (let index = 0; index < columns.length; index += 1) row[columns[index]] = this.args[index];
    this.database.rows.push(row);
    return { id: row.id };
  }
}

class DirectoryDraftMemoryD1 {
  constructor() {
    this.rows = [];
    this.nextId = 1;
  }
  prepare(sql) {
    return new DirectoryDraftMemoryStatement(this, sql);
  }
}

test("universal registry exposes every production parser through one capability facade", () => {
  const keys = Object.keys(productionAutomationCapabilityRegistry).sort();
  assert.deepEqual(keys, Object.keys(productionAutomationHtmlAdapters).sort());
  for (const key of keys) {
    const capability = productionAutomationCapabilityRegistry[key];
    assert.equal(capability.adapterKey, key);
    assert.equal(capability.productionReady, true);
    assert.equal(typeof capability.parser, "function");
    assert.ok(capability.entityType);
    assert.ok(capability.sourceShape);
  }
});

test("registry rejects duplicate keys and missing parsers", () => {
  const parser = () => [];
  assert.throws(() => buildAutomationCapabilityRegistry([
    { adapterKey: "same", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "A" },
    { adapterKey: "same", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "B" },
  ], { same: parser }), /duplicate_automation_adapter_key/);
  assert.throws(() => buildAutomationCapabilityRegistry([
    { adapterKey: "missing", entityType: "EVENT", sourceShape: "SINGLE_ITEM", label: "A" },
  ], {}), /automation_adapter_parser_missing/);
});

test("universal readiness fails closed on unsupported and mismatched adapters", () => {
  assert.equal(automationSourceReadiness(source("DIRECTORY", {})).reason, "MISSING_ADAPTER");
  assert.equal(automationSourceReadiness(source("DIRECTORY", { htmlAdapterKey: "missing" })).reason, "UNSUPPORTED_ADAPTER");
  assert.equal(automationSourceReadiness(source("EVENT", {
    htmlAdapterKey: "generic-directory-profile",
    sourceShape: "SINGLE_ITEM",
  })).reason, "ADAPTER_ENTITY_MISMATCH");
  assert.equal(resolveAutomationCapability(source("DIRECTORY", {
    htmlAdapterKey: "generic-directory-profile",
    sourceShape: "MULTI_ITEM_LIST",
  })), null);

  const legacyAgility = source("EVENT", {}, "https://agility.sk/preteky/");
  const legacyReadiness = automationSourceReadiness(legacyAgility);
  assert.equal(legacyReadiness.ready, true);
  assert.equal(legacyReadiness.reason, "READY");
  assert.equal(legacyReadiness.adapterKey, "agility-sk-events");
  assert.equal(resolveAutomationCapability(legacyAgility)?.adapterKey, "agility-sk-events");

  const conflictingAgility = source("EVENT", {
    htmlAdapterKey: "zsk-sr-events",
    sourceShape: "MULTI_ITEM_LIST",
  }, "https://agility.sk/preteky/");
  assert.equal(automationSourceReadiness(conflictingAgility).reason, "ADAPTER_SOURCE_MISMATCH");
  assert.equal(resolveAutomationCapability(conflictingAgility), null);
});

test("known EVENT master URLs use an exact production provisioning allowlist", () => {
  const cases = [
    ["https://skj.sk/sk/vystavy/kalendar/", "skj-exhibition-calendar", undefined],
    ["https://www.agility.sk/preteky/", "agility-sk-events", 1],
    ["https://zsksr.sk/kalendar/", "zsk-sr-events", 1],
    ["https://mushing.sk/preteky/", "szpz-mushing-events", 1],
  ];
  for (const [canonicalUrl, htmlAdapterKey, expectedMinRecords] of cases) {
    const config = candidateProvisioningConfigFor({ entityType: "EVENT", canonicalUrl, metadata: {} });
    assert.equal(config.htmlAdapterKey, htmlAdapterKey, canonicalUrl);
    assert.equal(config.sourceShape, "MULTI_ITEM_LIST", canonicalUrl);
    assert.equal(config.expectedMinRecords, expectedMinRecords, canonicalUrl);
  }

  for (const canonicalUrl of [
    "https://agility.sk/preteky/detail",
    "https://agility.sk/preteky?page=2",
    "https://events.example.sk/preteky",
    "https://mushing.sk/pretek/example-event",
  ]) {
    assert.deepEqual(
      candidateProvisioningConfigFor({ entityType: "EVENT", canonicalUrl, metadata: {} }),
      {},
      canonicalUrl,
    );
  }
});

test("FOSTER and LOST_FOUND supported URL families are provisioned automatically", () => {
  assert.equal(candidateProvisioningConfigFor({
    entityType: "FOSTER",
    canonicalUrl: "https://www.zatulanepsikysala.sk/pomoc/markyz/",
    metadata: {},
  }).htmlAdapterKey, "zatulane-psiky-sala-foster-detail");
  assert.equal(candidateProvisioningConfigFor({
    entityType: "LOST_FOUND",
    canonicalUrl: "https://www.kosice.sk/clanok/opusteny-pes-225",
    metadata: {},
  }).htmlAdapterKey, "kosice-found-dog-detail");
});

test("DIRECTORY category is explicit and survives into generic parser output", () => {
  for (const category of SUPPORTED_DIRECTORY_CATEGORIES) {
    const config = candidateProvisioningConfigFor({
      entityType: "DIRECTORY",
      canonicalUrl: "https://example.sk/sluzba",
      metadata: { directoryCategory: category },
    });
    assert.equal(config.htmlAdapterKey, "generic-directory-profile");
    const records = genericDirectoryProfileAdapter({
      source: source("DIRECTORY", config),
      html: jsonLdPage({
        "@context": "https://schema.org",
        "@type": category === "veterinari" ? "VeterinaryCare" : "LocalBusiness",
        "@id": "https://example.sk/sluzba",
        url: "https://example.sk/sluzba",
        name: "Explicitná služba",
        description: "Explicitný popis služby.",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Hlavná 1",
          postalCode: "949 01",
          addressLocality: "Nitra",
          addressRegion: "Nitriansky kraj",
        },
      }),
    });
    assert.equal(records.length, 1, category);
    assert.equal(records[0].proposed.category, category);
    assert.equal(records[0].proposed.name, "Explicitná služba");
    assert.equal(records[0].proposed.city, "Nitra");
    assert.equal(records[0].proposed.region, "Nitriansky kraj");
    assert.deepEqual(canonicalSafeProposal("DIRECTORY", records[0].proposed), [], category);
  }
});

test("HOTFIX DIRECTORY parser enriches a SpektraVet-like page from bounded same-page evidence", () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://spektravet.sk/sk",
    metadata: { directoryCategory: "veterinari" },
  });
  const records = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config, "https://spektravet.sk/sk"),
    html: spektraVetLikeFixture,
  });
  assert.equal(records.length, 1);
  const proposed = records[0].proposed;
  assert.equal(proposed.name, "SpektraVet – Bratislava Ružinov");
  assert.equal(proposed.category, "veterinari");
  assert.equal(proposed.semanticKind, "FACILITY_OR_SERVICE_PROFILE");
  assert.equal(proposed.websiteUrl, "https://spektravet.sk/sk");
  assert.equal(proposed.publicPhone, "+421 903 494 000");
  assert.equal(proposed.publicEmail, "info@spektravet.sk");
  assert.equal(proposed.description, "Veterinárna klinika pre spoločenské zvieratá v Bratislave - Ružinove.");
  assert.equal(proposed.address, "Ružinovská 1/4814, 82102 Bratislava - Ružinov");
  assert.equal(proposed.city, "Bratislava - Ružinov");
  assert.equal(proposed.postalCode, "82102");
  assert.equal(proposed.street, "Ružinovská");
  assert.equal(proposed.houseNumber, "1/4814");
  assert.equal(proposed.addressFormat, "STREET");
  assert.equal(Object.hasOwn(proposed, "region"), false);
  assert.equal(Object.hasOwn(proposed, "district"), false);
  assert.equal(Object.hasOwn(proposed, "services"), false);
  assert.equal(Object.hasOwn(proposed, "qualifications"), false);
  assert.equal(Object.hasOwn(proposed, "verified"), false);
  assert.doesNotMatch(proposed.description, /otváracie|08:00/i);
  assert.deepEqual(canonicalSafeProposal("DIRECTORY", proposed), []);
});

test("HOTFIX DIRECTORY structured schema stays authoritative for contacts, socials and safe lists", () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/clinic",
    metadata: { directoryCategory: "veterinari" },
  });
  const html = jsonLdPage({
    "@context": "https://schema.org",
    "@type": "VeterinaryCare",
    "@id": "https://example.sk/clinic",
    url: "https://example.sk/clinic",
    name: "Explicitná klinika",
    description: "Explicitný JSON-LD opis.",
    telephone: "+421 2 555 123 45",
    email: "kontakt@example.sk",
    sameAs: [
      "https://www.facebook.com/explicitna-klinika/",
      "https://www.instagram.com/explicitna-klinika/",
    ],
    serviceType: ["Veterinárna ambulancia"],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Preventívna prehliadka" } },
      ],
    },
    hasCredential: [{ "@type": "EducationalOccupationalCredential", name: "Certifikované pracovisko" }],
    address: {
      "@type": "PostalAddress",
      streetAddress: "Hlavná 12",
      postalCode: "949 01",
      addressLocality: "Nitra",
      addressRegion: "Nitriansky kraj",
    },
  }, '<meta name="description" content="Tento fallback nesmie prepísať JSON-LD.">');
  const [record] = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config, "https://example.sk/clinic"),
    html,
  });
  assert.ok(record);
  assert.equal(record.proposed.description, "Explicitný JSON-LD opis.");
  assert.equal(record.proposed.publicPhone, "+421 2 555 123 45");
  assert.equal(record.proposed.publicEmail, "kontakt@example.sk");
  assert.equal(record.proposed.facebookUrl, "https://facebook.com/explicitna-klinika");
  assert.equal(record.proposed.instagramUrl, "https://instagram.com/explicitna-klinika");
  assert.deepEqual(record.proposed.services, ["Veterinárna ambulancia", "Preventívna prehliadka"]);
  assert.deepEqual(record.proposed.qualifications, ["Certifikované pracovisko"]);
  assert.equal(record.proposed.city, "Nitra");
  assert.equal(record.proposed.region, "Nitriansky kraj");
  assert.equal(record.proposed.postalCode, "949 01");
  assert.equal(record.proposed.street, "Hlavná");
  assert.equal(record.proposed.houseNumber, "12");
  assert.deepEqual(canonicalSafeProposal("DIRECTORY", record.proposed), []);
});

test("HOTFIX DIRECTORY conflicting same-page contact candidates fail closed per field", () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/profile",
    metadata: { directoryCategory: "treneri" },
  });
  const html = jsonLdPage({
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": "https://example.sk/profile",
    url: "https://example.sk/profile",
    name: "Tréningová služba",
  }).replace("</body>", [
    '<section class="kontakt"><p>Telefón: <a href="tel:+421900111111">+421 900 111 111</a></p></section>',
    '<section class="contact"><p>Tel: <a href="tel:+421900222222">+421 900 222 222</a></p></section>',
    "</body>",
  ].join(""));
  const [record] = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config, "https://example.sk/profile"),
    html,
  });
  assert.ok(record);
  assert.equal(Object.hasOwn(record.proposed, "publicPhone"), false);
});

test("HOTFIX DIRECTORY parser-to-canonical-draft preserves contacts and keeps source address unconfirmed", async () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://spektravet.sk/sk",
    metadata: { directoryCategory: "veterinari" },
  });
  const [record] = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config, "https://spektravet.sk/sk"),
    html: spektraVetLikeFixture,
  });
  assert.ok(record);
  assert.deepEqual(canonicalSafeProposal("DIRECTORY", record.proposed), []);

  const finding = {
    entityType: "DIRECTORY",
    findingType: "NEW_ENTITY",
    proposed: record.proposed,
    sourceUrl: record.sourceUrl,
  };
  const input = mapAutomationFindingToDraftInput(finding, "2026-09-28T09:30:00.000Z");
  assert.equal(input.data.serviceAddressConfirmation, "LEGACY_UNCONFIRMED");

  const database = new DirectoryDraftMemoryD1();
  const created = await createCanonicalDraft(
    input,
    { actor: "automation-test@psipedia.sk", createdAt: "2026-09-28T09:30:00.000Z" },
    database,
  );
  assert.equal(created.canonicalEntityId, 1);
  assert.equal(database.rows.length, 1);
  const row = database.rows[0];
  assert.equal(row.status, "draft");
  assert.equal(row.name, "SpektraVet – Bratislava Ružinov");
  assert.equal(row.category, "veterinari");
  assert.equal(row.website_url, "https://spektravet.sk/sk");
  assert.equal(row.description, "Veterinárna klinika pre spoločenské zvieratá v Bratislave - Ružinove.");
  assert.equal(row.city, "Bratislava - Ružinov");
  assert.equal(row.postal_code, "82102");
  assert.equal(row.street, "Ružinovská");
  assert.equal(row.house_number, "1/4814");
  assert.equal(row.address_format, "STREET");
  assert.equal(row.service_address_confirmation, "LEGACY_UNCONFIRMED");
  assert.equal(row.published_at, null);

  const importData = JSON.parse(row.source_data_json);
  assert.deepEqual(readDirectoryPublicContacts(importData, row.website_url), {
    phone: "+421 903 494 000",
    email: "info@spektravet.sk",
    website: "https://spektravet.sk/sk",
    facebook: "",
    instagram: "",
  });
  assert.equal(importData["Telefón"], "+421 903 494 000");
  assert.equal(importData["E-mail"], "info@spektravet.sk");
  assert.equal(importData.Web, "https://spektravet.sk/sk");
});

test("generic DIRECTORY parser extracts only explicit schema data and fails closed", () => {
  const config = candidateProvisioningConfigFor({
    entityType: "DIRECTORY",
    canonicalUrl: "https://example.sk/sluzba",
    metadata: { directoryCategory: "veterinari" },
  });
  const noAddress = genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: jsonLdPage({
      "@context": "https://schema.org",
      "@type": "VeterinaryCare",
      name: "Vet bez adresy",
      parentOrganization: {
        name: "Firma s.r.o.",
        address: { streetAddress: "Sídlo 99", addressLocality: "Bratislava" },
      },
    }),
  });
  assert.equal(noAddress.length, 1);
  assert.equal(Object.hasOwn(noAddress[0].proposed, "address"), false);
  assert.equal(Object.hasOwn(noAddress[0].proposed, "city"), false);

  assert.deepEqual(genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: "<html><body><h1>Vet text only</h1><p>Hlavná 1, Nitra</p></body></html>",
  }), []);

  const ambiguous = jsonLdPage({
    "@context": "https://schema.org", "@type": "LocalBusiness", name: "A",
  }).replace("</head>", `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "LocalBusiness", name: "B",
  })}</script></head>`);
  assert.deepEqual(genericDirectoryProfileAdapter({
    source: source("DIRECTORY", config),
    html: ambiguous,
  }), []);
});

test("club classification never guesses between kynological and breeder clubs", () => {
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "kynologicke-kluby" }), "kynologicke-kluby");
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "chovatelske-kluby" }), "chovatelske-kluby");
  assert.equal(qualifiedClubDirectoryCategory({ title: "Slovenský klub retrieverov" }), null);
  assert.equal(qualifiedClubDirectoryCategory({ directoryCategory: "treneri" }), null);
});

test("HELP_ITEM Zbierky and Ako pomôcť use explicit canonical category metadata", () => {
  for (const category of ["zbierky", "dobrovolnictvo"]) {
    const config = candidateProvisioningConfigFor({
      entityType: "HELP_ITEM",
      canonicalUrl: "https://example.sk/pomoc",
      metadata: { helpCategory: category },
    });
    assert.equal(config.htmlAdapterKey, "generic-help-item-page");
    const description = category === "zbierky"
      ? "Transparentná zbierka na veterinárnu pomoc psom."
      : "Hľadáme dobrovoľníkov na venčenie a prevoz psov.";
    const records = genericHelpItemPageAdapter({
      source: source("HELP_ITEM", config, "https://example.sk/pomoc"),
      html: `<html><head><meta name="description" content="${description}"></head><body><h1>Pomôžte nám</h1></body></html>`,
    });
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].proposed, {
      title: "Pomôžte nám",
      category,
      description,
      actionUrl: "https://example.sk/pomoc",
    });
    assert.deepEqual(canonicalSafeProposal("HELP_ITEM", records[0].proposed), [], category);
  }
  assert.deepEqual(genericHelpItemPageAdapter({
    source: source("HELP_ITEM", {
      sourceShape: "SINGLE_ITEM",
      htmlAdapterKey: "generic-help-item-page",
      staticFields: { category: "zbierky" },
    }, "https://example.sk/pomoc"),
    html: '<html><head><meta name="description" content="Všeobecné informácie o organizácii."></head><body><h1>O nás</h1></body></html>',
  }), []);

  assert.deepEqual(candidateProvisioningConfigFor({
    entityType: "HELP_ITEM",
    canonicalUrl: "https://example.sk/pomoc",
    metadata: {},
  }), {});
});

test("missing discovery presets cover three DIRECTORY gaps plus both HELP_ITEM categories", () => {
  const byKey = new Map(universalAutomationDiscoveryRootPresets.map((root) => [root.rootKey, root]));
  assert.equal(byKey.get("tavily-sk-dog-breeders")?.config.directoryCategory, "chovatelske-stanice");
  assert.equal(byKey.get("tavily-sk-dog-walking")?.config.directoryCategory, "vencenie");
  assert.equal(byKey.get("tavily-sk-dog-other-services")?.config.directoryCategory, "dalsie-sluzby");
  assert.equal(byKey.get("tavily-sk-dog-fundraising")?.config.helpCategory, "zbierky");
  assert.equal(byKey.get("tavily-sk-dog-volunteering")?.config.helpCategory, "dobrovolnictvo");
  for (const root of universalAutomationDiscoveryRootPresets.filter((item) => item.entityType === "DIRECTORY")) {
    assert.equal(root.cadenceMinutes, 10080);
  }
});

test("detached source-run contract keeps receipt-only memory and no UPDATE_EXISTING execution path", () => {
  const runner = read("lib/data-automation-runner.ts");
  const receipts = read("lib/data-automation-ingestion-receipts.ts");
  const draftService = read("lib/canonical-draft-service.ts");
  assert.match(runner, /SKIPPED_DUPLICATE/);
  assert.match(runner, /DUPLICATE_CANDIDATE/);
  assert.match(runner, /createAutomationIngestionReceipt/);
  assert.doesNotMatch(runner, /UPDATE_EXISTING/);
  assert.doesNotMatch(receipts, /canonical_entity_id|canonicalEntityId/);
  assert.match(receipts, /source_id=\? AND entity_type=\? AND source_record_id=\?/);
  assert.match(draftService, /status: "draft"|status: "DRAFT"/);
  assert.match(draftService, /published_at: null/);
});
