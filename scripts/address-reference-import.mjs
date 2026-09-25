import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  ADDRESS_SOURCE_CRS,
  EXPECTED_NUTS3,
  buildMunicipalityMap,
  normalizeSearchText,
  validateAddressFeature,
} from "./address-reference-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = JSON.parse(await fs.readFile(path.join(ROOT, "config/address-reference-resources.json"), "utf8"));
const MAPPING = JSON.parse(await fs.readFile(path.join(ROOT, "data/address-reference/municipality-lau2-mapping.json"), "utf8"));
const SCHEMA = await fs.readFile(path.join(ROOT, "address-reference/schema.sql"), "utf8");
const WORK_DIR = path.join(ROOT, ".address-reference");
const SOURCE_DIR = path.join(WORK_DIR, "sources");
const REPORT_DIR = path.join(WORK_DIR, "reports");
const DB_PATH = path.join(WORK_DIR, "address-reference.sqlite");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
const command = process.argv[2] ?? "prepare";
const sourceDirOverride = arg("--source-dir");

function isoNow() {
  return new Date().toISOString();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "Psipedia-ADDRESS-DATA-1A/1.0 (+https://psipedia.sk)" },
  });
  assert.ok(response.ok && response.body, `download failed ${response.status}: ${url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const handle = await fs.open(destination, "w");
  try {
    for await (const chunk of response.body) await handle.write(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
}

function metadataDataset(metadata) {
  return (metadata?.["@graph"] ?? []).find((row) => row?.["@type"] === "dcat:Dataset");
}

function metadataTerms(metadata) {
  return (metadata?.["@graph"] ?? []).find((row) => row?.["@type"] === "leg:TermsOfUse");
}

function assertMetadataContract(metadata, code) {
  const dataset = metadataDataset(metadata);
  const terms = metadataTerms(metadata);
  assert.ok(dataset, `${code}: dcat:Dataset metadata missing`);
  assert.equal(dataset?.["dct:accrualPeriodicity"]?.iri, "http://publications.europa.eu/resource/authority/frequency/DAILY");
  assert.ok(dataset?.["dct:modified"]?.["@value"], `${code}: dct:modified missing`);
  const licence = CONFIG.license_uri;
  assert.equal(terms?.["leg:authorsWorkType"]?.iri, licence, `${code}: authors-work licence mismatch`);
  assert.equal(terms?.["leg:originalDatabaseType"]?.iri, licence, `${code}: original-database licence mismatch`);
  assert.equal(terms?.["leg:databaseProtectedBySpecialRightsType"]?.iri, licence, `${code}: sui-generis licence mismatch`);
  return dataset["dct:modified"]["@value"];
}

async function assertGeoJsonHeader(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    assert.ok(head.includes(ADDRESS_SOURCE_CRS), `${path.basename(filePath)} must declare OGC CRS84`);
    assert.ok(head.includes('"FeatureCollection"'), `${path.basename(filePath)} must be a FeatureCollection`);
  } finally {
    await handle.close();
  }
}

// Streaming parser specialized to the top-level GeoJSON features array.
// It holds at most one feature plus a small buffer in memory.
export async function* streamGeoJsonFeatures(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  let buffer = "";
  let inFeatures = false;
  let featureStart = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for await (const chunk of stream) {
    buffer += chunk;
    let index = 0;

    if (!inFeatures) {
      const marker = buffer.indexOf('"features"');
      if (marker < 0) {
        if (buffer.length > 8192) buffer = buffer.slice(-8192);
        continue;
      }
      const bracket = buffer.indexOf("[", marker);
      if (bracket < 0) continue;
      buffer = buffer.slice(bracket + 1);
      inFeatures = true;
    }

    while (index < buffer.length) {
      const char = buffer[index];
      if (featureStart < 0) {
        if (char === "{") {
          featureStart = index;
          depth = 1;
          inString = false;
          escape = false;
        } else if (char === "]") {
          return;
        }
        index += 1;
        continue;
      }

      if (inString) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          yield JSON.parse(buffer.slice(featureStart, index + 1));
          buffer = buffer.slice(index + 1);
          index = 0;
          featureStart = -1;
          continue;
        }
      }
      index += 1;
    }

    if (featureStart >= 0) {
      buffer = buffer.slice(featureStart);
      featureStart = 0;
    } else if (buffer.length > 8192) {
      buffer = buffer.slice(-8192);
    }
  }

  assert.equal(featureStart, -1, `truncated GeoJSON feature in ${filePath}`);
}

function openCandidateDatabase() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  return db;
}

function insertMapping(db, releaseId, mappingRows) {
  const insert = db.prepare(`INSERT INTO address_municipalities
    (release_id,lau2_id,name,lau1_id,lau1_name,nuts3_id,nuts3_name,normalized_search_name,match_method)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  db.exec("BEGIN");
  try {
    for (const row of mappingRows) {
      insert.run(
        releaseId,
        row.lau2_id,
        row.source_name,
        row.lau1_id,
        row.psipedia_district === "Nové Mesto n.Váhom" ? "Nové Mesto nad Váhom" : row.psipedia_district,
        row.nuts3_id,
        row.psipedia_region.replace(/ kraj$/, ""),
        normalizeSearchText(row.source_name),
        row.match_method,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function candidateReleaseId(sourceModified) {
  const newest = Object.values(sourceModified).sort().at(-1)?.replace(/[^0-9]/g, "").slice(0, 14) || Date.now().toString();
  return `rageo-${newest}`;
}

async function prepare() {
  await fs.rm(WORK_DIR, { recursive: true, force: true });
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const mappingById = buildMunicipalityMap(MAPPING);
  const sourceModified = {};
  const checksums = {};
  const sourceBytes = {};

  for (const code of EXPECTED_NUTS3) {
    assert.ok(CONFIG.expected_regions.includes(code), `unexpected NUTS3 ${code}`);
    const metadataPath = path.join(SOURCE_DIR, `address_by_nuts3_${code}.metadata.json`);
    const geoPath = path.join(SOURCE_DIR, `address_by_nuts3_${code}.geojson`);

    if (sourceDirOverride) {
      await fs.copyFile(path.join(sourceDirOverride, path.basename(metadataPath)), metadataPath);
      await fs.copyFile(path.join(sourceDirOverride, path.basename(geoPath)), geoPath);
    } else {
      await download(CONFIG.metadata_pattern.replace("{NUTS3}", code), metadataPath);
      await download(CONFIG.download_pattern.replace("{NUTS3}", code), geoPath);
    }

    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    sourceModified[code] = assertMetadataContract(metadata, code);
    await assertGeoJsonHeader(geoPath);
    checksums[code] = await sha256File(geoPath);
    sourceBytes[code] = (await fs.stat(geoPath)).size;
  }

  const releaseId = candidateReleaseId(sourceModified);
  const db = openCandidateDatabase();
  const now = isoNow();
  db.prepare(`INSERT INTO address_dataset_releases
    (id,provider,dataset,catalog_url,source_modified_max,downloaded_at,schema_version,importer_version,license,integrity_status,status,provenance_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'PENDING','CANDIDATE',?,?)`)
    .run(
      releaseId,
      CONFIG.provider,
      CONFIG.dataset,
      CONFIG.catalog_url,
      Object.values(sourceModified).sort().at(-1),
      now,
      "1",
      "1",
      CONFIG.license,
      JSON.stringify({ license_uri: CONFIG.license_uri, attribution: CONFIG.attribution, regional_sha256: checksums }),
      now,
    );

  const regionInsert = db.prepare(`INSERT INTO address_release_regions
    (release_id,nuts3_id,metadata_url,download_url,source_modified_at,sha256,source_bytes,address_count)
    VALUES (?,?,?,?,?,?,?,0)`);
  for (const code of EXPECTED_NUTS3) {
    regionInsert.run(
      releaseId,
      code,
      CONFIG.metadata_pattern.replace("{NUTS3}", code),
      CONFIG.download_pattern.replace("{NUTS3}", code),
      sourceModified[code],
      checksums[code],
      sourceBytes[code],
    );
  }

  insertMapping(db, releaseId, MAPPING.entries);

  const insertPart = db.prepare(`INSERT OR IGNORE INTO address_municipality_parts
    (release_id,municipality_part_id,lau2_id,name) VALUES (?,?,?,?)`);
  const insertStreet = db.prepare(`INSERT OR IGNORE INTO address_streets
    (release_id,street_id,lau2_id,name,normalized_search_name) VALUES (?,?,?,?,?)`);
  const insertAddress = db.prepare(`INSERT INTO address_points
    (release_id,source_address_id,source_address_uri,lau2_id,municipality_part_id,street_id,
     property_registration_number,orientation_number,postal_code,longitude,latitude,source_crs,valid_from,address_format)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  let addressCount = 0;
  const regionCounts = Object.fromEntries(EXPECTED_NUTS3.map((code) => [code, 0]));
  const seenAddressIds = new Set();

  db.exec("BEGIN");
  try {
    for (const code of EXPECTED_NUTS3) {
      const geoPath = path.join(SOURCE_DIR, `address_by_nuts3_${code}.geojson`);
      for await (const feature of streamGeoJsonFeatures(geoPath)) {
        const row = validateAddressFeature(feature, mappingById);
        assert.equal(row.nuts3_id, code, `feature NUTS3 mismatch in ${code}`);
        assert.equal(seenAddressIds.has(row.source_address_id), false, `duplicate address identifier ${row.source_address_id}`);
        seenAddressIds.add(row.source_address_id);

        if (row.municipality_part_id) {
          insertPart.run(releaseId, row.municipality_part_id, row.lau2_id, row.municipality_part_name);
        }
        if (row.street_id) {
          insertStreet.run(releaseId, row.street_id, row.lau2_id, row.street_name, normalizeSearchText(row.street_name));
        }
        insertAddress.run(
          releaseId,
          row.source_address_id,
          row.source_address_uri,
          row.lau2_id,
          row.municipality_part_id,
          row.street_id,
          row.property_registration_number,
          row.orientation_number,
          row.postal_code,
          row.longitude,
          row.latitude,
          row.source_crs,
          row.valid_from,
          row.address_format,
        );
        addressCount += 1;
        regionCounts[code] += 1;

        if (addressCount % 25000 === 0) {
          db.exec("COMMIT; BEGIN");
          console.log(`[address-reference] ${addressCount} addresses validated`);
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.prepare("UPDATE address_dataset_releases SET integrity_status='QUARANTINED',status='QUARANTINED',failure_reason=? WHERE id=?")
      .run(String(error?.message ?? error), releaseId);
    throw error;
  }

  for (const [code, count] of Object.entries(regionCounts)) {
    db.prepare("UPDATE address_release_regions SET address_count=? WHERE release_id=? AND nuts3_id=?").run(count, releaseId, code);
  }

  const streetCount = Number(db.prepare("SELECT COUNT(*) AS c FROM address_streets WHERE release_id=?").get(releaseId).c);
  const municipalityCount = Number(db.prepare("SELECT COUNT(*) AS c FROM address_municipalities WHERE release_id=?").get(releaseId).c);
  const duplicateAddresses = Number(db.prepare(`SELECT COUNT(*) AS c FROM (
    SELECT source_address_id FROM address_points WHERE release_id=? GROUP BY source_address_id HAVING COUNT(*)>1
  )`).get(releaseId).c);
  const orphanMunicipalities = Number(db.prepare(`SELECT COUNT(*) AS c FROM address_points a
    LEFT JOIN address_municipalities m ON m.release_id=a.release_id AND m.lau2_id=a.lau2_id
    WHERE a.release_id=? AND m.lau2_id IS NULL`).get(releaseId).c);
  const orphanStreets = Number(db.prepare(`SELECT COUNT(*) AS c FROM address_points a
    LEFT JOIN address_streets s ON s.release_id=a.release_id AND s.street_id=a.street_id
    WHERE a.release_id=? AND a.street_id IS NOT NULL AND s.street_id IS NULL`).get(releaseId).c);

  assert.equal(municipalityCount, 2927, "candidate must contain exactly 2,927 mapped municipalities");
  assert.equal(duplicateAddresses, 0, "candidate contains duplicate source address IDs");
  assert.equal(orphanMunicipalities, 0, "candidate contains unmapped municipalities");
  assert.equal(orphanStreets, 0, "candidate contains orphan streets");
  assert.ok(addressCount > 0, "candidate contains no addresses");

  db.prepare(`UPDATE address_dataset_releases
    SET integrity_status='PASS',municipality_count=?,street_count=?,address_count=? WHERE id=?`)
    .run(municipalityCount, streetCount, addressCount, releaseId);

  const report = {
    release_id: releaseId,
    state: "CANDIDATE_VALIDATED",
    provider: CONFIG.provider,
    dataset: CONFIG.dataset,
    license: CONFIG.license,
    source_crs: CONFIG.crs,
    source_modified: sourceModified,
    sha256: checksums,
    source_bytes: sourceBytes,
    municipality_count: municipalityCount,
    street_count: streetCount,
    address_count: addressCount,
    integrity: { duplicate_addresses: duplicateAddresses, orphan_municipalities: orphanMunicipalities, orphan_streets: orphanStreets },
    production_writes: false,
  };
  await fs.writeFile(path.join(REPORT_DIR, "candidate-report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(REPORT_DIR, "candidate-report.md"), [
    "# ADDRESS-DATA-1A candidate report",
    "",
    `- release: ${releaseId}`,
    `- municipalities: ${municipalityCount}`,
    `- streets: ${streetCount}`,
    `- addresses: ${addressCount}`,
    `- license: ${CONFIG.license}`,
    `- CRS: ${CONFIG.crs}`,
    "- production writes: NO",
    "",
  ].join("\n"));
  db.close();
  console.log(JSON.stringify(report, null, 2));
}

async function activateLocal() {
  const releaseId = arg("--release-id");
  assert.ok(releaseId, "--release-id is required");
  const db = openCandidateDatabase();
  const candidate = db.prepare("SELECT id,integrity_status,status FROM address_dataset_releases WHERE id=?").get(releaseId);
  assert.ok(candidate, "candidate release does not exist");
  assert.equal(candidate.integrity_status, "PASS", "candidate integrity must PASS");
  assert.equal(candidate.status, "CANDIDATE", "only CANDIDATE may be activated");
  const runtime = db.prepare("SELECT active_release_id,previous_good_release_id FROM address_reference_runtime WHERE singleton_id=1").get();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE address_reference_runtime
      SET previous_good_release_id=active_release_id,active_release_id=?,updated_at=?
      WHERE singleton_id=1`).run(releaseId, isoNow());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(JSON.stringify({ active_release_id: releaseId, previous_good_release_id: runtime.active_release_id ?? null }, null, 2));
  db.close();
}

if (command === "prepare") await prepare();
else if (command === "activate-local") await activateLocal();
else throw new Error(`unknown command: ${command}`);
