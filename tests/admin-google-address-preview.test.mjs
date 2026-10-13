import assert from "node:assert/strict";
import test from "node:test";
import { adaptAddressGeo, adaptDirectoryAddress, adaptEventAddress, adaptOrganizationAddress } from "../lib/admin-address-adapters.ts";
import { previewGoogleAddressChange } from "../lib/admin-google-address-preview.ts";

const location = {
  region: "Prešovský kraj", district: "Prešov", locality: "Prešov", sublocality: "",
  street: "Hlavná", houseNumber: "1127/21", postalCode: "08001", countryCode: "SK",
};
const candidate = (address = location, id = "place-1", formattedAddress = "Hlavná 1127/21, 080 01 Prešov") => ({
  id, displayName: "Prevádzka", formattedAddress, latitude: 48.998, longitude: 21.239, address,
});
const directory = (overrides = {}, geo = adaptAddressGeo(null)) => adaptDirectoryAddress({
  id: 10, region: "", district: "", city: "", postalCode: "", street: "", houseNumber: "",
  addressFormat: "", address: "", serviceAddressConfirmation: "LEGACY_UNCONFIRMED", updatedAt: "rev-1",
  ...overrides,
}, geo);
const full = {
  region: "Prešovský kraj", district: "Prešov", city: "Prešov", postalCode: "080 01",
  street: "Hlavná", houseNumber: "1127/21", addressFormat: "STREET",
  address: "Hlavná 1127/21, 080 01 Prešov",
};
const anchor = {
  googlePlaceId: "place-1", googlePlaceSourceFingerprint: "a",
  sourceFingerprint: "a", resolvedSourceFingerprint: "a", geocodeStatus: "RESOLVED",
  publicVisibility: "EXACT_PUBLIC", publicPrecision: "EXACT", manualOverride: false,
};

test("full Google address yields a complete diff with normalized Slovak locality and textual identifiers", () => {
  const snap = directory(); const before = structuredClone(snap);
  const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate() });
  assert.equal(result.readyForAuthorization, true);
  assert.equal(result.requiresExplicitGoogleConfirmation, true);
  assert.equal(result.googleConfirmation, "NONE");
  assert.equal(result.validation.completeness, "COMPLETE");
  assert.equal(result.proposedAddress.region, "Prešovský kraj");
  assert.equal(result.proposedAddress.postalCode, "08001");
  assert.equal(result.validation.address.postalCode, "080 01");
  assert.equal(result.proposedAddress.houseNumber, "1127/21");
  assert.equal(result.proposedAddress.addressFormat, "STREET");
  assert.ok(result.changes.some((change) => change.field === "postalCode"));
  assert.deepEqual(snap, before, "preview must not mutate the input");
});
test("missing Google components are reported and do not clear existing fields", () => {
  const snap = directory({ ...full });
  const result = previewGoogleAddressChange({
    snapshot: snap, candidate: candidate({ street: "hlavná", locality: "Prešov" }),
  });
  assert.equal(result.proposedAddress.postalCode, "080 01");
  assert.equal(result.proposedAddress.houseNumber, "1127/21");
  assert.ok(result.missingGoogleComponents.includes("postalCode"));
  assert.ok(result.missingGoogleComponents.includes("houseNumber"));
  assert.equal(result.changes.length, 0);
  assert.equal(result.readyForAuthorization, false, "no-op is not authorization");
});
test("missing-only accepts a genuinely absent field while preserving existing components", () => {
  const snap = directory({ ...full, houseNumber: "" });
  const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate({ houseNumber: "12/A" }) });
  assert.equal(result.proposedAddress.houseNumber, "12/A");
  assert.equal(result.changes.find((change) => change.field === "houseNumber")?.after, "12/A");
  assert.equal(result.proposedAddress.street, "Hlavná");
  assert.equal(result.readyForAuthorization, true);
});
test("existing populated values are not overwritten by a missing-only proposal", () => {
  const snap = directory({ ...full });
  const result = previewGoogleAddressChange({
    snapshot: snap,
    candidate: candidate({ ...location, street: "Nová" }),
  });
  assert.equal(result.readyForAuthorization, false);
  assert.ok(result.conflicts.some((issue) => issue.code === "EXISTING_VALUE"));
  assert.equal(snap.address.street, "Hlavná");
});
test("Slovak hierarchy is checked without guessing unknown district or municipality", () => {
  const snap = directory();
  for (const address of [
    { ...location, region: "Košický kraj" },
    { ...location, district: "", locality: "Prešov" },
    { ...location, locality: "Neznáma obec" },
  ]) {
    const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate(address) });
    assert.equal(result.readyForAuthorization, false);
    assert.ok(result.validation.issues.some((issue) => ["INVALID_HIERARCHY", "INVALID_VALUE", "AMBIGUOUS"].includes(issue.code)));
  }
});
test("incorrect locality mixed with retained old postal/street/house must be reviewed", () => {
  const snap = directory({ ...full, region: "", district: "", city: "" });
  const result = previewGoogleAddressChange({
    snapshot: snap,
    candidate: candidate({ region: "Košický kraj", district: "Košice II", locality: "Košice - Západ", countryCode: "SK" }),
  });
  assert.ok(result.conflicts.some((issue) => issue.code === "MIXED_ADDRESS_REVIEW"));
  assert.equal(result.readyForAuthorization, false);
});
test("leading zero PSČ and slash/alphanumeric house numbers are preserved as text", () => {
  for (const houseNumber of ["12/A", "1127/21", "7B"]) {
    const result = previewGoogleAddressChange({ snapshot: directory(), candidate: candidate({ ...location, houseNumber }) });
    assert.equal(result.validation.address.postalCode, "080 01");
    assert.equal(result.validation.address.houseNumber, houseNumber);
    assert.equal(result.readyForAuthorization, true);
  }
});
test("normalized same values do not generate false diffs", () => {
  const snap = directory({ ...full });
  const same = candidate({ ...location, region: "presovsky kraj", district: "Presov", locality: "presov",
    postalCode: "08001", street: "  HLAVNÁ  " });
  const result = previewGoogleAddressChange({ snapshot: snap, candidate: same });
  assert.deepEqual(result.changes, []);
  assert.ok(result.unchangedFields.includes("street"));
  assert.equal(result.requiresReview, false);
});
test("current and stale anchors are independent from completeness, and protect address changes", () => {
  for (const point of [anchor, { ...anchor, sourceFingerprint: "new-revision" }]) {
    const snap = directory({ ...full }, adaptAddressGeo(point));
    const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate({ ...location, street: "Nová" }), intent: "ADMIN_RECONFIRM" });
    assert.equal(result.googleConfirmation, point === anchor ? "CURRENT" : "STALE");
    assert.ok(result.conflicts.some((issue) => issue.code === "GOOGLE_PLACE_LOCKED"));
    assert.equal(result.readyForAuthorization, false);
  }
});
test("explicit re-confirm of identical place can reach authorization, never auto-confirms", () => {
  const snap = directory({ ...full }, adaptAddressGeo(anchor));
  const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate(), intent: "ADMIN_RECONFIRM", expectedRevision: "rev-1" });
  assert.equal(result.changes.length, 0);
  assert.equal(result.readyForAuthorization, true);
  assert.equal(result.requiresExplicitGoogleConfirmation, true);
  assert.equal(result.googleConfirmation, "CURRENT");
  assert.equal(result.candidatePlaceId, "place-1");
  assert.ok(previewGoogleAddressChange({ snapshot: snap, candidate: candidate(), intent: "ADMIN_RECONFIRM", expectedRevision: "stale" })
    .conflicts.some((issue) => issue.code === "REVISION_CONFLICT"));
});
test("different Google ID never silently replaces current or stale anchor", () => {
  for (const point of [anchor, { ...anchor, sourceFingerprint: "changed" }]) {
    const snap = directory({ ...full }, adaptAddressGeo(point));
    const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate(location, "other-id"), intent: "ADMIN_RECONFIRM" });
    assert.ok(result.conflicts.some((issue) => issue.code === "GOOGLE_ANCHOR_CHANGE"));
    assert.equal(result.readyForAuthorization, false);
  }
});
test("manual GEO override and explicit private/HIDDEN locations are blocked", () => {
  for (const [geo, code] of [
    [adaptAddressGeo({ ...anchor, googlePlaceId: null, manualOverride: true }), "MANUAL_GEO_LOCKED"],
    [adaptAddressGeo(null, true), "PRIVATE_LOCATION_LOCKED"],
    [adaptAddressGeo({ ...anchor, googlePlaceId: null, publicVisibility: "HIDDEN" }), "PRIVATE_LOCATION_LOCKED"],
  ]) {
    const result = previewGoogleAddressChange({ snapshot: directory({}, geo), candidate: candidate() });
    assert.ok(result.conflicts.some((issue) => issue.code === code));
    assert.equal(result.readyForAuthorization, false);
  }
});
test("confirmed service location stays protected", () => {
  const snap = directory({ ...full, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" });
  const result = previewGoogleAddressChange({ snapshot: snap, candidate: candidate({ ...location, houseNumber: "12/A" }), intent: "ADMIN_RECONFIRM" });
  assert.ok(result.conflicts.some((issue) => issue.code === "CONFIRMED_ADDRESS_LOCKED"));
});
test("online event cannot gain a physical Google address", () => {
  const event = adaptEventAddress({ id: 11, region: "Online", city: "Online", address: "", venue: "" });
  const result = previewGoogleAddressChange({ snapshot: event, candidate: candidate() });
  assert.ok(result.conflicts.some((issue) => issue.code === "ONLINE_EVENT"));
  assert.equal(result.readyForAuthorization, false);
  assert.equal(result.currentAddress.mode, "ONLINE");
});
test("physical event preview preserves venue and is not mistaken for Google venue confirmation", () => {
  const event = adaptEventAddress({ id: 12, region: "", city: "", address: "", venue: "Športová hala" });
  const result = previewGoogleAddressChange({ snapshot: event, candidate: candidate() });
  assert.equal(result.proposedAddress.venue, "Športová hala");
  assert.ok(result.unchangedFields.includes("venue"));
});
test("organization binding and SITE/LEGAL_SEAT/SERVICE_AREA role guards", () => {
  for (const role of ["SITE", "LEGAL_SEAT", "SERVICE_AREA"]) {
    const org = adaptOrganizationAddress({
      id: 22, organizationId: 45, role, region: "", district: "", city: "", address: "", countryCode: "SK",
    });
    const result = previewGoogleAddressChange({
      snapshot: org, candidate: candidate(),
      organization: { organizationId: 45, locationId: 22, role },
    });
    assert.equal(result.target.id, 22); assert.equal(result.target.organizationId, 45);
    assert.equal(result.readyForAuthorization, role === "SITE");
    if (role !== "SITE") assert.ok(result.conflicts.some((issue) => issue.code === "ORGANIZATION_ROLE_REVIEW"));
    for (const binding of [undefined, { organizationId: 99, locationId: 22, role }, { organizationId: 45, locationId: 23, role }]) {
      const invalid = previewGoogleAddressChange({ snapshot: org, candidate: candidate(), organization: binding });
      assert.ok(invalid.conflicts.some((issue) => issue.code === "INVALID_TARGET"));
      assert.equal(invalid.readyForAuthorization, false);
    }
  }
});
test("invalid types, non-SK country, arbitrary fields and absent Place ID reject safely", () => {
  const snap = directory(); const before = structuredClone(snap);
  for (const bad of [
    null, {}, { street: 123 }, { ...location, latitude: 49 }, { region: "x\u0000" },
    { id: "", formattedAddress: "x", latitude: 49, longitude: 21, address: location },
    { ...candidate(), address: { ...location, postalCode: 8001 } },
  ]) {
    const result = previewGoogleAddressChange({ snapshot: snap, candidate: bad });
    assert.equal(result.readyForAuthorization, false);
    assert.equal(result.requiresReview, true);
  }
  const foreign = previewGoogleAddressChange({ snapshot: snap, candidate: candidate({ ...location, countryCode: "CZ" }) });
  assert.equal(foreign.readyForAuthorization, false);
  assert.ok(foreign.validation.issues.some((issue) => issue.field === "countryCode"));
  const raw = previewGoogleAddressChange({ snapshot: snap, candidate: location });
  assert.equal(raw.readyForAuthorization, false);
  assert.ok(raw.conflicts.some((issue) => issue.code === "GOOGLE_PLACE_SELECTION_REQUIRED"));
  assert.deepEqual(snap, before);
});
