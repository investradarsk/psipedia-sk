import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOrganizationPublicationPreflight } from "../lib/help-organization-publication.ts";
import { normalizeOrganizationAdminSearch, parseOrganizationAdminFilters } from "../lib/help-organization-admin-query.ts";
import { OrganizationAdminValidationError, parseOrganizationAdminInput } from "../lib/help-organization-admin-input.ts";

function organization(overrides = {}) {
  return {
    id: 7,
    name: "Psia nádej",
    slug: "psia-nadej",
    legalName: "Psia nádej, o.z.",
    registrationNumber: "12345678",
    type: "CIVIC_ASSOCIATION",
    status: "DRAFT",
    shortDescription: "Pomáhame psom.",
    description: "Bezpečný verejný opis.",
    publicEmail: "info@example.sk",
    publicPhone: null,
    websiteUrl: "https://example.sk",
    facebookUrl: null,
    instagramUrl: null,
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
    imageUrl: null,
    sourceUrl: null,
    publishedAt: null,
    lastVerifiedAt: null,
    archivedAt: null,
    updatedAt: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

test("ready draft uses only technical public-contract blockers", () => {
  const preflight = buildOrganizationPublicationPreflight(organization());
  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.blockers, []);
  assert.deepEqual(preflight.warnings, []);
});

test("archived identity gaps and unsupported type block publication", () => {
  const preflight = buildOrganizationPublicationPreflight(organization({
    name: " ",
    slug: "",
    type: "UNKNOWN_TYPE",
    archivedAt: "2026-09-17T08:00:00.000Z",
  }));
  assert.equal(preflight.ready, false);
  assert.deepEqual(new Set(preflight.blockers.map((item) => item.code)), new Set([
    "ARCHIVED",
    "MISSING_NAME",
    "MISSING_SLUG",
    "INVALID_TYPE",
  ]));
});

test("published row without published_at is blocked because the public predicate fails closed", () => {
  const preflight = buildOrganizationPublicationPreflight(organization({ status: "PUBLISHED", publishedAt: null }));
  assert.equal(preflight.ready, false);
  assert.ok(preflight.blockers.some((item) => item.code === "PUBLISHED_WITHOUT_PUBLISHED_AT"));
});

test("renderer-supported content gaps remain warnings rather than blockers", () => {
  const preflight = buildOrganizationPublicationPreflight(organization({
    shortDescription: "",
    description: " ",
    publicEmail: "not-an-email",
    websiteUrl: "javascript:alert(1)",
    city: "",
    district: "",
    region: "",
  }));
  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.blockers, []);
  assert.deepEqual(new Set(preflight.warnings.map((item) => item.code)), new Set([
    "MISSING_DESCRIPTION",
    "MISSING_LOCATION",
    "MISSING_CONTACT",
  ]));
});

test("publication write contract is optimistic, row-scoped and relation-free", () => {
  const writeSource = readFileSync(new URL("../lib/help-organization-admin-write.ts", import.meta.url), "utf8");
  assert.match(writeSource, /SET status = 'PUBLISHED', published_at = \?, updated_at = \?, updated_by = \?/);
  assert.match(writeSource, /WHERE id = \? AND updated_at = \? AND status = 'DRAFT' AND archived_at IS NULL/);
  assert.match(writeSource, /SET status = 'DRAFT', published_at = NULL, updated_at = \?, updated_by = \?/);
  assert.match(writeSource, /WHERE id = \? AND updated_at = \? AND status = 'PUBLISHED'/);
  assert.doesNotMatch(writeSource, /adoption_dogs|directory_profiles/);
});

test("publication API reuses the existing admin auth contract", () => {
  const routeSource = readFileSync(new URL("../app/api/admin/organizations/[id]/publication/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /getAdminApiUser\(\)/);
  assert.match(routeSource, /unauthorizedAdminResponse\(\)/);
  assert.match(routeSource, /expectedUpdatedAt/);
});


test("organization admin search is accent-insensitive and filters stay canonical", () => {
  assert.equal(normalizeOrganizationAdminSearch("Žilina / Čadca"), "zilina cadca");
  const values = new URLSearchParams("q=Psia+n%C3%A1dej&type=CIVIC_ASSOCIATION&status=PUBLISHED&missingLocation=1&incomplete=1&page=2");
  const filters = parseOrganizationAdminFilters(values);
  assert.equal(filters.q, "Psia nádej");
  assert.equal(filters.type, "CIVIC_ASSOCIATION");
  assert.equal(filters.status, "PUBLISHED");
  assert.equal(filters.missingLocation, true);
  assert.equal(filters.incomplete, true);
  assert.equal(filters.page, 2);
  const invalid = parseOrganizationAdminFilters(new URLSearchParams("type=INVENTED&status=VISIBLE&page=nope"));
  assert.equal(invalid.type, "");
  assert.equal(invalid.status, "all");
  assert.equal(invalid.page, 1);
});

test("organization admin input validates canonical type, slug, contacts and media ownership", () => {
  const payload = {
    name: "Psia nádej",
    slug: "psia-nadej",
    legalName: "Psia nádej, o.z.",
    registrationNumber: "12345678",
    type: "CIVIC_ASSOCIATION",
    shortDescription: "Pomáhame psom.",
    description: "Verejný opis.",
    publicEmail: "info@example.sk",
    publicPhone: "+421900000000",
    websiteUrl: "https://example.sk",
    facebookUrl: "https://facebook.com/example",
    instagramUrl: null,
    imageUrl: "/media/help/2026/example.webp",
    imageKey: "help/2026/example.webp",
    sourceUrl: "https://example.sk/source",
  };
  assert.deepEqual(parseOrganizationAdminInput(payload), payload);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, slug: "Psia Nádej" }), OrganizationAdminValidationError);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, type: "INVENTED" }), OrganizationAdminValidationError);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, publicEmail: "nie-je-email" }), OrganizationAdminValidationError);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, websiteUrl: "/media/help/2026/wrong.webp" }), OrganizationAdminValidationError);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, imageKey: "directory/2026/wrong.webp" }), OrganizationAdminValidationError);
  assert.throws(() => parseOrganizationAdminInput({ ...payload, status: "PUBLISHED" }), /spravuje server/);
});

test("organization admin finalization keeps create draft-only, OCC edits and explicit archive restore", () => {
  const writeSource = readFileSync(new URL("../lib/help-organization-admin-write.ts", import.meta.url), "utf8");
  const editorSource = readFileSync(new URL("../components/admin-organization-editor.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../components/admin-organization-publication-dashboard.tsx", import.meta.url), "utf8");
  assert.match(writeSource, /VALUES \(\?, \?, \?, \?, \?, 'DRAFT'/);
  assert.match(writeSource, /WHERE id = \? AND updated_at = \? AND archived_at IS NULL/);
  assert.match(writeSource, /SET status = 'ARCHIVED', published_at = NULL, archived_at = \?/);
  assert.match(writeSource, /SET status = 'DRAFT', published_at = NULL, archived_at = NULL/);
  assert.match(editorSource, /uploadAdminImage\(file, "help"\)/);
  assert.doesNotMatch(editorSource, /AdminRichTextEditor/);
  assert.match(listSource, /name="missingLocation"/);
  assert.match(listSource, /name="incomplete"/);
  assert.match(listSource, /directoryProfileId/);
});
