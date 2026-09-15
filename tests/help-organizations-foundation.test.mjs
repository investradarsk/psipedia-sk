import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("canonical help organizations foundation is additive and has stable identity", () => {
  const migration = read("../drizzle/0036_help_organizations_foundation.sql");
  assert.match(migration, /^CREATE TABLE help_organizations/m);
  assert.match(migration, /id INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.match(migration, /CREATE UNIQUE INDEX help_organizations_slug_unique/);
  assert.match(migration, /CHECK \(type IN \('SHELTER', 'CIVIC_ASSOCIATION', 'RESCUE_ORGANIZATION', 'MUNICIPAL_ORGANIZATION', 'NONPROFIT', 'OTHER'\)\)/);
  assert.match(migration, /CHECK \(status IN \('DRAFT', 'PUBLISHED', 'ARCHIVED'\)\)/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER)\b/im);
});

test("organization schema supports public profiles, provenance and safe directory linking", () => {
  const schema = read("../db/help-organization-schema.ts");
  for (const field of [
    "publicEmail", "publicPhone", "websiteUrl", "facebookUrl", "instagramUrl", "address", "city", "district", "region",
    "imageUrl", "imageKey", "directoryProfileId", "importKey", "sourceUrl", "sourceDataJson", "seoJson", "publishedAt",
    "lastVerifiedAt", "archivedAt", "createdAt", "updatedAt", "createdBy", "updatedBy",
  ]) assert.match(schema, new RegExp(`${field}:`));
  assert.match(schema, /directoryProfileId: integer\("directory_profile_id"\)\.references\(\(\) => directoryProfiles\.id, \{ onDelete: "set null" \}\)/);
});

test("adoption organization link remains non-destructive until controlled backfill", () => {
  const adoptionSchema = read("../db/adoption-schema.ts");
  const adoptionMigration = read("../drizzle/0034_adoption_dogs_foundation.sql");
  assert.match(adoptionSchema, /organizationId: integer\("organization_id"\),/);
  assert.match(adoptionSchema, /organizationName: text\("organization_name"\)\.notNull\(\)\.default\(""\)/);
  assert.match(adoptionSchema, /organizationSlug: text\("organization_slug"\)/);
  assert.match(adoptionMigration, /organization_id INTEGER,/);
  assert.doesNotMatch(adoptionMigration, /organization_id INTEGER REFERENCES/);
});

test("drizzle config includes canonical organizations without removing existing schemas", () => {
  const config = read("../drizzle.config.ts");
  for (const schema of [
    "./db/schema.ts", "./db/foundation-schema.ts", "./db/lost-found-dogs-schema.ts", "./db/adoption-schema.ts", "./db/help-organization-schema.ts",
  ]) assert.match(config, new RegExp(schema.replaceAll(".", "\\.")));
});

test("public and admin help compatibility routes remain backed by help_cases", () => {
  const helpStore = read("../lib/help-store.ts");
  const publicRoute = read("../app/pomoc-psom/[category]/page.tsx");
  const adminRoute = read("../app/admin/pomoc/page.tsx");
  assert.match(helpStore, /FROM help_cases/);
  assert.match(publicRoute, /getPublishedHelpCases/);
  assert.match(adminRoute, /getManagedHelpDashboard/);
});
