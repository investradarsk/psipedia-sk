import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { presentDirectoryCatalogAttributes } from "../lib/directory-public-catalog-attributes.ts";
import { directoryPublicFacetSql } from "../lib/directory-public-filters.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("confirmed V3 breeder attributes appear in public detail, not unknown or another category", () => {
  const rows = [
    { option_id: "attr.kennel.visits_by_appointment", choice: "yes" },
    { option_id: "attr.kennel.health_testing_information", choice: "no" },
    { option_id: "attr.vet.emergency", choice: "yes" },
  ];
  assert.deepEqual(presentDirectoryCatalogAttributes("chovatelske-stanice", rows), [
    { label: "Návštevy po dohode", value: "Áno" },
    { label: "Informácie o zdravotných testoch", value: "Nie" },
  ]);
  assert.deepEqual(presentDirectoryCatalogAttributes("chovatelske-stanice", [
    { option_id: "attr.kennel.visits_by_appointment", choice: "unknown" },
  ]), []);
  assert.deepEqual(presentDirectoryCatalogAttributes("treneri", rows), []);
});

test("public directory, admin and partner editor share only the canonical V3 controls", () => {
  const form = read("components/directory-category-filter-fields.tsx");
  const publicPage = read("app/adresar/[category]/[slug]/page.tsx");
  const detail = read("components/directory-profile-detail.tsx");
  const admin = read("components/admin-service-profile-values.tsx");
  assert.match(form, /mapping\.targetKind !== "provider"/);
  assert.match(form, /\.filter\(\(field\) => !catalogOwned\.has\(field\.id\)\)/);
  assert.match(form, /if \(!fields\.length\) return null/);
  assert.match(publicPage, /getPublicDirectoryCatalogAttributes\(database, profile\.id, profile\.category\)/);
  assert.match(publicPage, /catalogAttributes=\{catalogAttributes\}/);
  assert.match(detail, /key: "catalog-attributes"/);
  assert.match(detail, /title="Vlastnosti profilu"/);
  assert.match(detail, /<DetailOptionGrid options=\{catalogAttributes\.map/);
  assert.match(admin, /service_profile_option_choices|initialChoices/);
  assert.match(read("components/admin-directory-editor.tsx"), /<DirectoryCategoryFilterFields/);
  assert.match(read("components/partner-profile-edit-form.tsx"), /<DirectoryCategoryFilterFields/);
});

test("public listing and map facet predicates read the V3 choice rather than a stale duplicate", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, source_data_json TEXT)");
    db.exec("CREATE TABLE service_profile_option_choices (profile_id INTEGER, option_id TEXT, choice TEXT)");
    const key = "_psipedia_filter_v1_chovatelske_stanice_visits_by_appointment";
    db.prepare("INSERT INTO directory_profiles VALUES (1, ?, ?)").run("chovatelske-stanice", JSON.stringify({ [key]: "no" }));
    db.prepare("INSERT INTO directory_profiles VALUES (2, ?, ?)").run("chovatelske-stanice", JSON.stringify({ [key]: "yes" }));
    db.prepare("INSERT INTO service_profile_option_choices VALUES (1, ?, 'yes')")
      .run("attr.kennel.visits_by_appointment");
    db.prepare("INSERT INTO service_profile_option_choices VALUES (2, ?, 'no')")
      .run("attr.kennel.visits_by_appointment");
    for (const column of ["source_data_json", "d.source_data_json"]) {
      const where = directoryPublicFacetSql("chovatelske-stanice",
        { "chovatelske-stanice.visits_by_appointment": "yes" }, column);
      assert.equal(where.clauses.length, 1);
      assert.deepEqual(where.bindings, ["attr.kennel.visits_by_appointment", "yes"]);
      const rows = db.prepare("SELECT d.id FROM directory_profiles d WHERE " + where.clauses[0])
        .all(...where.bindings);
      assert.deepEqual(rows.map((row) => row.id), [1]);
    }
  } finally {
    db.close();
  }
});
