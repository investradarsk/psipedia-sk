import assert from "node:assert/strict";
import test from "node:test";
import { inspectDirectoryCanonicalStorage } from "../scripts/directory-canonical-storage-preflight.mjs";

test("offline D1 preflight reports old-only data and conflicts without contact values", () => {
  const report = inspectDirectoryCanonicalStorage([
    {
      id: 17, category: "veterinari", website_url: null, district: "",
      source_data_json: JSON.stringify({
        Web: "https://legacy.example.sk",
        Telefon: "+421 900 111 111", Okres: "Nitra",
      }),
    },
    {
      id: 18, category: "treneri", website_url: "https://new.example.sk", district: "Nitra",
      source_data_json: JSON.stringify({
        Web: "https://old.example.sk",
        "Webstránka": "https://even-older.example.sk",
        "E-mail": "new@example.sk", Email: "old@example.sk",
        Okres: "Levice",
      }),
    },
    {
      id: 19, category: "chovatelske-kluby", website_url: "", district: "",
      source_data_json: "{bad json",
    },
  ]);

  assert.equal(report.readOnly, true);
  assert.equal(report.valuesIncluded, false);
  assert.equal(report.scanned, 3);
  assert.equal(report.counts.website_only_in_source_json, 1);
  assert.equal(report.counts.website_column_source_conflict, 1);
  assert.equal(report.counts.websiteUrl_alias_conflict, 1);
  assert.equal(report.counts.websiteUrl_uses_legacy_alias, 1);
  assert.equal(report.counts.publicPhone_uses_legacy_alias, 1);
  assert.equal(report.counts.publicEmail_alias_conflict, 1);
  assert.equal(report.counts.district_only_in_source_json, 1);
  assert.equal(report.counts.district_column_source_conflict, 1);
  assert.equal(report.counts.invalid_source_json, 1);
  assert.deepEqual(report.sampleIds.website_only_in_source_json, [17]);
  assert.deepEqual(report.sampleIds.website_column_source_conflict, [18]);
  assert.deepEqual(report.sampleIds.invalid_source_json, [19]);
  assert.doesNotMatch(JSON.stringify(report), /legacy\.example\.sk|new@example\.sk|900 111 111/);
});

test("preflight accepts Wrangler D1 results envelope and does not invent clean values", () => {
  const report = inspectDirectoryCanonicalStorage([{
    results: [
      { id: 20, category: "veterinari", website_url: "", district: "Nitra", source_data_json: "{}" },
      { id: 21, category: "vencenie", website_url: "", district: "", source_data_json: "{}" },
    ],
    success: true,
  }]);
  assert.equal(report.scanned, 2);
  assert.deepEqual(report.counts, {});
  assert.deepEqual(report.sampleIds, {});
});

test("preflight rejects unsupported exports rather than assuming all profiles are clean", () => {
  assert.throws(() => inspectDirectoryCanonicalStorage({ data: [] }), /Export must/);
});
