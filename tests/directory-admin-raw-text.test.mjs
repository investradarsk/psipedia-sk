import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeManagedDirectoryProfileInput } from "../lib/directory-store.ts";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";
import { DIRECTORY_CONTACT_EDITORIAL_PATHS } from "../lib/notion-breeder-field-events.ts";

const categories = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
];

for (const category of categories) {
  test("Admin stores arbitrary editorial values in " + category + " without deleting/truncating them", () => {
    const rawAddress = "Miesto <neoverené> 999 " + "X".repeat(520);
    const rawPhone = "nesprávne číslo 🐕 +++";
    const rawEmail = "toto.nie.je@email";
    const rawWebsite = "web bez protokolu + nesprávny odkaz";
    const rawFacebook = "facebook neplatné";
    const rawInstagram = "instagram ???";
    const rawSeo = "SEO title " + "N".repeat(350);
    const itemList = Array.from({ length: 25 }, (_, i) => "Neformálny text č." + i);
    const requested = {
      name: "Test " + category,
      slug: "redakcny-test-" + category,
      category,
      status: "draft",
      excerpt: "Krátky text",
      description: "Odstavec jeden\n\nOdstavec dva",
      region: "Nitriansky kraj",
      district: "Zlaté Moravce",
      city: "Zlaté Moravce",
      address: rawAddress,
      street: "Nepotvrdená ulica <>",
      postalCode: "ABC + zlé PSČ",
      houseNumber: "abc/xxx 🐕",
      services: itemList,
      qualifications: itemList,
      websiteUrl: rawWebsite,
      publicPhone: rawPhone,
      publicEmail: rawEmail,
      facebookUrl: rawFacebook,
      instagramUrl: rawInstagram,
      priceNote: "Cena ABC, nevypĺňam číslo",
      seo: {
        title: rawSeo,
        description: "SEO popis podľa redaktora",
        focusKeyword: "niečo ľubovoľné",
        canonicalUrl: "neplatná canonical URL",
        ogImage: "nie URL",
        ogTitle: "OG nadpis",
        ogDescription: "OG ľubovoľný text",
        noindex: false,
      },
    };
    const result = normalizeManagedDirectoryProfileInput(requested);
    assert.equal(result.address, rawAddress);
    assert.equal(result.postalCode, requested.postalCode);
    assert.equal(result.houseNumber, requested.houseNumber);
    assert.equal(result.street, requested.street);
    assert.equal(result.websiteUrl, rawWebsite);
    assert.equal(result.publicPhone, rawPhone);
    assert.equal(result.publicEmail, rawEmail);
    assert.equal(result.facebookUrl, rawFacebook);
    assert.equal(result.instagramUrl, rawInstagram);
    assert.equal(result.seo.title, rawSeo);
    assert.equal(result.seo.canonicalUrl, requested.seo.canonicalUrl);
    assert.equal(result.seo.ogImage, "nie URL");
    assert.equal(result.services.length, 25);
    assert.equal(result.qualifications.length, 25);
    const contacts = readDirectoryPublicContacts(result.sourceData, result.websiteUrl);
    assert.deepEqual(contacts, {
      phone: rawPhone, email: rawEmail, website: rawWebsite,
      facebook: rawFacebook, instagram: rawInstagram,
    });
  });
}

test("API never erases malformed optional contacts or bypasses confirmation", () => {
  const route = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.doesNotMatch(route, /Neplatný nepovinný odkaz bol vynechaný/);
  assert.doesNotMatch(route, /Neplatný nepovinný e-mail bol vynechaný/);
  assert.doesNotMatch(route, /sanitizedOptionalPaths/);
  assert.match(route, /directoryEditedFieldMismatches\(\{/);
  assert.match(route, /status: 409/);
});

test("Directory editor uses text inputs and does not erase unrelated location data", () => {
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  for (const id of ["directory-phone", "directory-public-email", "directory-website", "directory-facebook", "directory-instagram"]) {
    assert.match(editor, new RegExp('id="' + id + '" type="text"'));
  }
  assert.match(editor, /id="directory-street" type="text"/);
  const locationOnChange = editor.slice(
    editor.indexOf("onChange={(location) => {", editor.indexOf("<SlovakiaLocationSelector")),
    editor.indexOf("<DirectoryAddressAutocomplete"),
  );
  // No address field may be automatically cleared by another field edit.
  for (const setter of ["setPostalCode", "setHouseNumber", "setStreet"]) {
    assert.ok(!locationOnChange.includes(setter + '("")'), setter + " must not clear editorial text");
  }
  assert.doesNotMatch(editor, /inputMode="numeric"/);
});

test("all five Notion contact properties use the same plain rich-text serializer as Popis", () => {
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  const start = notion.indexOf("function notionProfileProperties(");
  const end = notion.indexOf("function ", start + 10);
  assert.ok(start >= 0 && end > start);
  const serializer = notion.slice(start, end);
  for (const [property, field] of [
    ["Web", "websiteUrl"],
    ["Telefón", "publicPhone"],
    ["E-mail", "publicEmail"],
    ["Facebook", "facebookUrl"],
    ["Instagram", "instagramUrl"],
  ]) {
    assert.ok(serializer.includes('"' + property + '": richText(snapshot.' + field + ')'),
      property + " must accept arbitrary text, including xxx");
  }
  assert.ok(serializer.includes('"Popis": richText(snapshot.description)'));
  const converterStart = notion.indexOf("function adaptDirectoryNotionTextProperties(");
  const converterEnd = notion.indexOf("async function createNotionPage(", converterStart);
  const converter = notion.slice(converterStart, converterEnd);
  assert.match(converter, /Array\.isArray\(previous\?\.rich_text\)\) continue/);
  assert.match(notion, /adaptDirectoryNotionTextProperties\(\s*\{ \[key\]: allProperties\[key\] \}, page\.properties \?\? \{\}/);
});

test("literal xxx survives D1 contact encoding for every directory category", () => {
  for (const category of categories) {
    const normalized = normalizeManagedDirectoryProfileInput({
      name: "Test contacts", category, status: "draft",
      description: "Popis xxx", excerpt: "Perex xxx",
      websiteUrl: "xxx", publicPhone: "xxx", publicEmail: "xxx",
      facebookUrl: "xxx", instagramUrl: "xxx",
    });
    assert.deepEqual(readDirectoryPublicContacts(normalized.sourceData, normalized.websiteUrl), {
      phone: "xxx", email: "xxx", website: "xxx", facebook: "xxx", instagram: "xxx",
    });
  }
});

test("saving Contacts re-confirms all five D1 text values in Notion, including an unchanged xxx", () => {
  assert.deepEqual([...DIRECTORY_CONTACT_EDITORIAL_PATHS], [
    "websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl",
  ]);
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const route = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  assert.match(editor, /currentDirectorySection === "directory-contacts"/);
  assert.match(editor, /confirmContactSync \? \{ confirmContactSync: true \} : \{\}/);
  assert.match(editor, /breederChangedPaths\?\.length \|\| confirmContactSync/);
  assert.match(route, /rawConfirmContactSync === true && editedPaths !== null/);
  assert.match(route, /submittedBody\.category === before\.category/);
  assert.match(route, /\.\.\.\(confirmContactSync \? DIRECTORY_CONTACT_EDITORIAL_PATHS : \[\]\)/);
  assert.match(route, /metadataWarnings\.push\("Kontakty sú uložené v Admine, ale prenos do Notionu nie je potvrdený\."/);
  assert.match(notion, /if \(confirmed\(page, path\)\) continue/);
  assert.match(notion, /DIRECTORY_ADMIN_TO_NOTION_FIELD_ECHO_MISMATCH/);
});
