import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  ADOPTION_HOLD_SLUGS,
  ADOPTION_ORGANIZATION_IDENTITIES,
  buildAdoptionMigrationCandidates,
  excelSerialToIsoDate,
  preflightAdoptionMigration,
  transformAdoptionAge,
  transformAdoptionSex,
} from "../lib/adoption-migration-safety.ts";
import { adoptionPublicationErrors } from "../lib/adoption.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../data/imports/adoptions-ready-2026-09-13.json"));
const legacy = manifest.ready.map((row, index) => ({
  category: "adopcia",
  slug: row.slug,
  status: "published",
  dogName: row.dogName,
  breed: row.breed,
  excerpt: row.excerpt,
  description: row.description ?? "",
  imageUrl: index % 2 === 0 ? `/media/legacy/${row.slug}.webp` : null,
}));
const organizations = Object.values(ADOPTION_ORGANIZATION_IDENTITIES).map((identity, index) => ({
  id: 700 + index,
  importKey: identity.importKey,
  slug: identity.slug,
  name: identity.name,
}));

test("authoritative manifest contains exactly 36 READY and 4 denied HOLD records", () => {
  assert.equal(manifest.readyCount, 36);
  assert.equal(manifest.ready.length, 36);
  assert.equal(manifest.holdCount, 4);
  assert.deepEqual(manifest.holdSlugs.sort(), [...ADOPTION_HOLD_SLUGS].sort());
  assert.equal(new Set(manifest.ready.map((row) => row.slug)).size, 36);
  for (const slug of ADOPTION_HOLD_SLUGS) assert.equal(manifest.ready.some((row) => row.slug === slug), false);
});

test("preflight requires 36 exact legacy matches and resolves four canonical identities 16/9/7/4", () => {
  const report = preflightAdoptionMigration(manifest, legacy, organizations, []);
  assert.equal(report.ready, 36);
  assert.equal(report.legacyExactMatches, 36);
  assert.equal(report.canonicalMappings, 36);
  assert.equal(report.organizationIdentities, 4);
  assert.deepEqual(Object.values(report.distribution), [16, 9, 7, 4]);
  assert.equal(report.holdCandidatesImported, 0);
  assert.equal(report.publishable, 36);
  assert.deepEqual(report.publicationBlockers, []);
});

test("legacy matching is exact category plus slug and never fuzzy", () => {
  assert.throws(() => buildAdoptionMigrationCandidates(manifest, legacy.slice(1), organizations), /Legacy exact match falco-hlada-novy-domov vrátil 0/);
  assert.throws(() => buildAdoptionMigrationCandidates(manifest, [
    ...legacy,
    { ...legacy[0], category: "adopcia" },
  ], organizations), /vrátil 2/);
});

test("canonical organization lookup validates one row plus expected slug and name", () => {
  assert.throws(() => buildAdoptionMigrationCandidates(manifest, legacy, organizations.slice(1)), /vrátil 0 rows/);
  assert.throws(() => buildAdoptionMigrationCandidates(manifest, legacy, organizations.map((row, index) => index ? row : { ...row, name: "Wrong" })), /identity conflict/);
});

test("sex, exact date, approximate age and Excel serial date are deterministic", () => {
  assert.equal(transformAdoptionSex("samec"), "MALE");
  assert.equal(transformAdoptionSex("samica"), "FEMALE");
  assert.deepEqual(transformAdoptionAge("nar. 29.06.2026", 46278), { birthDate: "2026-06-29", approximateAgeMonths: null });
  assert.deepEqual(transformAdoptionAge("3 roky", 46278), { birthDate: null, approximateAgeMonths: 36 });
  assert.equal(excelSerialToIsoDate(46278), "2026-09-13T00:00:00.000Z");
});

test("UNKNOWN size is publishable and adult-weight estimates never become current weight", () => {
  const candidates = buildAdoptionMigrationCandidates(manifest, legacy, organizations);
  const didy = candidates.find((row) => row.slug === "didy-hlada-novy-domov");
  const rosie = candidates.find((row) => row.slug === "rosie-hlada-novy-domov");
  const falco = candidates.find((row) => row.slug === "falco-hlada-novy-domov");
  assert.equal(didy.size, "UNKNOWN");
  assert.equal(adoptionPublicationErrors(didy).length, 0);
  assert.equal(rosie.weight, null);
  assert.equal(falco.weight, 15.9);
});

test("Odin and Beky keep missing optional descriptions and images without invention", () => {
  const candidates = buildAdoptionMigrationCandidates(manifest, legacy, organizations);
  const odin = candidates.find((row) => row.slug === "odin-hlada-novy-domov");
  const beky = candidates.find((row) => row.slug === "beky-hlada-novy-domov");
  assert.equal(odin.description, "");
  assert.equal(beky.description, "");
  assert.equal(odin.mainImage, legacy.find((row) => row.slug === odin.slug).imageUrl);
  assert.equal(beky.mainImage, legacy.find((row) => row.slug === beky.slug).imageUrl);
  assert.deepEqual(adoptionPublicationErrors(beky), []);
});

test("exact date and approximate age remain mutually exclusive in all candidates", () => {
  for (const row of buildAdoptionMigrationCandidates(manifest, legacy, organizations)) {
    assert.notEqual(Boolean(row.birthDate), row.approximateAgeMonths !== null);
  }
});

test("preflight fails on any target slug collision and never blind-upserts", () => {
  assert.throws(() => preflightAdoptionMigration(manifest, legacy, organizations, [manifest.ready[0].slug]), /Target adoption slug collision/);
});

test("migration safety sources contain no numeric organization mapping or active Drizzle data migration", () => {
  const source = read("../lib/adoption-migration-safety.ts");
  assert.doesNotMatch(source, /organizationId:\s*\d+/);
  assert.doesNotMatch(source, /status:\s*["']ACTIVE["']/);
  const migrations = readdirSync(new URL("../drizzle", import.meta.url)).filter((name) => /^\d+_.*\.sql$/.test(name));
  assert.equal(migrations.at(-1), "0037_import_ready_help_organizations.sql");
  assert.equal(migrations.some((name) => /adoption.*(import|migration|cutover)/i.test(name)), false);
});
