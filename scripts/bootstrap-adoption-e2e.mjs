#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_PREFIX = "e2e-adoption-";
const FIXTURE_SLUGS = [
  "e2e-adoption-rex-active",
  "e2e-adoption-luna-reserved",
  "e2e-adoption-draft-private",
  "e2e-adoption-adopted-private",
  "e2e-adoption-archived-private",
];
const ADOPTION_MIGRATION = "drizzle/0034_adoption_dogs_foundation.sql";
const LOCAL_D1_DIRECTORY = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const REQUIRED_ADOPTION_COLUMNS = [
  "id", "name", "slug", "status", "sex", "birth_date", "approximate_age_months", "size", "weight", "breed_id", "breed_name",
  "breed_mix", "color", "region", "district", "city", "organization_id", "organization_name", "organization_slug", "main_image",
  "gallery_json", "short_description", "description", "temperament", "activity_level", "suitable_for_children", "suitable_for_dogs",
  "suitable_for_cats", "suitable_for_other_animals", "apartment_suitable", "beginner_suitable", "needs_experienced_owner",
  "vaccination_status", "chipped", "neutered", "health_notes", "special_needs", "adoption_requirements", "external_source_url",
  "contact_email", "contact_phone", "contact_url", "search_text", "published_at", "last_verified_at", "created_at", "updated_at",
  "created_by", "updated_by",
];

function assertLocalOnly() {
  const baseUrl = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:5173");
  const localHost = baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost";
  if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== "1" || process.env.NODE_ENV === "production" || baseUrl.protocol !== "http:" || !localHost) {
    throw new Error("Refusing to seed adoption fixtures outside the guarded local E2E environment.");
  }
}

function waitForLocalD1() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (existsSync(LOCAL_D1_DIRECTORY)) {
      const files = readdirSync(LOCAL_D1_DIRECTORY).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
      if (files.length === 1) return resolve(LOCAL_D1_DIRECTORY, files[0]);
      if (files.length > 1) throw new Error(`Expected one isolated local D1 file, found ${files.length}.`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Local D1 file was not created. Start the local Vite/Cloudflare server first.");
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(table));
}

function migrationStatements(source) {
  return source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

function addIfNotExists(statement) {
  if (/^CREATE UNIQUE INDEX\b/i.test(statement)) return statement.replace(/^CREATE UNIQUE INDEX\b/i, "CREATE UNIQUE INDEX IF NOT EXISTS");
  if (/^CREATE INDEX\b/i.test(statement)) return statement.replace(/^CREATE INDEX\b/i, "CREATE INDEX IF NOT EXISTS");
  return statement;
}

function materializeManagedBreedsSchema(db) {
  const migrations = readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort();
  let createFound = tableExists(db, "managed_breeds");

  for (const name of migrations) {
    const statements = migrationStatements(readFileSync(resolve("drizzle", name), "utf8"));
    for (const statement of statements) {
      if (/^CREATE TABLE [`"]?managed_breeds[`"]?\s*\(/i.test(statement)) {
        if (!createFound) {
          db.exec(statement);
          createFound = true;
        }
        continue;
      }
      if (!createFound) continue;
      if (/^ALTER TABLE [`"]?managed_breeds[`"]? ADD\b/i.test(statement)) {
        try { db.exec(statement); }
        catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
        continue;
      }
      if (/^CREATE (?:UNIQUE )?INDEX\b/i.test(statement) && /managed_breeds/i.test(statement)) {
        db.exec(addIfNotExists(statement));
      }
    }
  }

  if (!tableExists(db, "managed_breeds")) throw new Error("Could not materialize managed_breeds for the local adoption fixture.");
}

function applyCurrentAdoptionSchema(db) {
  const migration = readFileSync(ADOPTION_MIGRATION, "utf8").trim();
  if (!tableExists(db, "adoption_dogs")) {
    db.exec(migration);
    return;
  }

  const columns = new Set(db.prepare("PRAGMA table_info(adoption_dogs)").all().map((column) => column.name));
  const missing = REQUIRED_ADOPTION_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length) {
    const rows = db.prepare("SELECT slug FROM adoption_dogs LIMIT 101").all();
    if (rows.some((row) => typeof row.slug !== "string" || !row.slug.startsWith(FIXTURE_PREFIX))) {
      throw new Error(`Local adoption schema is stale (${missing.join(", ")}) and contains non-E2E rows; refusing to rebuild it.`);
    }
    db.exec("DROP TABLE adoption_dogs");
    db.exec(migration);
    return;
  }

  for (const match of migration.matchAll(/CREATE (?:UNIQUE )?INDEX[\s\S]*?;/gi)) db.exec(addIfNotExists(match[0]));
}

function normalizeSearchText(parts) {
  return parts.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fixture({ name, slug, status, sex, months, size, weight, breedName, breedMix, region, district, city, organization, shortDescription, description, temperament, children, dogs, cats, color }) {
  const now = new Date().toISOString();
  return {
    name,
    slug,
    status,
    sex,
    approximate_age_months: months,
    size,
    weight,
    breed_id: null,
    breed_name: breedName,
    breed_mix: breedMix ? 1 : 0,
    color,
    region,
    district,
    city,
    organization_name: organization,
    main_image: null,
    gallery_json: "[]",
    short_description: shortDescription,
    description,
    temperament,
    activity_level: status === "ARCHIVED" ? "LOW" : "MEDIUM",
    suitable_for_children: children,
    suitable_for_dogs: dogs,
    suitable_for_cats: cats,
    suitable_for_other_animals: "UNKNOWN",
    apartment_suitable: 1,
    beginner_suitable: 1,
    needs_experienced_owner: 0,
    vaccination_status: "UP_TO_DATE",
    chipped: 1,
    neutered: 1,
    health_notes: "E2E profil bez známych zdravotných obmedzení.",
    special_needs: "",
    adoption_requirements: "Bezpečný domov a zodpovedná adopčná dohoda.",
    contact_email: "adoption-e2e@example.invalid",
    search_text: normalizeSearchText([name, breedName, region, district, city, organization, shortDescription, description]),
    published_at: status === "ACTIVE" || status === "RESERVED" ? now : null,
    last_verified_at: now,
    created_at: now,
    updated_at: now,
    created_by: "local-adoption-e2e",
    updated_by: "local-adoption-e2e",
  };
}

function seedFixtures(db) {
  const fixtures = [
    fixture({
      name: "E2E Rex", slug: FIXTURE_SLUGS[0], status: "ACTIVE", sex: "MALE", months: 30, size: "MEDIUM", weight: 24,
      breedName: "Labradorský retriever", breedMix: false, region: "Nitriansky kraj", district: "Nitra", city: "Nitra",
      organization: "E2E útulok Nitra", color: "čierna", children: "YES", dogs: "YES", cats: "CONDITIONAL",
      shortDescription: "Pokojný labrador pripravený na nový domov.",
      description: "Rex je deterministický lokálny fixture pre vyhľadávanie, filtre a verejný detail adopcie.",
      temperament: "Priateľský, pokojný a kontaktný.",
    }),
    fixture({
      name: "E2E Luna", slug: FIXTURE_SLUGS[1], status: "RESERVED", sex: "FEMALE", months: 18, size: "MEDIUM", weight: 19,
      breedName: "Kríženec ovčiaka", breedMix: true, region: "Žilinský kraj", district: "Žilina", city: "Žilina",
      organization: "E2E OZ Luna", color: "hnedá", children: "CONDITIONAL", dogs: "YES", cats: "NO",
      shortDescription: "Rezervovaná mladá sučka pre kontrolu verejného RESERVED stavu.",
      description: "Luna overuje, že rezervovaný profil zostáva verejný a dá sa filtrovať podľa stavu.",
      temperament: "Aktívna a učenlivá.",
    }),
    fixture({
      name: "E2E Draft Private", slug: FIXTURE_SLUGS[2], status: "DRAFT", sex: "MALE", months: 48, size: "LARGE", weight: 30,
      breedName: "Kríženec", breedMix: true, region: "Bratislavský kraj", district: "Bratislava II", city: "Bratislava",
      organization: "E2E neverejný draft", color: "sivá", children: "UNKNOWN", dogs: "UNKNOWN", cats: "UNKNOWN",
      shortDescription: "Neverejný draft fixture.", description: "Tento profil nesmie byť vo verejnom katalógu ani na detaile.", temperament: "Neuvedené.",
    }),
    fixture({
      name: "E2E Adopted Private", slug: FIXTURE_SLUGS[3], status: "ADOPTED", sex: "FEMALE", months: 60, size: "SMALL", weight: 9,
      breedName: "Kríženec teriéra", breedMix: true, region: "Trnavský kraj", district: "Trnava", city: "Trnava",
      organization: "E2E adoptovaný profil", color: "biela", children: "YES", dogs: "CONDITIONAL", cats: "UNKNOWN",
      shortDescription: "Neverejný adoptovaný fixture.", description: "Adoptovaný profil nesmie zostať vo verejnom katalógu.", temperament: "Pokojná.",
    }),
    fixture({
      name: "E2E Archived Private", slug: FIXTURE_SLUGS[4], status: "ARCHIVED", sex: "UNKNOWN", months: 84, size: "MEDIUM", weight: 17,
      breedName: "Kríženec špica", breedMix: true, region: "Košický kraj", district: "Košice I", city: "Košice",
      organization: "E2E archivovaný profil", color: "krémová", children: "UNKNOWN", dogs: "UNKNOWN", cats: "UNKNOWN",
      shortDescription: "Neverejný archivovaný fixture.", description: "Archivovaný profil nesmie byť verejne dostupný.", temperament: "Neuvedené.",
    }),
  ];

  const placeholders = FIXTURE_SLUGS.map(() => "?").join(", ");
  db.prepare(`DELETE FROM adoption_dogs WHERE slug IN (${placeholders})`).run(...FIXTURE_SLUGS);

  for (const row of fixtures) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO adoption_dogs (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
  }

  const publicRows = db.prepare("SELECT slug, status FROM adoption_dogs WHERE slug LIKE 'e2e-adoption-%' AND status IN ('ACTIVE', 'RESERVED') ORDER BY slug").all();
  if (publicRows.length !== 2) throw new Error(`Expected 2 public adoption fixtures, got ${publicRows.length}.`);
  const privateRows = db.prepare("SELECT slug, status FROM adoption_dogs WHERE slug LIKE 'e2e-adoption-%' AND status IN ('DRAFT', 'ADOPTED', 'ARCHIVED') ORDER BY slug").all();
  if (privateRows.length !== 3) throw new Error(`Expected 3 private adoption fixtures, got ${privateRows.length}.`);
}

assertLocalOnly();
const databasePath = waitForLocalD1();
const db = new DatabaseSync(databasePath);
try {
  db.exec("PRAGMA foreign_keys = ON");
  materializeManagedBreedsSchema(db);
  applyCurrentAdoptionSchema(db);
  seedFixtures(db);
  console.log("[adoption-e2e] LOCAL FIXTURES ONLY: 2 public (ACTIVE + RESERVED), 3 private (DRAFT + ADOPTED + ARCHIVED), 2 fallback breed names.");
} finally {
  db.close();
}
