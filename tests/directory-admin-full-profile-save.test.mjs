import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDirectoryFullProfileSave } from "../lib/directory-full-profile-save.ts";
import { normalizeManagedDirectoryProfileInput } from "../lib/directory-store.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";

const categories = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
];
const version = "2026-11-15T22:23:02.000Z";
function form(category = "treneri") {
  return {
    name: "Profil X", slug: "profil-x", category, status: "published",
    excerpt: "Perex", description: "Popis",
    services: [], qualifications: [],
    city: "Nitra", district: "Nitra", region: "Nitriansky kraj",
    address: "", postalCode: "", street: "", houseNumber: "",
    addressFormat: "", priceNote: "",
    websiteUrl: "https://web.sk", publicPhone: "+421 999 999 999",
    publicEmail: "info@web.sk", facebookUrl: "facebook/old", instagramUrl: "@old",
    seo: {}, verified: false, featured: false,
  };
}

test("A Save without even a dot changed still accepts the complete Admin snapshot", () => {
  assert.equal(validateDirectoryFullProfileSave({
    expectedUpdatedAt: version, currentUpdatedAt: version, submitted: form(),
  }), "valid");
});

test("An explicit empty value is valid; missing field is NOT an explicit clear", () => {
  const blank = { ...form(), publicPhone: "", publicEmail: "", websiteUrl: "", facebookUrl: "", instagramUrl: "" };
  assert.equal(validateDirectoryFullProfileSave({
    expectedUpdatedAt: version, currentUpdatedAt: version, submitted: blank,
  }), "valid");
  const missing = { ...blank };
  delete missing.instagramUrl;
  assert.equal(validateDirectoryFullProfileSave({
    expectedUpdatedAt: version, currentUpdatedAt: version, submitted: missing,
  }), "missing-fields");
});

test("Concurrent Notion/Quality write must block an old full-form snapshot", () => {
  assert.equal(validateDirectoryFullProfileSave({
    expectedUpdatedAt: version, currentUpdatedAt: "2026-11-15T22:23:05.000Z", submitted: form(),
  }), "stale");
});

test("Across ten categories, all five full-form contacts replace only their own historical aliases", () => {
  for (const category of categories) {
    const source = {
      "Telefón": "old", "Telefon": "older", phone: "oldest",
      "E-mail": "old", Email: "older", email: "oldest",
      Web: "old", "Webstránka": "older",
      Facebook: "old", Instagram: "old",
      "Organizácia": "Zachovať", "_psipedia_additional_categories": "[]",
    };
    const saved = normalizeManagedDirectoryProfileInput(form(category), source);
    const contacts = readDirectoryPublicContacts(saved.sourceData, saved.websiteUrl);
    assert.deepEqual(contacts, {
      phone: "+421 999 999 999", email: "info@web.sk", website: "https://web.sk",
      facebook: "facebook/old", instagram: "@old",
    }, category);
    assert.equal(saved.sourceData["Organizácia"], "Zachovať");
    assert.equal(Object.hasOwn(saved.sourceData, "Telefon"), false);
    assert.equal(Object.hasOwn(saved.sourceData, "Webstránka"), false);
    assert.equal(Object.hasOwn(saved.sourceData, "Email"), false);

    const empty = normalizeManagedDirectoryProfileInput({
      ...form(category),
      websiteUrl: "", publicPhone: "", publicEmail: "", facebookUrl: "", instagramUrl: "",
    }, source);
    assert.deepEqual(readDirectoryPublicContacts(empty.sourceData, empty.websiteUrl ?? ""), {
      phone: "", email: "", website: "", facebook: "", instagram: "",
    }, category);
    assert.equal(empty.sourceData["Organizácia"], "Zachovať");
  }
});

test("Editor and server use the explicit full-form contract, not only dirty paths", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const route = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(editor, /fullProfileSave: true/);
  assert.match(editor, /expectedUpdatedAt: breederBaseline\?\.updatedAt/);
  assert.match(route, /validateDirectoryFullProfileSave\(\{/);
  assert.match(route, /const fieldPreserved = !fullProfileSave && editedPaths/);
  assert.match(route, /const safeOptionalFields = fullProfileSave/);
  assert.match(route, /const confirmContactSync = \(fullProfileSave \|\| rawConfirmContactSync === true\)/);
  assert.match(route, /directoryContactValueMismatches\(expectedContactValues/);
  assert.match(route, /directoryContactValueMismatches\(expectedContactValues/);
});
