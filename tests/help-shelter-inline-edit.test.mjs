import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SHELTER_INLINE_FIELDS, organizationInputWithShelterInlineChanges,
} from "../lib/help-organization-inline-edit.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const item = {
  id: 35, name: "Útulok Zlaté Moravce", slug: "utulok-zlate-moravce",
  legalName: "OZ Záchrana", registrationNumber: null, type: "SHELTER", status: "DRAFT",
  shortDescription: "Starostlivosť o psy", description: "Verejný popis",
  publicEmail: "kontakt@example.sk", publicPhone: null, websiteUrl: null,
  facebookUrl: null, instagramUrl: null, city: "Zlaté Moravce", district: "Zlaté Moravce",
  region: "Nitriansky", countryCode: "SK", imageUrl: null,
  imageKey: null, sourceUrl: null, publishedAt: null, lastVerifiedAt: null,
  archivedAt: null, updatedAt: "2026-11-02T09:00:00.000Z",
  thumbnailImageDisplay: null, detailImageDisplay: null,
};
const changes = {
  name: "Nový názov útulku", shortDescription: "Nový krátky popis",
  publicEmail: "novy@example.sk", publicPhone: "+421 900 123 456",
  websiteUrl: "https://www.example.sk",
};

test("shelter grid only permits five public text fields and preserves canonical identity", () => {
  assert.deepEqual([...SHELTER_INLINE_FIELDS], [
    "name", "shortDescription", "publicEmail", "publicPhone", "websiteUrl",
  ]);
  const result = organizationInputWithShelterInlineChanges(item, changes);
  assert.equal(result.name, changes.name);
  assert.equal(result.shortDescription, changes.shortDescription);
  assert.equal(result.publicPhone, changes.publicPhone);
  assert.equal(result.publicEmail, changes.publicEmail);
  assert.equal(result.websiteUrl, changes.websiteUrl + "/");
  assert.equal(result.slug, item.slug);
  assert.equal(result.type, "SHELTER");
  assert.equal(result.description, item.description);
  assert.equal(result.imageUrl, item.imageUrl);
  assert.equal(result.legalName, item.legalName);
});

test("shelter grid rejects lifecycle, type, slug, address, media, unknown or partial changes", () => {
  for (const key of ["status", "type", "slug", "city", "address", "imageUrl", "updatedAt", "id", "delete"]) {
    assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, [key]: "tamper" }), /podporuje iba/);
  }
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { name: "Iba názov" }), /podporuje iba/);
  assert.throws(() => organizationInputWithShelterInlineChanges(item, []), /Chýbajú údaje/);
  assert.throws(() => organizationInputWithShelterInlineChanges({ ...item, type: "NONPROFIT" }, changes), /nie je upraviteľný/);
  assert.throws(() => organizationInputWithShelterInlineChanges({ ...item, status: "ARCHIVED" }, changes), /nie je upraviteľný/);
  assert.throws(() => organizationInputWithShelterInlineChanges({ ...item, archivedAt: "2026-11-02" }, changes), /nie je upraviteľný/);
});

test("canonical full-input validation rejects bad contact fields, URLs and oversized text", () => {
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, name: "" }), /povinný údaj/);
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, publicEmail: "bad@" }), /platný formát/);
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, websiteUrl: "javascript:alert(1)" }), /http alebo https/);
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, shortDescription: "A".repeat(701) }), /najviac 700/);
  assert.throws(() => organizationInputWithShelterInlineChanges(item, { ...changes, websiteUrl: 123 }), /Neplatný údaj/);
  const cleared = organizationInputWithShelterInlineChanges(item, { ...changes, publicEmail: "", publicPhone: "", websiteUrl: "" });
  assert.equal(cleared.publicEmail, null);
  assert.equal(cleared.publicPhone, null);
  assert.equal(cleared.websiteUrl, null);
});

test("inline PATCH uses server-side canonical organization writer and protects concurrent edits", () => {
  const route = read("app/api/admin/organizations/[id]/route.ts");
  const writer = read("lib/help-organization-admin-write.ts");
  assert.match(route, /export async function PATCH\(/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /organizationInputWithShelterInlineChanges\(before, body\.changes\)/);
  assert.match(route, /before\.updatedAt !== expectedUpdatedAt/);
  assert.match(route, /updateOrganizationFromAdmin\(id, payload, auth\.user\.email, expectedUpdatedAt\)/);
  assert.match(route, /syncSavedNotionRecord\(/);
  assert.match(route, /agenda: "organizations"/);
  assert.match(route, /invalidateVersionedPublicHtmlCacheUrl/);
  assert.match(writer, /WHERE id = \? AND updated_at = \? AND archived_at IS NULL/);
});

test("only the shelters grid shows inline controls, full editor remains available", () => {
  const grid = read("components/admin-help-unified-table.tsx");
  const page = read("app/admin/pomoc-psom/page.tsx");
  assert.match(grid, /const canInlineEditShelters = category === "utulky"/);
  assert.match(grid, /Upraviť v tabuľke/);
  assert.match(grid, /method: "PATCH"/);
  assert.match(grid, /expectedUpdatedAt: draft\.expectedUpdatedAt/);
  assert.match(grid, /router\.refresh\(\)/);
  assert.match(grid, /Zrušiť/);
  assert.match(grid, /href=\{item\.href\}>Detail/);
  assert.match(page, /editable: item\.status !== "ARCHIVED" && !item\.archivedAt/);
  assert.match(page, /publicEmail: item\.publicEmail/);
  assert.match(page, /publicPhone: item\.publicPhone/);
  assert.match(page, /websiteUrl: item\.websiteUrl/);
});
