import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDirectoryAdminWritebackEcho } from "../lib/directory-notion-echo.ts";
import { normalizeManagedDirectoryProfileInput } from "../lib/directory-store.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";

const categories = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
];
const base = {
  name: "Chvostikovo", slug: "chvostikovo", status: "published",
  description: "Popis sa nesmie vymazať", excerpt: "Perex zostáva",
  websiteUrl: "Test", publicPhone: "Test", publicEmail: "Test",
  facebookUrl: "Test", instagramUrl: "Test",
  services: [], qualifications: [], additionalCategories: [],
};
const historical = {
  "Webstránka": "historicky web", "Telefon": "historicky telefon",
  "Email": "historicky email", "Facebook": "historicky facebook",
  "Instagram": "historicky instagram",
  "Organizácia": "Zachovať odborný údaj", "Zdroj dát": "Zachovať metadáta",
};

test("Ten categories: Facebook-only change saves complete snapshot without erasing four contacts", () => {
  for (const category of categories) {
    const saved = normalizeManagedDirectoryProfileInput({
      ...base, category, facebookUrl: "Testtesty",
    }, historical);
    assert.deepEqual(readDirectoryPublicContacts(saved.sourceData, saved.websiteUrl ?? ""), {
      phone: "Test", email: "Test", website: "Test",
      facebook: "Testtesty", instagram: "Test",
    }, category);
    assert.equal(saved.description, base.description);
    assert.equal(saved.sourceData["Organizácia"], historical["Organizácia"]);
    assert.equal(saved.sourceData["Zdroj dát"], historical["Zdroj dát"]);
    assert.equal(Object.hasOwn(saved.sourceData, "Telefon"), false);
    assert.equal(Object.hasOwn(saved.sourceData, "Email"), false);
    assert.equal(Object.hasOwn(saved.sourceData, "Webstránka"), false);
  }
});

test("Ten categories: explicit blank removes only its own contacts and keeps independent metadata", () => {
  for (const category of categories) {
    const saved = normalizeManagedDirectoryProfileInput({
      ...base, category, publicPhone: "", websiteUrl: "",
    }, historical);
    assert.deepEqual(readDirectoryPublicContacts(saved.sourceData, saved.websiteUrl ?? ""), {
      phone: "", email: "Test", website: "",
      facebook: "Test", instagram: "Test",
    }, category);
    assert.equal(saved.sourceData["Organizácia"], historical["Organizácia"]);
  }
});

test("Notion echo for exact previously acknowledged Admin revision never reimports into D1", () => {
  assert.equal(isDirectoryAdminWritebackEcho(
    "2026-11-16T06:45:05.000Z", "2026-11-16T06:45:05.000Z", true), true);
  assert.equal(isDirectoryAdminWritebackEcho(
    "2026-11-16T06:45:06.000Z", "2026-11-16T06:45:05.000Z", true), false);
  assert.equal(isDirectoryAdminWritebackEcho(
    "2026-11-16T06:45:05.000Z", "2026-11-16T06:45:05.000Z", false), false);
  assert.equal(isDirectoryAdminWritebackEcho(null, "2026-11-16T06:45:05.000Z", true), false);
});

test("Only one D1 writer for full form: no implicit field diff and no second clear SQL", () => {
  const admin = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  assert.match(admin, /fullProfileSave && isDirectoryFieldEventCategory\(before\.category\)/);
  assert.match(admin, /if \(editedPaths && !fullProfileSave\)/);
  assert.match(admin, /!fullProfileSave && Array\.isArray\(rawExplicitlyClearedContacts\)/);
  assert.match(admin, /const fieldPreserved = !fullProfileSave && editedPaths/);
  assert.match(admin, /const safeOptionalFields = fullProfileSave/);
  assert.match(admin, /directoryContactValueMismatches\(expectedContactValues/);
  assert.match(notion, /isDirectoryAdminWritebackEcho\(/);
  assert.match(notion, /UPDATE directory_notion_sync SET notion_last_edited_time = \?/);
});
