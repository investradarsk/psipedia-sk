import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BREEDER_EDITORIAL_PATHS,
  breederNotionChangedFields, breederAdminChangedFields,
  breederApplyNotionChanges, breederPreserveUneditedFields,
} from "../lib/notion-breeder-field-events.ts";

test("signed Notion property IDs select only the breeder field actually edited", () => {
  const properties = {
    Facebook: { id: "FacebookOpaque", url: "https://www.facebook.com/izasterova" },
    Popis: { id: "descriptionOpaque", rich_text: [] },
    Služby: { id: "servicesOpaque", rich_text: [] },
    "SEO title": { id: "seoOpaque", rich_text: [] },
    "Sync stav": { id: "syncOpaque", select: { name: "Chyba" } },
  };
  assert.deepEqual(breederNotionChangedFields(properties, ["FacebookOpaque"]), ["facebookUrl"]);
  assert.deepEqual(breederNotionChangedFields(properties, ["Facebook"]), ["facebookUrl"]);
  assert.deepEqual(breederNotionChangedFields(properties, ["servicesOpaque"]), ["services"]);
  assert.deepEqual(breederNotionChangedFields(properties, ["syncOpaque"]), []);
  assert.deepEqual(breederNotionChangedFields(properties, []), []);
  assert.ok(!BREEDER_EDITORIAL_PATHS.includes("status"));
  assert.ok(!BREEDER_EDITORIAL_PATHS.includes("slug"));
  assert.ok(BREEDER_EDITORIAL_PATHS.includes("services"));
  assert.ok(!BREEDER_EDITORIAL_PATHS.includes("internalEmail"));
});

test("a Facebook edit does not overwrite legacy text, SEO or canonical identity", () => {
  const before = {
    name: "Duckmoors", slug: "duckmoors", status: "published",
    description: "Admin editorial description",
    facebookUrl: "",
    seo: { title: "Canonical SEO", description: "Admin SEO" },
  };
  const notion = {
    ...before, description: "Old conflicting Notion description",
    facebookUrl: "https://www.facebook.com/izasterova",
    seo: { title: "Different old Notion SEO", description: "Other SEO" },
  };
  const result = breederApplyNotionChanges(before, notion, ["facebookUrl"]);
  assert.equal(result.facebookUrl, notion.facebookUrl);
  assert.equal(result.description, before.description);
  assert.deepEqual(result.seo, before.seo);
  assert.equal(result.slug, before.slug);
  assert.equal(result.status, before.status);
  assert.equal(before.facebookUrl, "");
});

test("blank Notion fields never delete valid Admin data", () => {
  const previous = { facebookUrl: "https://example.com/real", seo: { title: "Valid" } };
  const incoming = { facebookUrl: "", seo: { title: "" } };
  assert.deepEqual(breederApplyNotionChanges(previous, incoming, ["facebookUrl", "seo.title"]), previous);
});

test("only explicitly saved Admin field deltas are exported", () => {
  const before = { facebookUrl: "", description: "Original", seo: { title: "Before" } };
  const after = { facebookUrl: "https://facebook.com/izasterova", description: "Original", seo: { title: "Before" } };
  assert.deepEqual(breederAdminChangedFields(before, after), ["facebookUrl"]);
  assert.deepEqual(breederAdminChangedFields(after, after), []);
  assert.deepEqual(breederAdminChangedFields({ services: ["Pracovný chov"] }, { services: ["Pracovný chovx"] }), ["services"]);
});


test("stale Admin form cannot undo a newer inbound Facebook edit", () => {
  const oldForm = {
    name: "Duckmoors", excerpt: "Old short text", description: "User changed description",
    facebookUrl: "", instagramUrl: "", seo: { title: "Old SEO" },
  };
  const latestD1 = {
    name: "Duckmoors", excerpt: "Old short text", description: "Earlier text",
    facebookUrl: "https://www.facebook.com/izasterova",
    instagramUrl: "", seo: { title: "Fresh Notion SEO" },
  };
  const result = breederPreserveUneditedFields(oldForm, latestD1, ["description"]);
  assert.equal(result.description, "User changed description");
  assert.equal(result.facebookUrl, latestD1.facebookUrl);
  assert.deepEqual(result.seo, latestD1.seo);
  assert.equal(result.name, "Duckmoors");
});

test("a single breeder field writes raw D1 content without validating unrelated fields", async () => {
  const { runInNewContext } = await import("node:vm");
  const ts = await import("typescript");
  const source = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const start = source.indexOf("const breederScalarColumns:");
  const end = source.indexOf("/**\n * Mapped breeder/trainer event mode:", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(source.slice(start, end) +
    "\nexports.saveBreederEditorialValue = saveBreederEditorialValue;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const queries = [];
  const current = {
    id: 1017, category: "chovatelske-stanice", status: "published",
    updatedAt: "2026-11-07T12:00:00Z", publicEmail: "nonsense (unrelated)",
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          return { async first() { return { id: 1017 }; } };
        },
      };
    },
  };
  runInNewContext(js, {
    exports, SYSTEM_ACTOR: "sync", breederReadPath: (v, p) => p.split(".")
      .reduce((x, k) => x?.[k], v),
    normalizeDirectorySearchText: value => value,
    getManagedDirectoryProfileById: async () => current,
  });
  const desired = {
    name: "BELIEVE ME", excerpt: "Perex", description: "Voľný opis",
    services: [], qualifications: [], region: "", district: "",
    city: "", address: "", postalCode: "", street: "", houseNumber: "",
    publicEmail: "blaljdljflajsdlfa",
    seo: { canonicalUrl: "čistý ľubovoľný text" },
  };
  await exports.saveBreederEditorialValue(db, current, desired, "description");
  assert.match(queries[0].sql, /description = \?/);
  assert.doesNotMatch(queries[0].sql, /public_email|internal_email|website_url/);
  assert.equal(queries[0].values[0], "Voľný opis");
  await exports.saveBreederEditorialValue(db, current, desired, "publicEmail");
  assert.match(queries[1].sql, /source_data_json = json_set/);
  assert.equal(queries[1].values[1], "blaljdljflajsdlfa");
  await exports.saveBreederEditorialValue(db, current, desired, "seo.canonicalUrl");
  assert.match(queries[2].sql, /seo_json = json_set/);
  assert.equal(queries[2].values[1], "čistý ľubovoľný text");
  for (const { sql } of queries) {
    assert.match(sql, /category = \?/);
    assert.match(sql, /updated_at = \?/);
    assert.equal(queries.find(query => query.sql === sql)?.values.at(-2), "chovatelske-stanice");
    assert.doesNotMatch(sql, /services_json\s*=/);
  }
  // Service text is an independent editorial list. No canonical Services V3
  // relation or other unrelated metadata may be touched by this D1 write.
  desired.services = ["rodinný; výstavný chov", "Aktívny chov – test"];
  await exports.saveBreederEditorialValue(db, current, desired, "services");
  assert.match(queries[3].sql, /services_json = \?/);
  assert.doesNotMatch(queries[3].sql, /source_data_json =/);
  assert.equal(queries[3].values[0], JSON.stringify(desired.services));
  // The same single-column CAS writer handles salon prose without Services V3 writes.
  current.category = "salony-a-sluzby";
  desired.services = ["Strihanie", "Trimovanie"];
  await exports.saveBreederEditorialValue(db, current, desired, "services");
  assert.equal(queries[4].values.at(-2), "salony-a-sluzby");
  assert.equal(queries[4].values[0], JSON.stringify(desired.services));
  assert.match(queries[4].sql, /services_json = \?/);
  assert.doesNotMatch(queries[4].sql, /directory_service|service_option/);
  // No other directory category is entitled to the newly enabled event writer.
  current.category = "hotely-a-opatrovanie";
  await assert.rejects(
    () => exports.saveBreederEditorialValue(db, current, desired, "description"),
    /BREEDER_FIELD_WRITE_NOT_ALLOWED/,
  );
});

test("Notion tri-state filters and operational alerts stay separate from V3 services", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const operations = await readFile(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
  assert.match(directory, /chovatelske-stanice\.visits_by_appointment/);
  assert.match(directory, /chovatelske-stanice\.health_testing_information/);
  assert.match(directory, /breederChangedNotionFacets/);
  assert.match(directory, /mirrorBreederCategoryFiltersToNotion/);
  assert.match(directory, /mergeDirectoryFilterValues/);
  assert.match(route, /action === "set-category-filters"/);
  assert.match(route, /mirrorBreederCategoryFiltersToNotion/);
  assert.match(operations, /loadDirectoryNotionAlerts/);
  assert.doesNotMatch(directory.slice(directory.indexOf("function notionProfileProperties("),
    directory.indexOf("async function schemaReady(")), /"Google Place ID"| "Latitude":| "Longitude":/);
});

test("breeder-only transport bypasses full-profile conflict merging and cron", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const dispatch = await readFile(new URL("../lib/notion-webhook-dispatch.ts", import.meta.url), "utf8");
  const webhook = await readFile(new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.match(directory, /return syncBreederEvent\(\{/);
  assert.match(directory, /changedPropertyIds\?: readonly string\[\]/);
  assert.match(directory, /breederAdminFields\?: readonly BreederEditorialField\[\]/);
  assert.match(directory, /dp\.category <> 'chovatelske-stanice'/);
  assert.match(dispatch, /changedPropertyIds: event\.data\?\.updated_properties \?\? \[\]/);
  assert.match(webhook, /notion_breeder_immediate_dispatch_deferred/);
  assert.match(webhook, /await enqueueNotionWebhook\(bindings\.DB, data, body\)/);
  assert.match(admin, /breederEditedFields\(before, profile\)/);
  assert.match(admin, /breederEditedFields\(breederBefore, profile\)/);
});

test("salon edit events preserve individual fields and bypass whole-record conflict sync", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const webhook = await readFile(new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.ok(webhook.includes("dp.category IN ('chovatelske-stanice','treneri','salony-a-sluzby')"));
  assert.ok(directory.includes('["chovatelske-stanice", "treneri", "salony-a-sluzby"].includes(profile.category)'));
  assert.ok(directory.includes('["chovatelske-stanice", "salony-a-sluzby"].includes(profile.category)'));
  assert.ok(admin.includes('["chovatelske-stanice", "treneri", "salony-a-sluzby"].includes(before.category)'));
  assert.ok(editor.includes('["chovatelske-stanice", "treneri", "salony-a-sluzby"].includes(profile.category)'));
  const adminPrevious = { description: "Overený popis", services: ["Trimovanie"], seo: { title: "SEO" } };
  const incomingNotion = { description: "", services: [], seo: { title: "" } };
  assert.deepEqual(breederApplyNotionChanges(adminPrevious, incomingNotion, ["description", "services", "seo.title"]), adminPrevious);
  assert.deepEqual(
    breederAdminChangedFields(adminPrevious, { ...adminPrevious, description: "Upravený odborný popis" }),
    ["description"],
  );
  const fresh = breederPreserveUneditedFields({ ...adminPrevious, description: "Upravený popis" },
    { ...adminPrevious, services: ["Kúpanie", "Trimovanie"] }, ["description"]);
  assert.deepEqual(fresh.services, ["Kúpanie", "Trimovanie"]);
});
