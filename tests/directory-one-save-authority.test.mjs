import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { isDirectoryAdminWritebackEcho } from "../lib/directory-notion-echo.ts";
import {
  BREEDER_NOTION_EDITORIAL_FIELDS, breederApplyNotionChanges,
  breederNotionChangedFields, breederReadPath,
} from "../lib/notion-breeder-field-events.ts";
import { normalizeManagedDirectoryProfileInput, buildManagedDirectoryProfileUpdateStatement } from "../lib/directory-store.ts";
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
  const editor = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const notion = readFileSync("lib/notion-directory-sync.ts", "utf8");
  assert.match(editor, /querySelector<HTMLInputElement>/);
  assert.match(editor, /\.\.\.submittedContacts,/);
  assert.match(admin, /fullProfileSave && isDirectoryFieldEventCategory\(before\.category\)/);
  assert.match(admin, /if \(editedPaths && !fullProfileSave\)/);
  assert.match(admin, /!fullProfileSave && Array\.isArray\(rawExplicitlyClearedContacts\)/);
  assert.match(admin, /const fieldPreserved = !fullProfileSave && editedPaths/);
  assert.match(admin, /const safeOptionalFields = fullProfileSave/);
  assert.match(admin, /directoryContactValueMismatches\(expectedContactValues/);
  assert.match(notion, /isDirectoryAdminWritebackEcho\(/);
  assert.match(notion, /UPDATE directory_notion_sync SET notion_last_edited_time = \?/);
});

test("Real SQLite canonical UPDATE: Save all Test, change Facebook only, retain other four, then clear email", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY, slug TEXT, name TEXT, category TEXT, status TEXT,
      excerpt TEXT, description TEXT, services_json TEXT, qualifications_json TEXT,
      city TEXT, district TEXT, region TEXT, address TEXT, postal_code TEXT,
      street TEXT, house_number TEXT, address_format TEXT,
      service_address_confirmation TEXT, online INTEGER, price_note TEXT,
      website_url TEXT, public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT,
      internal_email TEXT, image_url TEXT, image_key TEXT,
      thumbnail_display_json TEXT, detail_display_json TEXT, source_data_json TEXT,
      verified INTEGER, featured INTEGER, seo_json TEXT, search_text TEXT,
      updated_at TEXT, published_at TEXT, archived_at TEXT, updated_by TEXT
    )`);
    const d1 = { prepare(sql) {
      return { bind(...args) { return { async first() { return db.prepare(sql).get(...args) ?? null; } }; } };
    } };
    const originalRevision = "2026-11-16T06:00:00.000Z";
    db.prepare(`INSERT INTO directory_profiles
      (id,slug,name,category,status,updated_at,source_data_json,website_url,description,service_address_confirmation)
      VALUES (1817,'chvostikovo','Chvostikovo','hotely-a-opatrovanie','published',?,?,?,?,?)`
    ).run(originalRevision, JSON.stringify(historical), "stary-web", base.description, "LEGACY_UNCONFIRMED");
    const read = () => db.prepare("SELECT * FROM directory_profiles WHERE id=1817").get();
    let row = read();
    const update = async (form, revision) => {
      const current = {
        id: 1817, status: "published", updatedAt: row.updated_at,
        publishedAt: row.published_at, serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
        address: row.address || "", imageUrl: row.image_url, imageKey: row.image_key,
        importData: JSON.parse(row.source_data_json), seo: {},
      };
      const saved = await buildManagedDirectoryProfileUpdateStatement(
        d1, 1817, { ...form, category: "hotely-a-opatrovanie" },
        "admin@example.invalid", current, revision, { expectedUpdatedAt: row.updated_at },
      ).first();
      assert.ok(saved, "D1 update must succeed with matching revision");
      row = read();
      return readDirectoryPublicContacts(JSON.parse(row.source_data_json), row.website_url ?? "");
    };

    let contacts = await update(base, "2026-11-16T06:01:00.000Z");
    assert.deepEqual(contacts, {phone:"Test",email:"Test",website:"Test",facebook:"Test",instagram:"Test"});
    contacts = await update({...base, facebookUrl:"Testtesty"}, "2026-11-16T06:02:00.000Z");
    assert.deepEqual(contacts, {phone:"Test",email:"Test",website:"Test",facebook:"Testtesty",instagram:"Test"});
    assert.equal(row.description, base.description);
    assert.equal(JSON.parse(row.source_data_json)["Organizácia"], historical["Organizácia"]);
    contacts = await update({...base, facebookUrl:"Testtesty", publicEmail:""}, "2026-11-16T06:03:00.000Z");
    assert.deepEqual(contacts, {phone:"Test",email:"",website:"Test",facebook:"Testtesty",instagram:"Test"});
  } finally {
    db.close();
  }
});

test("A signed Notion phone-only change preserves the other four saved D1 contacts", () => {
  const current = {
    name: "Pazúrikovo", description: "Keep existing description",
    websiteUrl: "Test", publicPhone: "Test", publicEmail: "Test",
    facebookUrl: "Test", instagramUrl: "Test",
    seo: { title: "Keep title" },
  };
  const fromNotion = {
    ...current, publicPhone: "Test123", websiteUrl: "",
    publicEmail: "", facebookUrl: "", instagramUrl: "",
    description: "", seo: { title: "" },
  };
  const properties = {
    "Telefón": { id: "phone-field" },
    "E-mail": { id: "email-field" },
  };
  const signed = breederNotionChangedFields(properties, ["phone-field"]);
  assert.deepEqual(signed, ["publicPhone"]);
  assert.deepEqual(breederApplyNotionChanges(current, fromNotion, signed),
    { ...current, publicPhone: "Test123" });
});

test("Acknowledged Admin timestamp must NOT hide a genuine signed Notion edit", () => {
  const source = readFileSync("lib/notion-directory-sync.ts", "utf8");
  assert.match(source, /isDirectoryAdminWritebackEcho\(/);
  assert.match(source, /const changedIds = input\.breederWebhookPropertyIds \?\? \[\]/);
  assert.match(source, /const paths = breederNotionChangedFields\(page\.properties, changedIds\)/);
  assert.match(source, /const fromNotion = notionSnapshot\(page\)/);
  assert.match(source, /const fromD1 = profileSnapshot\(profile\)/);
  assert.match(source, /const editorialOnly = changedIds\.every\(id => editorialIds\.has\(id\)\)/);
  assert.match(source, /if \(editorialOnly && unchangedSignedValues\) return "unchanged"/);
  assert.match(source, /return syncBreederEvent\(\{/);

  const d1 = { publicPhone: "Test", facebookUrl: "Test" };
  const notionSame = { publicPhone: "Test", facebookUrl: "Test" };
  const notionChanged = { publicPhone: "Test123", facebookUrl: "Test" };
  const signedPhone = ["publicPhone"];
  const unchanged = (notion) => signedPhone.every(path =>
    JSON.stringify(breederReadPath(notion, path)) ===
    JSON.stringify(breederReadPath(d1, path)));
  assert.equal(unchanged(notionSame), true, "our own echo can be ignored");
  assert.equal(unchanged(notionChanged), false, "same-revision new value cannot be ignored");
  assert.equal(Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS).includes("publicPhone"), true);
});
