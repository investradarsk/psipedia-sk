import assert from "node:assert/strict";
import test from "node:test";
import { getOrganizationPublicationAdminById } from "../lib/help-organization-admin-store.ts";

function legacyRow(overrides = {}) {
  return {
    id: 128,
    name: "Testovacia organizácia",
    slug: "testovacia-organizacia",
    legal_name: null,
    registration_number: null,
    type: "OTHER",
    status: "DRAFT",
    short_description: null,
    description: null,
    public_email: null,
    public_phone: null,
    website_url: null,
    facebook_url: null,
    instagram_url: null,
    city: null,
    district: null,
    region: null,
    country_code: null,
    image_url: null,
    image_key: null,
    thumbnail_display_json: null,
    detail_display_json: null,
    source_url: null,
    directory_profile_id: null,
    published_at: null,
    last_verified_at: null,
    archived_at: null,
    updated_at: "2026-11-12T00:00:00.000Z",
    location_count: 0,
    fundraising_count: 0,
    resolved_city: null,
    resolved_district: null,
    resolved_region: null,
    ...overrides,
  };
}
function database(row, error) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      assert.match(sql, /WHERE o\.id = \?/);
      calls.push(sql);
      return {
        bind(id) { assert.equal(id, 128); return this; },
        async first() { if (error) throw error; return row; },
      };
    },
  };
}

test("legacy NULL organization text columns no longer break detail rendering", async () => {
  const db = database(legacyRow());
  const organization = await getOrganizationPublicationAdminById(128, db);
  assert.ok(organization);
  assert.equal(organization.id, 128);
  assert.equal(organization.name, "Testovacia organizácia");
  for (const key of ["legalName", "shortDescription", "description", "city", "district", "region", "countryCode"]) {
    assert.equal(organization[key], "", key);
  }
  assert.ok(organization.completenessHints.includes("Bez lokality"));
  assert.ok(organization.completenessHints.includes("Bez verejného popisu"));
  assert.equal(db.calls.length, 1);
});

test("a truly missing canonical organization stays missing, not an empty editable draft", async () => {
  const found = await getOrganizationPublicationAdminById(128, database(null));
  assert.equal(found, null);
});

test("invalid lifecycle is a visible error, never an invented DRAFT", async () => {
  await assert.rejects(
    getOrganizationPublicationAdminById(128, database(legacyRow({ status: "INVALID" }))),
    /Neplatný lifecycle stav organizácie #128/,
  );
});

test("D1 failures propagate as errors rather than silently changing canonical data", async () => {
  const error = Error("simulated D1 failure");
  await assert.rejects(getOrganizationPublicationAdminById(128, database(null, error)), caught => caught === error);
});
