import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/directory-merge-preflight.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
runInNewContext(js, {
  exports,
  require: (name) => {
    if (name === "cloudflare:workers") return { env: {} };
    throw Error("unexpected dependency " + name);
  },
  URL, JSON, Number, String, Object, Array, Map, Set,
});
const { parseMergeProfileId, buildDirectoryMergePreflight } = exports;

const row = (id, overrides = {}) => ({
  id, name: "Mestský kynologický klub Nitra – mesto", category: "kynologicke-kluby",
  slug: "mestsky-kk-" + id, status: "published", city: "Nitra",
  address: "Nitra", website_url: "https://example.sk", image_url: null,
  excerpt: "Perex", description: "Popis", source_data_json: JSON.stringify({
    "Telefón": "0908123456",
    "_psipedia_additional_categories": '["treneri"]',
  }),
  updated_at: "2026-11-14T00:00:00Z",
  partner_resources: 1, reviews: 0, memberships: 0, claims: 0,
  verifications: 0, entitlements: 0,
  commercial_interests: 0, commercial_agreements: 0,
  partner_change_requests: 0, notion_links: 1,
  geo_points: 0, service_choices: 0, service_properties: 0,
  breed_links: 0, help_links: 0, inquiries: 0, profile_change_requests: 0,
  ...overrides,
});

test("preflight only accepts exact positive safe integer ID strings", () => {
  for (const value of ["0", "-1", "1x", "1.1", "1  ", "001", "9007199254740999"]) {
    assert.equal(parseMergeProfileId(value), null, value);
  }
  assert.equal(parseMergeProfileId("39"), 39);
});

test("two profiles preserve resource counts and never declare merge ready", () => {
  const result = buildDirectoryMergePreflight([
    row(39), row(239, { reviews: 2, memberships: 1, phone: undefined }),
  ], 39, 239);
  assert.ok(result);
  assert.equal(result.canonical.id, 39);
  assert.equal(result.duplicate.id, 239);
  assert.equal(result.duplicate.reviews, 2);
  assert.equal(result.duplicate.memberships, 1);
  assert.equal(result.canonical.phone, "0908123456");
  assert.deepEqual(Array.from(result.canonical.additionalCategories), ["treneri"]);
  assert.ok(result.blockingReasons.some(s => s.includes("Notion")));
  assert.ok(result.blockingReasons.some(s => s.includes("recenzií")));
});

test("preflight blocks unknown cities, cross categories and statuses from silent merging", () => {
  const result = buildDirectoryMergePreflight([
    row(48), row(220, { category: "treneri", city: "Bratislava", status: "draft" }),
  ], 48, 220);
  assert.ok(result);
  assert.ok(result.blockingReasons.some(x => x.includes("Rôzne mestá")));
  assert.ok(result.blockingReasons.some(x => x.includes("Rôzne kategórie")));
  assert.ok(result.blockingReasons.some(x => x.includes("published")));
});

test("missing or identical IDs never produce a preflight", () => {
  assert.equal(buildDirectoryMergePreflight([row(39)], 39, 39), null);
  assert.equal(buildDirectoryMergePreflight([row(39)], 39, 239), null);
});

test("preflight is admin-only, bounded, and cannot write/migrate data", async () => {
  const page = await readFile(new URL("../app/admin/adresar/migracia/[canonicalId]/[duplicateId]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireAdminPageUser/);
  assert.match(page, /getDirectoryMergePreflight/);
  assert.match(source, /WHERE d\.id IN \(\?1,\?2\)/);
  assert.match(source, /LIMIT 2/);
  assert.doesNotMatch(source, /(?:UPDATE|DELETE|INSERT|REPLACE)\s+(?:INTO\s+)?directory_profiles/i);
  assert.doesNotMatch(page, /onSubmit|fetch\(|<form/);
});
