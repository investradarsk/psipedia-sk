import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyDirectoryStreetSelection,
  directoryAddressTextSemanticallyEqual,
  directoryCanonicalAddressSemanticallyEqual,
  directoryCanonicalPublicAddress,
  directoryExactGeoCandidate,
  directoryNumberlessPlaceCandidate,
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

const directoryEditorSource = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
const directoryAutocompleteSource = readFileSync(new URL("../components/directory-address-autocomplete.tsx", import.meta.url), "utf8");
const directoryPutSource = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");

test("ADDRESS-UX-1 semantic text comparison ignores case and surrounding whitespace without fuzzy matching", () => {
  assert.equal(directoryAddressTextSemanticallyEqual("Železničná", "  železničná  "), true);
  assert.equal(directoryAddressTextSemanticallyEqual("Železničná", "Železničná cesta"), false);
});

test("ADDRESS-UX-1 confirmed canonical address remains semantically equal across formatting-only differences", () => {
  assert.equal(directoryCanonicalAddressSemanticallyEqual(
    {
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      postalCode: "96601",
      street: " Železničná ",
      houseNumber: "2/75",
      addressFormat: "STREET",
    },
    {
      region: "banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      postalCode: "966 01",
      street: "železničná",
      houseNumber: "2/75",
      addressFormat: "STREET",
    },
  ), true);
});

test("ADDRESS-UX-1 production #1690 same-street selection preserves house number, postcode and format", () => {
  const next = applyDirectoryStreetSelection(
    {
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      postalCode: "966 01",
      street: "Železničná",
      houseNumber: "2/75",
      addressFormat: "STREET",
    },
    {
      providerResultId: "geoapify-same-street",
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      street: " železničná ",
    },
  );
  assert.equal(next.sameStreet, true);
  assert.equal(next.houseNumber, "2/75");
  assert.equal(next.postalCode, "966 01");
  assert.equal(next.addressFormat, "STREET");
  assert.equal(next.street, "železničná");
});

test("ADDRESS-UX-1 different street remains destructive and unconfirmed until verification", () => {
  const next = applyDirectoryStreetSelection(
    {
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      postalCode: "966 01",
      street: "Železničná",
      houseNumber: "2/75",
      addressFormat: "STREET",
    },
    {
      providerResultId: "geoapify-hlavna",
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      street: "Hlavná",
    },
  );
  assert.equal(next.sameStreet, false);
  assert.equal(next.street, "Hlavná");
  assert.equal(next.houseNumber, "");
  assert.equal(next.postalCode, "");
  assert.equal(next.addressFormat, "STREET");
});

test("ADDRESS-UX-1 same street in another locality is not treated as unchanged", () => {
  const next = applyDirectoryStreetSelection(
    {
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Hliník nad Hronom",
      postalCode: "966 01",
      street: "Železničná",
      houseNumber: "2/75",
      addressFormat: "STREET",
    },
    {
      providerResultId: "geoapify-other-city",
      region: "Banskobystrický kraj",
      district: "Žiar nad Hronom",
      city: "Žiar nad Hronom",
      street: "Železničná",
    },
  );
  assert.equal(next.sameStreet, false);
  assert.equal(next.houseNumber, "");
  assert.equal(next.postalCode, "");
});

test("ADDRESS-UX-1 editor keeps confirmed preview based on canonical equality, not provider id", () => {
  assert.match(directoryEditorSource, /directoryCanonicalAddressSemanticallyEqual/);
  assert.match(directoryEditorSource, /addressMatchesPersistedConfirmed/);
  assert.doesNotMatch(directoryEditorSource, /!addressProviderResultId\s*&&\s*profile\?\.serviceAddressConfirmation/);
  assert.match(directoryEditorSource, /setAddressProviderResultId\(""\);\s*setPostalCode\(""\);\s*setStreet\(""\);\s*setHouseNumber\(""\);\s*setAddressFormat\(""\);/s);
});

test("ADDRESS-UX-1 autocomplete waits for intentional editing and preserves combobox accessibility", () => {
  assert.match(directoryAutocompleteSource, /searchActivated/);
  assert.match(directoryAutocompleteSource, /useState\(!selectedStreet\)/);
  assert.match(directoryAutocompleteSource, /setSearchActivated\(true\)/);
  assert.match(directoryAutocompleteSource, /role="combobox"/);
  assert.match(directoryAutocompleteSource, /aria-autocomplete="list"/);
  assert.match(directoryAutocompleteSource, /aria-expanded=/);
  assert.match(directoryAutocompleteSource, /role="listbox"/);
});

test("ADDRESS-UX-1 server safety still requires verification for changed physical addresses", () => {
  assert.match(directoryPutSource, /if \(body\.addressProviderResultId\?\.trim\(\)\)/);
  assert.match(directoryPutSource, /verifyDirectoryAddressSelection/);
  assert.match(directoryPutSource, /else if \(changed\)/);
  assert.match(directoryPutSource, /Zmenu fyzickej adresy potvrď výberom ulice z Geoapify návrhov/);
  assert.match(directoryPutSource, /preserveDirectoryPhysicalAddress\(before, body\)/);
});

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

test("STREET without house number is a complete canonical numberless place but not a classical exact address", () => {
  const input = { ...streetAddress, houseNumber: "" };
  const result = evaluateDirectoryServiceAddress(input);
  assert.equal(result.state, "COMPLETE");
  assert.equal(result.reason, "NUMBERLESS_PLACE");
  assert.equal(result.formattedAddress, "Hviezdoslavova\n953 01 Zlaté Moravce");
  assert.equal(formatDirectoryServiceAddress(input), result.formattedAddress);
  assert.equal(directoryCanonicalPublicAddress(input), result.formattedAddress);
  assert.deepEqual(directoryNumberlessPlaceCandidate(input), {
    publicVisibility: "EXACT_PUBLIC",
    publicPrecision: "EXACT",
    formattedAddress: result.formattedAddress,
  });
  assert.equal(directoryExactGeoCandidate(input), null);
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

test("numberless directory address declares exact intent but cannot build the classical Geoapify exact query", () => {
  const source = {
    targetType: "DIRECTORY_PROFILE",
    targetId: 3,
    label: "AgiPaws",
    category: "salony-a-sluzby",
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Liptovský Mikuláš",
    postalCode: "031 01",
    street: "Nábrežie",
    houseNumber: "",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    countryCode: "SK",
    online: false,
  };
  const classification = classifyGeoSource(source);
  assert.equal(classification.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(classification.proposedPrecision, "EXACT");
  assert.equal(classification.requiresReview, false);
  assert.equal(buildGeoQuery(source, "EXACT_PUBLIC", "EXACT"), null);
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
