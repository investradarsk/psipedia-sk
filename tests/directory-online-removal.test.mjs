import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyGeoSource } from "../lib/geo.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const adminEditor = read("components/admin-directory-editor.tsx");
const partnerNew = read("lib/partner-new-profile.ts");
const partnerEdit = read("lib/partner-profile-changes.ts");
const partnerNewForm = read("components/partner-new-profile-form.tsx");
const publicCard = read("components/directory-card.tsx");
const publicList = read("components/directory-page.tsx");
const publicDetail = read("components/directory-profile-detail.tsx");
const changeForm = read("components/directory-profile-change-form.tsx");
const changeAdmin = read("components/admin-directory-change-requests.tsx");
const notion = read("lib/notion-directory-sync.ts");
const directoryDiff = read("lib/data-automation-directory-diff.ts");
const automationApply = read("lib/data-automation-apply.ts");
const enrichment = read("lib/data-automation-enrichment-template.ts");
const updateReview = read("lib/data-automation-update-review.ts");
const googleBulk = read("lib/google-place-bulk.ts");
const googleCanary = read("lib/google-place-canary.ts");
const exactAuto = read("lib/directory-exact-geo-auto.ts");
const geoStore = read("lib/geo-store.ts");
const mapOperator = read("lib/geo-admin-operator.ts");
const store = read("lib/directory-store.ts");
const importRoute = read("app/api/admin/import/route.ts");
const detailPresentation = read("lib/directory-detail-presentation.ts");

test("A admin DIRECTORY editor has no online product control or payload field", () => {
  assert.doesNotMatch(adminEditor, /Služby aj online|Online profil|Ponúka online služby/);
  assert.doesNotMatch(adminEditor, /\[online, setOnline\]|\bonline[,}]/);
});

test("B/C partner create and edit contracts do not expose directory online and reject it as unknown", () => {
  assert.doesNotMatch(partnerNewForm, /Ponúkam aj online služby|directory\.online/);
  assert.doesNotMatch(partnerNew, /\bonline:\s*false/);
  assert.doesNotMatch(partnerEdit, /key:\s*"online"|Online služby/);
  assert.match(partnerNew, /rejectUnknownFields/);
  assert.match(partnerEdit, /nie je možné upravovať/);
});

test("D/E public directory card, listing and detail contain no system online badge", () => {
  for (const source of [publicCard, publicList, publicDetail]) {
    assert.doesNotMatch(source, /profile\.online|presentation\.online|Služba dostupná aj online|Osobne aj online|aj online/);
  }
});

test("F public and admin change-request surfaces do not expose online field", () => {
  assert.doesNotMatch(changeForm, /Služba je dostupná aj online|update\("online"/);
  assert.doesNotMatch(changeAdmin, /Dostupnosť online|\["online"/);
  assert.match(store, /Pole online už nie je podporované pre profily služieb/);
});

test("G Notion DIRECTORY sync neither reads nor writes Online property", () => {
  assert.doesNotMatch(notion, /propertyCheckbox\(page, "Online"\)|"Online": checkbox|profile\.online|desired\.online/);
});

test("H automation DIRECTORY schemas cannot propose or apply online", () => {
  assert.doesNotMatch(directoryDiff, /"online"/);
  assert.doesNotMatch(enrichment, /f\("online"/);
  assert.doesNotMatch(updateReview, /online:\s*bool\("online"/);
  const directoryBlock = automationApply.slice(
    automationApply.indexOf("DIRECTORY:"),
    automationApply.indexOf("ADOPTION:", automationApply.indexOf("DIRECTORY:")),
  );
  assert.doesNotMatch(directoryBlock, /\bonline\b/);
});

test("I Google bulk and canary never exclude DIRECTORY by legacy online column", () => {
  assert.doesNotMatch(googleBulk, /Online-only profil|flag\(row, "online"\)|d\.online/);
  assert.doesNotMatch(googleCanary, /Boolean\(row\.online\)|d\.online\s*=\s*0|d\.online,/);
});

test("J legacy directory online flag does not hide GEO and missing address is ordinary missing data", () => {
  const physical = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE",
    targetId: 91,
    label: "Legacy flag physical",
    category: "veterinari",
    address: "Hlavná 1",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    postalCode: "949 01",
    street: "Hlavná",
    houseNumber: "1",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    countryCode: "SK",
    online: true,
    published: true,
  });
  assert.equal(physical.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(physical.proposedPrecision, "EXACT");

  const missing = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE",
    targetId: 92,
    label: "Legacy flag missing",
    category: "veterinari",
    city: "",
    region: "",
    countryCode: "SK",
    online: true,
    published: true,
  });
  assert.equal(missing.proposedVisibility, null);
  assert.equal(missing.reasonCode, "SOURCE_INCOMPLETE");

  assert.doesNotMatch(exactAuto, /dp\.online\s*=\s*0|ONLINE_ONLY|source\.online/);
  const directoryGeoStore = geoStore.slice(
    geoStore.indexOf('targetType === "DIRECTORY_PROFILE"'),
    geoStore.indexOf('targetType === "ORGANIZATION_LOCATION"'),
  );
  assert.doesNotMatch(directoryGeoStore, /row\.online|online:/);
  const directoryOperator = mapOperator.slice(
    mapOperator.indexOf("function directoryRow"),
    mapOperator.indexOf("function organizationRow"),
  );
  assert.doesNotMatch(directoryOperator, /row, "online"|online:/);
});

test("K canonical DIRECTORY create/update/import keep DB legacy online column pinned to zero", () => {
  assert.match(store, /online, price_note/);
  assert.match(store, /0, input\.priceNote/);
  assert.match(store, /service_address_confirmation = \?, online = \?, price_note/);
  assert.match(importRoute, /city, district, region, address, 0, importedText/);
});

test("L MANAGED_EVENT online behavior remains intact", () => {
  const onlineEvent = classifyGeoSource({
    targetType: "MANAGED_EVENT",
    targetId: 300,
    label: "Online podujatie",
    city: "Online",
    region: "Online",
    online: true,
    countryCode: "SK",
    published: true,
  });
  assert.equal(onlineEvent.proposedVisibility, "HIDDEN");
  assert.equal(onlineEvent.reasonCode, "ONLINE_ONLY");
});

test("M editorial text Online konzultácie remains ordinary searchable service content", () => {
  assert.match(detailPresentation, /Online konzultácie/);
  assert.match(store, /input\.services\.join\(" "\)/);
});
