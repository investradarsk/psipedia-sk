import assert from "node:assert/strict";
import test from "node:test";
import { loadPublishedSeoQualityEntities } from "../lib/admin-seo-quality-entities.ts";

test("SEO audit starts eight independent D1 reads together and retains agenda order", async () => {
  const scans = [
    ["directory", "FROM directory_profiles"],
    ["events", "FROM managed_events"],
    ["help", "FROM help_cases"],
    ["lostFound", "FROM lost_found_dog_reports"],
    ["organizations", "FROM help_organizations o"],
    ["adoptions", "FROM adoption_dogs"],
    ["breeds", "FROM managed_breeds"],
    ["articles", "FROM managed_articles"],
  ];
  const calls = [];
  const database = {
    prepare(sql) {
      const source = scans.find(([, marker]) => sql.includes(marker))?.[0];
      assert.ok(source, "unexpected query in SEO quality audit");
      let bindings = [];
      return {
        bind(...args) { bindings = args; return this; },
        all() {
          return new Promise((resolve) => calls.push({ source, sql, bindings, resolve }));
        },
      };
    },
  };

  // With sequential awaits, only the first query would have started here.
  const pending = loadPublishedSeoQualityEntities(database);
  assert.deepEqual(calls.map((call) => call.source), scans.map(([name]) => name));
  assert.equal(calls.filter((call) => call.bindings.length === 1).length, 2, "time-sensitive reads share a single now binding");
  assert.ok(calls.every((call) => /SELECT\b/i.test(call.sql) && !/\b(?:INSERT|UPDATE|DELETE)\s+/i.test(call.sql)));

  // The SQLite reads may finish out of order. Results still keep the stable
  // directory, events, help, lost-found, organizations, adoptions, breeds, articles order.
  const inputs = {
    directory: [{ id: 11, name: "Veterina", slug: "veterina", category: "veterinari", city: "Nitra", excerpt: "Verejný popis", description: "Zdravotnícke služby", online: 0, seo_json: "{}" }],
    events: [{ id: 12, title: "Preteky", slug: "preteky", event_type: "Preteky", city: "Nitra", excerpt: "Podujatie", description: "Preteky psov", seo_json: "{}" }],
    articles: [{ id: 13, title: "Starostlivosť", slug: "starostlivost", portal_section: "clanky", category: "zdravie", excerpt: "Článok", intro: "Text", sections_json: "[]", blocks_json: "[]", noindex: 0 }],
  };
  for (const call of [...calls].reverse()) call.resolve({ results: inputs[call.source] ?? [] });
  const result = await pending;
  assert.deepEqual(result.map((entity) => entity.agenda), ["directory", "events", "articles"]);
  assert.deepEqual(result.map((entity) => entity.id), [11, 12, 13]);
  assert.ok(result.every((entity) => entity.adminHref && entity.expectedCanonicalPath));
});

test("SEO audit propagates D1 failures instead of hiding incomplete coverage", async () => {
  const database = {
    prepare(sql) {
      const failed = sql.includes("FROM managed_events");
      return {
        bind() { return this; },
        all() { return failed ? Promise.reject(new Error("D1 unavailable")) : Promise.resolve({ results: [] }); },
      };
    },
  };
  await assert.rejects(loadPublishedSeoQualityEntities(database), /D1 unavailable/);
});
