#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  ADOPTION_ORGANIZATION_IDENTITIES,
  preflightAdoptionMigration,
} from "../lib/adoption-migration-safety.ts";

const LOCAL_D1_DIRECTORY = resolve(process.env.PSIPEDIA_LOCAL_D1_DIRECTORY || ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const manifest = JSON.parse(readFileSync(new URL("../data/imports/adoptions-ready-2026-09-13.json", import.meta.url), "utf8"));

function assertCiLocalOnly() {
  if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== "1" || process.env.CI !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed adoption staging prerequisites outside isolated local CI.");
  }
}

function localDatabasePath() {
  if (!existsSync(LOCAL_D1_DIRECTORY)) throw new Error("Local CI D1 directory does not exist.");
  const files = readdirSync(LOCAL_D1_DIRECTORY).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  if (files.length !== 1) throw new Error(`Expected one isolated local D1 file, found ${files.length}.`);
  return resolve(LOCAL_D1_DIRECTORY, files[0]);
}

assertCiLocalOnly();
const db = new DatabaseSync(localDatabasePath());
try {
  if (process.argv[2] === "verify") {
    const cohort = db.prepare(`SELECT COUNT(*) AS total,
      SUM(status = 'ACTIVE') AS active, SUM(status = 'DRAFT') AS drafts,
      SUM(published_at IS NOT NULL) AS published, COUNT(DISTINCT slug) AS slugs,
      SUM(organization_id IS NOT NULL) AS linked, COUNT(DISTINCT organization_id) AS organizations
      FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1'`).get();
    const snapshotMatches = db.prepare(`SELECT COUNT(*) AS count FROM adoption_dogs dog
      JOIN help_organizations organization ON organization.id = dog.organization_id
      WHERE dog.created_by = 'adoption-staging-import:v1'
        AND dog.organization_name = organization.name AND dog.organization_slug = organization.slug`).get().count;
    if (cohort.total !== 36 || cohort.active !== 36 || cohort.drafts !== 0 || cohort.published !== 36
      || cohort.slugs !== 36 || cohort.linked !== 36 || cohort.organizations !== 4 || snapshotMatches !== 36) {
      throw new Error(`Canonical adoption activation verification failed: ${JSON.stringify(cohort)}, snapshots=${snapshotMatches}.`);
    }
    console.log("[adoption-staging-ci] LOCAL CI ONLY: activation verified 36/36 ACTIVE, published and canonically linked.");
    process.exit(0);
  }
  const existingLegacy = db.prepare("SELECT COUNT(*) AS count FROM help_cases WHERE category = 'adopcia'").get().count;
  const existingTargets = db.prepare("SELECT COUNT(*) AS count FROM adoption_dogs").get().count;
  if (existingLegacy !== 0 || existingTargets !== 0) {
    throw new Error(`Expected empty CI adoption prerequisites; found legacy=${existingLegacy}, target=${existingTargets}.`);
  }

  const insert = db.prepare(`INSERT INTO help_cases (
    slug, title, category, status, excerpt, description, organization, dog_name, breed,
    city, region, action_label, action_url, contact_note, image_url, verified,
    created_at, updated_at, published_at, created_by, updated_by
  ) VALUES (?, ?, 'adopcia', 'published', ?, ?, ?, ?, ?, ?, ?, 'Chcem pomôcť', ?, ?, ?, 1, ?, ?, ?, 'ci-adoption-staging', 'ci-adoption-staging')`);
  manifest.ready.forEach((row, index) => {
    const createdAt = `2026-08-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`;
    insert.run(
      row.slug, row.title, row.excerpt, row.description ?? `CI legacy description for ${row.slug}`,
      row.organization, row.dogName, row.breed ?? `CI legacy breed for ${row.slug}`,
      row.city, row.region, row.actionUrl, row.contactNote ?? "", row.imageUrl,
      createdAt, "2026-09-13T00:00:00.000Z", createdAt,
    );
  });

  const legacyRows = db.prepare(`SELECT category, slug, status, excerpt, description,
    dog_name AS dogName, breed, image_url AS imageUrl FROM help_cases WHERE category = 'adopcia'`).all();
  const identities = Object.values(ADOPTION_ORGANIZATION_IDENTITIES);
  const organizations = db.prepare(`SELECT id, import_key AS importKey, slug, name FROM help_organizations
    WHERE import_key IN (?, ?, ?, ?)`).all(...identities.map((identity) => identity.importKey));
  const report = preflightAdoptionMigration(manifest, legacyRows, organizations, []);
  if (report.ready !== 36 || report.canonicalMappings !== 36 || report.holdCandidatesImported !== 0) {
    throw new Error("CI adoption staging prerequisite preflight did not produce the exact safe cohort.");
  }
  console.log("[adoption-staging-ci] LOCAL CI ONLY: 36 published legacy prerequisites; preflight 36/36.");
} finally {
  db.close();
}
