import assert from "node:assert/strict";
import test from "node:test";
import { SLOVAK_REGIONS, getSlovakDistricts, getSlovakMunicipalities } from "../lib/slovakia-locations.ts";
import { validateInternalAddress, planInternalAddressPatch, googlePlaceConfirmationState } from "../lib/admin-address-contract.ts";
import { adaptDirectoryAddress, adaptEventAddress, adaptOrganizationAddress, adaptAddressGeo, adaptGoogleAddressProposal, projectLegacyAddressPatch } from "../lib/admin-address-adapters.ts";
const physical = {
  mode: "PHYSICAL", region: "Prešovský kraj", district: "Prešov", city: "Prešov",
  postalCode: "08001", street: "Hlavná", houseNumber: "1127/21", addressFormat: "STREET",
};
const profile = { id: 1, ...physical, address: "Pôvodný verejný text", serviceAddressConfirmation: "LEGACY_UNCONFIRMED", updatedAt: "revision-1" };
const snapshot = (geo = adaptAddressGeo(null)) => adaptDirectoryAddress(profile, geo);
const point = {
  googlePlaceId: "google-id", googlePlaceSourceFingerprint: "source", sourceFingerprint: "source",
  resolvedSourceFingerprint: "source", geocodeStatus: "RESOLVED", publicVisibility: "EXACT_PUBLIC",
  publicPrecision: "EXACT", manualOverride: false,
};

test("all 8 regions, 79 districts and 2927 municipality entries use the existing hierarchy", () => {
  assert.equal(SLOVAK_REGIONS.length, 8);
  let districts = 0, cities = 0;
  for (const region of SLOVAK_REGIONS) for (const district of getSlovakDistricts(region)) {
    districts++;
    for (const city of getSlovakMunicipalities(district)) {
      cities++;
      const result = validateInternalAddress({ region, district, city });
      assert.deepEqual(result.issues, [], `${region}/${district}/${city}`);
      assert.equal(result.address.city, city);
    }
  }
  assert.equal(districts, 79); assert.equal(cities, 2927);
});
test("formatting aliases normalize diacritics, case, whitespace, hyphens and abbreviated canonical punctuation", () => {
  const result = validateInternalAddress({ region: "  trenciansky  ", district: "Nove Mesto n. Vahom", city: "Nove Mesto nad Vahom" });
  assert.deepEqual(result.issues, []);
  assert.equal(result.address.region, "Trenčiansky kraj");
  assert.equal(result.address.district, "Nové Mesto n.Váhom");
  const cityPart = validateInternalAddress({ region: "bratislavsky kraj", district: "Bratislava II", city: "Bratislava–Ruzinov" });
  assert.equal(cityPart.address.city, "Bratislava - Ružinov");
  assert.equal(validateInternalAddress({ region: "Presov", district: "Prešov", city: "Prešov" }).issues[0].field, "region");
});
test("decomposed Unicode is canonicalized without fuzzy guessing", () => {
  assert.equal(validateInternalAddress({ ...physical, city: "Prešov".normalize("NFD") }).address.city, "Prešov");
  assert.equal(validateInternalAddress({ ...physical, city: "Prešo" }).address.city, null);
});
test("wrong parent combinations and missing parents never populate canonical children", () => {
  for (const input of [{ ...physical, region: "Košický kraj" }, { ...physical, city: "Košice - Juh" }, { city: "Prešov" }]) {
    const result = validateInternalAddress(input);
    assert.equal(result.completeness, "NEEDS_REVIEW");
    assert.ok(result.issues.some((i) => i.code === "INVALID_HIERARCHY"));
    assert.equal(result.address.city, null);
  }
});
test("postal leading zero and textual slash house numbers survive normalization", () => {
  for (const houseNumber of ["1127/21", "12/A"]) {
    const result = validateInternalAddress({ ...physical, houseNumber });
    assert.equal(result.address.postalCode, "080 01");
    assert.equal(result.address.houseNumber, houseNumber);
    assert.equal(result.completeness, "COMPLETE");
  }
  assert.equal(validateInternalAddress({ ...physical, postalCode: 8001 }).completeness, "NEEDS_REVIEW");
  assert.equal(validateInternalAddress({ ...physical, postalCode: "8001" }).completeness, "NEEDS_REVIEW");
});
test("partial, municipality-number and numberless addresses reuse directory evaluator", () => {
  assert.equal(validateInternalAddress({}).completeness, "MISSING");
  assert.equal(validateInternalAddress({ ...physical, postalCode: null }).completeness, "INCOMPLETE");
  assert.equal(validateInternalAddress({ ...physical, street: null, addressFormat: "MUNICIPALITY_NUMBER" }).completeness, "COMPLETE");
  assert.equal(validateInternalAddress({ ...physical, houseNumber: null }).completeness, "COMPLETE");
  assert.equal(validateInternalAddress({ ...physical, street: null }).completeness, "INCOMPLETE");
});
test("online and service areas are distinct from physical completeness", () => {
  assert.equal(validateInternalAddress({ mode: "ONLINE" }).completeness, "COMPLETE");
  assert.equal(validateInternalAddress({ ...physical, mode: "ONLINE" }).completeness, "NEEDS_REVIEW");
  assert.equal(validateInternalAddress({ mode: "SERVICE_AREA", region: physical.region, district: physical.district, city: physical.city }).completeness, "COMPLETE");
});
test("invalid types, country, format, mode and control characters require review", () => {
  for (const patch of [{ street: 12 }, { street: "A\nB" }, { city: {} }, { mode: "UNKNOWN" }, { countryCode: "CZ" }, { addressFormat: "BOGUS" }]) {
    assert.equal(validateInternalAddress({ ...physical, ...patch }).completeness, "NEEDS_REVIEW");
  }
});
test("missing, omitted, undefined and explicit null clear have different semantics", () => {
  const base = snapshot();
  for (const patch of [{}, { street: undefined }, { postalCode: "080 01" }, { street: " hlavná " }]) {
    const decision = planInternalAddressPatch(base, patch);
    assert.equal(decision.allowed, true); assert.deepEqual(decision.changes, {}); assert.deepEqual(decision.next, base.address);
  }
  const clear = planInternalAddressPatch(base, { houseNumber: null });
  assert.equal(clear.allowed, true); assert.equal(clear.next.houseNumber, null);
  assert.deepEqual(projectLegacyAddressPatch("DIRECTORY_PROFILE", clear), { houseNumber: "" });
  assert.equal(planInternalAddressPatch(base, { street: "" }).allowed, false);
  assert.equal(planInternalAddressPatch(base, { mode: null }).allowed, false);
});
test("invalid attempts are rejected even when normalization would yield an unchanged null", () => {
  const base = adaptEventAddress({ id: 3, city: "", region: "", address: "" });
  assert.equal(planInternalAddressPatch(base, { district: "BOGUS" }).allowed, false);
});
test("complete proposed address does not manufacture Google confirmation or mutate source", () => {
  const base = snapshot(); const before = JSON.stringify(base);
  const result = planInternalAddressPatch(base, { houseNumber: "12/A" });
  assert.equal(result.allowed, true); assert.equal(googlePlaceConfirmationState(base.geo), "NONE");
  assert.equal(JSON.stringify(base), before); assert.equal(base.serviceLocationConfirmed, false);
});
test("current and stale Google anchors block replacement and explicit clears", () => {
  for (const p of [point, { ...point, sourceFingerprint: "new" }, { ...point, publicVisibility: "HIDDEN" }]) {
    const base = snapshot(adaptAddressGeo(p));
    for (const patch of [{ street: "Iná" }, { houseNumber: null }, { mode: "SERVICE_AREA" }, { editorialAddress: "Iná adresa" }]) {
      const result = planInternalAddressPatch(base, patch);
      assert.equal(result.allowed, false); assert.ok(result.conflicts.some((c) => c.code === "GOOGLE_PLACE_LOCKED"));
      assert.deepEqual(result.next, base.address);
    }
    assert.equal(planInternalAddressPatch(base, { street: "Hlavná" }).allowed, true);
  }
  assert.equal(googlePlaceConfirmationState(adaptAddressGeo(point)), "CURRENT");
  assert.equal(googlePlaceConfirmationState(adaptAddressGeo({ ...point, resolvedSourceFingerprint: null })), "STALE");
});
test("manual, private and confirmed service location protections are independent", () => {
  for (const [geo, code] of [[adaptAddressGeo({ ...point, googlePlaceId: null, manualOverride: true }), "MANUAL_GEO_LOCKED"], [adaptAddressGeo(null, true), "PRIVATE_LOCATION_LOCKED"], [adaptAddressGeo({ ...point, googlePlaceId: null, publicVisibility: "HIDDEN" }), "PRIVATE_LOCATION_LOCKED"]]) {
    assert.ok(planInternalAddressPatch(snapshot(geo), { street: "Nová" }).conflicts.some((c) => c.code === code));
  }
  const confirmed = adaptDirectoryAddress({ ...profile, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" });
  assert.ok(planInternalAddressPatch(confirmed, { street: "Nová" }).conflicts.some((c) => c.code === "CONFIRMED_ADDRESS_LOCKED"));
});
test("GEO/identity/privacy injection is rejected and snapshot protection stays untouched", () => {
  const base = snapshot(adaptAddressGeo(point)); const original = structuredClone(base);
  for (const patch of [{ googlePlaceId: null }, { sourceFingerprint: "new" }, { publicVisibility: "EXACT_PUBLIC" }, { manualOverride: false }, { targetId: 99 }, { __proto__: null, latitude: 42 }]) {
    assert.equal(planInternalAddressPatch(base, patch).allowed, false);
  }
  assert.deepEqual(base, original);
});
test("missing-only proposals do not replace populated fields or accept clear commands", () => {
  const base = snapshot();
  assert.equal(planInternalAddressPatch(base, { street: "Nová" }, { missingOnly: true }).allowed, false);
  assert.equal(planInternalAddressPatch(base, { houseNumber: null }, { missingOnly: true }).allowed, false);
  const missing = adaptDirectoryAddress({ ...profile, houseNumber: "" });
  assert.equal(planInternalAddressPatch(missing, { houseNumber: "12/A" }, { missingOnly: true }).allowed, true);
});
test("stale revision conflicts even for a no-op; this helper never persists", () => {
  assert.ok(planInternalAddressPatch(snapshot(), {}, { expectedRevision: "old" }).conflicts.some((c) => c.code === "REVISION_CONFLICT"));
  assert.equal(planInternalAddressPatch(snapshot(), {}, { expectedRevision: "revision-1" }).allowed, true);
});
test("incomplete Google evidence omits absent components and has no confirmation authority", () => {
  const proposal = adaptGoogleAddressProposal({ street: "Nová", postalCode: "" });
  assert.deepEqual(proposal.fields, { street: "Nová" });
  const result = planInternalAddressPatch(snapshot(), proposal.fields);
  assert.equal(result.allowed, true); assert.equal(result.next.postalCode, "08001");
  assert.equal(result.next.houseNumber, "1127/21");
  assert.equal(proposal.validation.completeness, "INCOMPLETE");
  assert.equal(googlePlaceConfirmationState(snapshot().geo), "NONE");
});
test("Google locality is evidence, not silently guessed hierarchy", () => {
  const proposal = adaptGoogleAddressProposal({ region: "Bratislavský kraj", locality: "Bratislava", sublocality: "Ružinov" });
  assert.equal(proposal.validation.completeness, "NEEDS_REVIEW");
  assert.equal(proposal.validation.address.city, null);
});
test("legacy adapters preserve original text, missing columns and organization target identity", () => {
  const original = { ...profile, city: "Neznáma obec", postalCode: "staré PSČ" };
  const base = adaptDirectoryAddress(original);
  assert.equal(base.address.city, original.city); assert.equal(base.address.editorialAddress, original.address);
  assert.equal(base.completeness, "NEEDS_REVIEW");
  assert.equal(planInternalAddressPatch(base, { city: "Prešov" }, { missingOnly: true }).allowed, false);
  assert.deepEqual(planInternalAddressPatch(base, {}).next, base.address);
  const event = adaptEventAddress({ id: 2, region: "Online", city: "Online", address: "" });
  assert.equal(event.address.mode, "ONLINE"); assert.equal(event.address.region, null);
  assert.equal(event.address.postalCode, null); assert.equal(event.completeness, "COMPLETE");
  const org = adaptOrganizationAddress({ id: 4, organizationId: 9, role: "SERVICE_AREA", region: physical.region, district: physical.district, city: physical.city, address: "Oblasť", countryCode: "SK" });
  assert.deepEqual(org.target, { type: "ORGANIZATION_LOCATION", id: 4, organizationId: 9 });
  assert.equal(org.address.mode, "SERVICE_AREA"); assert.equal(org.address.street, null);
  assert.equal(org.geo.publicVisibility, null);
});
test("projection refuses future migration fields and mode transitions; whitelists current fields only", () => {
  const result = planInternalAddressPatch(snapshot(), { street: "Nová" });
  assert.throws(() => projectLegacyAddressPatch("MANAGED_EVENT", result), /migration/);
  assert.throws(() => projectLegacyAddressPatch("ORGANIZATION_LOCATION", result), /migration/);
  assert.deepEqual(projectLegacyAddressPatch("DIRECTORY_PROFILE", result), { street: "Nová" });
  assert.throws(() => projectLegacyAddressPatch("DIRECTORY_PROFILE", planInternalAddressPatch(snapshot(), { googlePlaceId: "id" })), /conflicts/);
  assert.throws(() => adaptEventAddress({ id: -1, region: "Online", city: "Online" }), /target/);
});
test("municipality-number format cannot silently keep a street", () => {
  const result = planInternalAddressPatch(snapshot(), { addressFormat: "MUNICIPALITY_NUMBER" });
  assert.equal(result.allowed, false); assert.ok(result.conflicts.some((c) => c.code === "INVALID_ADDRESS"));
});
test("inherited properties are not patch instructions", () => {
  const result = planInternalAddressPatch(snapshot(), Object.create({ houseNumber: null }));
  assert.deepEqual(result.changes, {}); assert.equal(result.allowed, true);
});
test("legacy multiline editorial address stays intact without blocking an unrelated valid proposal", () => {
  const base = adaptDirectoryAddress({ ...profile, address: "Hlavná 1127/21\n080 01 Prešov" });
  const result = planInternalAddressPatch(base, { houseNumber: "12/A" });
  assert.equal(result.allowed, true);
  assert.equal(result.next.editorialAddress, base.address.editorialAddress);
});
