/**
 * Local test and historical migration diagnostics only.
 * Reads immutable SQL migration 0038; never imports or reintroduces legacy JSON.
 * This is NOT a live source of public/Admin/Notion data.
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SQL_FILE = new URL("../../drizzle/0038_adoption_staging_data.sql", import.meta.url);
const END_OF_SOURCE = "\nDROP TABLE IF EXISTS __psipedia_adoption_staging_guard_0038;";
const ORGANIZATION_LABELS = Object.freeze({
  "help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p": "U.V.P. Košice",
  "help-org:pomoc-dog-azyl-o-z": "OZ Dog Azyl",
  "help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava": "Útulok Trnava",
  "help-org:pomoc-oz-pes-v-nudzi": "OZ Pes v núdzi",
});
const HOLD_SLUGS = Object.freeze([
  "charlie-hlada-novy-domov",
  "kira-hlada-novy-domov",
  "aisha-hlada-novy-domov",
  "max-hlada-novy-domov",
]);

export function readCanonicalAdoptionStagingRows() {
  const migration = readFileSync(SQL_FILE, "utf8");
  const boundary = migration.indexOf(END_OF_SOURCE);
  if (boundary < 0 || !migration.includes("INSERT INTO __psipedia_adoption_staging_source_0038")) {
    throw new Error("Immutable 0038 SQL staging source was not found.");
  }
  const db = new DatabaseSync(":memory:");
  let rows;
  try {
    // Only create and populate a temporary local staging table. Never execute
    // the rest of 0038, which requires the actual D1 and legacy preconditions.
    db.exec(migration.slice(0, boundary));
    rows = db.prepare("SELECT * FROM __psipedia_adoption_staging_source_0038 ORDER BY rowid").all();
  } finally {
    db.close();
  }
  if (rows.length !== 36 || new Set(rows.map(row => row.slug)).size !== 36) {
    throw new Error("Immutable 0038 SQL cohort must contain 36 unique adoptions.");
  }
  return rows;
}

function ageNote(row) {
  if (row.birth_date) {
    const [y,m,d] = row.birth_date.split("-");
    return `nar. ${d}.${m}.${y}`;
  }
  if (Number.isSafeInteger(row.approximate_age_months) && row.approximate_age_months >= 0) {
    return `${row.approximate_age_months} mesiacov`;
  }
  throw new Error(`Cannot derive age fixture for ${row.slug}`);
}

function sizeNote(row) {
  const names = { SMALL:"malý", MEDIUM:"stredný", LARGE:"veľký", GIANT:"obrovský", UNKNOWN:"neznámy" };
  const label = names[row.size];
  if (!label) throw new Error(`Unexpected staging size ${row.size}`);
  return row.weight == null ? label : `${label} (${row.weight} kg)`;
}

export function getReviewedAdoptionManifest() {
  const ready = readCanonicalAdoptionStagingRows().map(row => {
    const organization = ORGANIZATION_LABELS[row.organization_import_key];
    if (!organization) throw new Error(`Unknown canonical organization for ${row.slug}`);
    return {
      title: `${row.name} hľadá nový domov`,
      slug: row.slug,
      excerpt: row.short_description,
      description: row.use_legacy_description ? null : row.description,
      organization,
      dogName: row.name,
      // For legacy-dependent columns, local-only fixtures deliberately use
      // placeholder values rather than recreating a second historical dataset.
      breed: row.use_legacy_breed ? null : row.breed_name,
      ageNote: ageNote(row),
      sex: row.sex === "MALE" ? "samec" : row.sex === "FEMALE" ? "samica" : "INVALID",
      size: sizeNote(row),
      city: row.city,
      district: row.district || null,
      region: row.region,
      actionUrl: row.contact_url,
      contactNote: [row.contact_phone,row.contact_email].filter(Boolean).join(" "),
      imageUrl: row.main_image,
      sourceUrl: row.external_source_url,
      verifiedAt: row.last_verified_at,
    };
  });
  return {
    sourceWorkbook: "immutable SQL migration 0038 (local fixture)",
    verificationDate: "2026-09-13",
    readyCount: 36,
    holdCount: 4,
    holdSlugs: [...HOLD_SLUGS],
    ready,
  };
}
