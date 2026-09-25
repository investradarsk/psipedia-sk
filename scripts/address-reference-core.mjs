import assert from "node:assert/strict";

export const ADDRESS_SOURCE_CRS = "urn:ogc:def:crs:OGC:1.3:CRS84";
export const EXPECTED_NUTS3 = Object.freeze(["SK010","SK021","SK022","SK023","SK031","SK032","SK041","SK042"]);
export const ALLOWED_SOURCE_PROPERTIES = Object.freeze(new Set([
  "objectid","uri_identifier","identifier","issuingcountry","fulladdress","geometry_text",
  "streetname","street_id","postalcode","orientationnumber","propertyregistrationnumber",
  "district_name","district_id","lau2_name","lau2_id","lau1_name","lau1_id",
  "nuts3_name","nuts3_id","validfrom","publisher","ico","annotation"
]));

export function normalizeCanonicalText(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value) {
  return normalizeCanonicalText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePostalCode(value) {
  const digits = String(value ?? "").replace(/\s+/g, "");
  assert.match(digits, /^\d{5}$/, "postalcode must contain exactly five digits");
  return digits;
}

export function formatPostalCode(value) {
  const digits = normalizePostalCode(value);
  return `${digits.slice(0,3)} ${digits.slice(3)}`;
}

export function formatHouseNumber(registrationNumber, orientationNumber) {
  const registration = normalizeCanonicalText(registrationNumber);
  const orientation = normalizeCanonicalText(orientationNumber);
  assert.ok(registration, "property registration number is required");
  return orientation ? `${registration}/${orientation}` : registration;
}

function nullableSourceText(value) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeCanonicalText(value);
}

export function validateAddressFeature(feature, municipalityById) {
  assert.equal(feature?.type, "Feature", "source row must be a GeoJSON Feature");
  assert.equal(feature?.geometry?.type, "Point", "address geometry must be Point");
  assert.ok(Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2, "Point coordinates are required");
  const [longitude, latitude] = feature.geometry.coordinates;
  assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180, "longitude is out of range");
  assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90, "latitude is out of range");

  const properties = feature?.properties;
  assert.ok(properties && typeof properties === "object" && !Array.isArray(properties), "source properties are required");
  const unexpected = Object.keys(properties).filter((key) => !ALLOWED_SOURCE_PROPERTIES.has(key));
  assert.deepEqual(unexpected, [], `unexpected source properties: ${unexpected.join(", ")}`);

  const sourceAddressId = normalizeCanonicalText(properties.identifier);
  assert.ok(sourceAddressId, "identifier is required");
  const sourceAddressUri = normalizeCanonicalText(properties.uri_identifier);
  assert.equal(sourceAddressUri, `https://data.gov.sk/id/physical-address/${sourceAddressId}`, "uri_identifier must match identifier");

  const lau2Id = normalizeCanonicalText(properties.lau2_id);
  const mapping = municipalityById.get(lau2Id);
  assert.ok(mapping, `unmapped authoritative municipality ${lau2Id}`);
  assert.equal(normalizeCanonicalText(properties.lau2_name), mapping.source_name, `LAU2 name mismatch for ${lau2Id}`);
  assert.equal(normalizeCanonicalText(properties.lau1_id), mapping.lau1_id, `LAU1 mismatch for ${lau2Id}`);
  assert.equal(normalizeCanonicalText(properties.nuts3_id), mapping.nuts3_id, `NUTS3 mismatch for ${lau2Id}`);

  const streetId = nullableSourceText(properties.street_id);
  const streetName = nullableSourceText(properties.streetname);
  assert.equal(Boolean(streetId), Boolean(streetName), "street_id and streetname must be both present or both null");
  const addressFormat = streetId ? "STREET" : "MUNICIPALITY_NUMBER";

  const municipalityPartId = nullableSourceText(properties.district_id);
  const municipalityPartName = nullableSourceText(properties.district_name);
  assert.equal(Boolean(municipalityPartId), Boolean(municipalityPartName), "municipality-part id/name must be both present or both null");

  return Object.freeze({
    source_address_id: sourceAddressId,
    source_address_uri: sourceAddressUri,
    lau2_id: lau2Id,
    municipality_part_id: municipalityPartId,
    municipality_part_name: municipalityPartName,
    street_id: streetId,
    street_name: streetName,
    property_registration_number: normalizeCanonicalText(properties.propertyregistrationnumber),
    orientation_number: nullableSourceText(properties.orientationnumber),
    postal_code: normalizePostalCode(properties.postalcode),
    longitude,
    latitude,
    source_crs: ADDRESS_SOURCE_CRS,
    valid_from: normalizeCanonicalText(properties.validfrom),
    address_format: addressFormat,
  });
}

export function buildMunicipalityMap(manifest) {
  assert.equal(manifest?.counts?.entries, 2927, "mapping manifest must declare 2,927 entries");
  assert.equal(manifest?.counts?.unmapped, 0, "mapping manifest must be complete");
  const map = new Map();
  for (const row of manifest.entries ?? []) {
    assert.ok(row.lau2_id && row.lau1_id && row.nuts3_id, "mapping row requires official codes");
    assert.equal(map.has(row.lau2_id), false, `duplicate LAU2 mapping ${row.lau2_id}`);
    map.set(row.lau2_id, row);
  }
  assert.equal(map.size, 2927, "mapping manifest must contain 2,927 unique LAU2 IDs");
  return map;
}

export function activationTransition(runtime, candidateReleaseId) {
  assert.ok(candidateReleaseId, "candidate release id is required");
  return Object.freeze({
    active_release_id: candidateReleaseId,
    previous_good_release_id: runtime?.active_release_id ?? null,
  });
}

export function rollbackTransition(runtime) {
  assert.ok(runtime?.previous_good_release_id, "previous good release is required for rollback");
  return Object.freeze({
    active_release_id: runtime.previous_good_release_id,
    previous_good_release_id: runtime.active_release_id ?? null,
  });
}

export function retiredSourceIds(previousIds, currentIds) {
  const current = new Set(currentIds);
  return [...new Set(previousIds)].filter((id) => !current.has(id)).sort();
}
