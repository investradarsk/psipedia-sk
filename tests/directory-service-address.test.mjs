import assert from "node:assert/strict";
import test from "node:test";

import {
  directoryExactGeoCandidate,
  evaluateDirectoryServiceAddress,
  formatDirectoryServiceAddress,
} from "../lib/directory-service-address.ts";
import { buildGeoQuery, classifyGeoSource } from "../lib/geo.ts";

const streetAddress = {
  region: "Nitriansky kraj",
  district: "Zlaté Moravce",
  city: "Zlaté Moravce",
  postalCode: "953 01",
  street: "Hviezdoslavova",
  houseNumber: "88",
  addressFormat: "STREET",
  serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  online: false,
};

test("valid STREET service address is COMPLETE", () => {
  const result = evaluateDirectoryServiceAddress(streetAddress);
  assert.equal(result.state, "COMPLETE");
  assert.equal(result.formattedAddress, "Hviezdoslavova 88\n953 01 Zlaté Moravce");
});

test("valid MUNICIPALITY_NUMBER service address is COMPLETE without fake street", () => {
  const input = {
    ...streetAddress,
    city: "Mankovce",
    postalCode: "951 91",
    street: "",
    houseNumber: "123",
    addressFormat: "MUNICIPALITY_NUMBER",
  };
  const result = evaluateDirectoryServiceAddress(input);
  assert.equal(result.state, "COMPLETE");
  assert.equal(result.formattedAddress, "Mankovce 123\n951 91 Mankovce");
  assert.equal(formatDirectoryServiceAddress(input), result.formattedAddress);
});

test("missing postal code is INCOMPLETE", () => {
  const result = evaluateDirectoryServiceAddress({ ...streetAddress, postalCode: "" });
  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.reason, "POSTAL_CODE_MISSING");
});

test("missing house number is INCOMPLETE", () => {
  const result = evaluateDirectoryServiceAddress({ ...streetAddress, houseNumber: "" });
  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.reason, "HOUSE_NUMBER_MISSING");
});

test("missing street for STREET is INCOMPLETE", () => {
  const result = evaluateDirectoryServiceAddress({ ...streetAddress, street: "" });
  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.reason, "STREET_MISSING");
});

test("street is invalid for MUNICIPALITY_NUMBER", () => {
  const result = evaluateDirectoryServiceAddress({ ...streetAddress, addressFormat: "MUNICIPALITY_NUMBER" });
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.equal(result.reason, "STREET_NOT_ALLOWED");
});

test("invalid region/district/municipality relation requires review", () => {
  const result = evaluateDirectoryServiceAddress({
    ...streetAddress,
    region: "Trnavský kraj",
    district: "Zlaté Moravce",
  });
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.equal(result.reason, "LOCALITY_INVALID");
});

test("legacy unconfirmed structured address is not COMPLETE", () => {
  const result = evaluateDirectoryServiceAddress({
    ...streetAddress,
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  });
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.equal(result.reason, "LEGACY_UNCONFIRMED");
  assert.equal(directoryExactGeoCandidate({
    ...streetAddress,
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  }), null);
});

test("online-only directory profile is not COMPLETE", () => {
  const result = evaluateDirectoryServiceAddress({
    region: "",
    district: "",
    city: "",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    online: true,
  });
  assert.equal(result.state, "MISSING");
  assert.equal(result.reason, "ONLINE_ONLY");
});

test("directory exact geo candidate exists only for COMPLETE canonical service address", () => {
  assert.deepEqual(directoryExactGeoCandidate(streetAddress), {
    publicVisibility: "EXACT_PUBLIC",
    publicPrecision: "EXACT",
    formattedAddress: "Hviezdoslavova 88\n953 01 Zlaté Moravce",
  });
  assert.equal(directoryExactGeoCandidate({ ...streetAddress, houseNumber: "" }), null);

  const classification = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1,
    label: "Veterinárna ambulancia",
    category: "veterinari",
    ...streetAddress,
    countryCode: "SK",
  });
  assert.equal(classification.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(classification.proposedPrecision, "EXACT");
  assert.equal(classification.requiresReview, false);
});

test("directory has no municipality fallback", () => {
  const source = {
    targetType: "DIRECTORY_PROFILE",
    targetId: 2,
    label: "Legacy profil",
    category: "treneri",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
    countryCode: "SK",
  };
  const classification = classifyGeoSource(source);
  assert.equal(classification.proposedVisibility, null);
  assert.equal(classification.proposedPrecision, null);
  assert.equal(buildGeoQuery(source, "APPROXIMATE_PUBLIC", "MUNICIPALITY"), null);
});

test("organization and event geo behavior remains unchanged", () => {
  const serviceArea = classifyGeoSource({
    targetType: "ORGANIZATION_LOCATION",
    targetId: 10,
    label: "Pôsobnosť",
    locationRole: "SERVICE_AREA",
    city: "Nitra",
    countryCode: "SK",
  });
  assert.equal(serviceArea.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(serviceArea.proposedPrecision, "SERVICE_AREA");

  const cityOnlyEvent = classifyGeoSource({
    targetType: "MANAGED_EVENT",
    targetId: 20,
    label: "Podujatie",
    city: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
  });
  assert.equal(cityOnlyEvent.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(cityOnlyEvent.proposedPrecision, "MUNICIPALITY");
});
