import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createProductionOrganizationEnricher,
  parseOrganizationDirectory,
} from "../lib/data-automation-organization-enrichment.ts";

const fixture = (name) => readFileSync(new URL("./fixtures/data-automation/" + name, import.meta.url), "utf8");
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("organization enrichment directory exposes website and Facebook for a safe exact match", () => {
  const rows = parseOrganizationDirectory(
    fixture("organization-enrichment-directory.html"),
    "https://www.psiadusa.sk/zoznam-utulkov/",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Šťastný psík");
  assert.equal(rows[0].city, "Matejovce nad Hornádom");
  assert.equal(rows[0].websiteUrl, "https://stastnypsik.example/");
  assert.equal(rows[0].facebookUrl, "https://facebook.com/stastnypsik");
});

test("organization enrichment fills public contact, social, identity, content and image fields", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://psiadusa.sk/zoznam-utulkov") {
      return new Response(fixture("organization-enrichment-directory.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://stastnypsik.example/") {
      return new Response(fixture("organization-enrichment-site.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://stastnypsik.example/kontakt") {
      return new Response(fixture("organization-enrichment-contact.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    throw new Error("unexpected fetch " + url);
  };

  const enrich = createProductionOrganizationEnricher({ fetchImpl });
  const detectedAt = "2026-09-21T09:30:00.000Z";
  const result = await enrich({
    sourceRecordId: "SK U 00017/2013",
    sourceUrl: "https://zoznamy.svps.sk/?Sekcia=46",
    sourceTimestamp: null,
    rawRecord: { approvalNumber: "SK U 00017/2013" },
    proposed: {
      name: "Útulok Šťastný psík",
      city: "Matejovce nad Hornádom",
      district: "Spišská Nová Ves",
      region: "Košický",
      address: "Matejovce nad Hornádom 147",
      operatorName: "Občianske združenie Šťastný psík, Matejovce nad Hornádom 147",
      sourceApprovalNumber: "SK U 00017/2013",
      sourceActivity: "SHELP",
      sourceUrl: "https://zoznamy.svps.sk/?Sekcia=46",
    },
  }, { detectedAt });

  assert.equal(result.proposed.websiteUrl, "https://stastnypsik.example/");
  assert.equal(result.proposed.publicEmail, "info@stastnypsik.example");
  assert.equal(result.proposed.publicPhone, "+421900123456");
  assert.equal(result.proposed.facebookUrl, "https://facebook.com/stastnypsik");
  assert.equal(result.proposed.instagramUrl, "https://instagram.com/stastnypsik");
  assert.equal(result.proposed.registrationNumber, "12345678");
  assert.equal(result.proposed.imageUrl, "https://stastnypsik.example/images/logo.jpg");
  assert.equal(result.proposed.type, "SHELTER");
  assert.equal(result.proposed.legalName, "Občianske združenie Šťastný psík");
  assert.equal(result.proposed.countryCode, "SK");
  assert.equal(result.proposed.lastVerifiedAt, detectedAt);
  assert.match(String(result.proposed.shortDescription), /Pomáhame opusteným psom/);
  assert.match(String(result.proposed.description), /SK U 00017\/2013/);
  assert.equal(result.proposed.sourceUrl, "https://zoznamy.svps.sk/?Sekcia=46");
  assert.deepEqual(calls, [
    "https://psiadusa.sk/zoznam-utulkov",
    "https://stastnypsik.example/",
    "https://stastnypsik.example/kontakt",
  ]);
});

test("enrichment never overwrites a field already supplied by the primary source", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url === "https://psiadusa.sk/zoznam-utulkov") {
      return new Response(fixture("organization-enrichment-directory.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://stastnypsik.example/") {
      return new Response(fixture("organization-enrichment-site.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://stastnypsik.example/kontakt") {
      return new Response(fixture("organization-enrichment-contact.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    throw new Error("unexpected fetch " + url);
  };
  const enrich = createProductionOrganizationEnricher({ fetchImpl });
  const result = await enrich({
    sourceRecordId: "x",
    sourceUrl: "https://zoznamy.svps.sk/",
    sourceTimestamp: null,
    rawRecord: {},
    proposed: {
      name: "Šťastný psík",
      city: "Matejovce nad Hornádom",
      publicEmail: "overene@primarny-zdroj.sk",
      shortDescription: "Overený text z primárneho zdroja.",
    },
  }, { detectedAt: "2026-09-21T10:00:00.000Z" });

  assert.equal(result.proposed.publicEmail, "overene@primarny-zdroj.sk");
  assert.equal(result.proposed.shortDescription, "Overený text z primárneho zdroja.");
  assert.equal(result.proposed.publicPhone, "+421900123456");
});

test("enrichment stays review-gated and organization image is an applyable canonical field", () => {
  const runner = read("lib/data-automation-runner.ts");
  const worker = read("worker/index.ts");
  const apply = read("lib/data-automation-apply.ts");
  const store = read("lib/data-automation-store.ts");

  assert.match(runner, /organizationEnricher/);
  assert.match(runner, /processRecord\(source, runId, candidateRecord/);
  assert.match(worker, /createProductionOrganizationEnricher/);
  assert.match(apply, /imageUrl: field\("image_url"\)/);
  assert.match(apply, /image_url: after\.imageUrl/);
  assert.match(store, /imageUrl: row\.image_url/);
  assert.doesNotMatch(runner, /UPDATE\s+help_organizations/i);
});

test("SVPS adapter keeps its authoritative source URL in the proposal", () => {
  const sources = read("lib/data-automation-real-sources.ts");
  assert.match(sources, /svpsSheltersRegisterAdapter: ControlledHtmlAdapter = \(\{ html, source \}\)/);
  assert.match(sources, /sourceUrl: source\.sourceUrl/);
});
