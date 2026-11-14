import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { readDirectoryPublicContacts } from "../lib/directory-profile-metadata.ts";
import { breederPreserveUneditedFields } from "../lib/notion-breeder-field-events.ts";


test("directory website save uses canonical persisted D1 column, not stale legacy Web alias", () => {
  const editor = source("components/admin-directory-editor.tsx");
  assert.match(editor, /unconfirmedWebsite[\s\S]*data\.profile\.websiteUrl/);
  assert.doesNotMatch(editor, /readDirectoryPublicContacts\(data\.profile\.importData/);
  assert.match(editor, /setWebsiteUrl\(savedProfile\.websiteUrl \?\? ""\)/);
  assert.match(editor, /pendingNotionFields/);
  assert.match(editor, /prenos do Notionu zatiaľ nie je potvrdený/);
});

test("explicit dirty fields are sent from the committed directory save to Notion", () => {
  const route = source("app/api/admin/directory/[id]/route.ts");
  assert.match(route, /breederAdminFields: isDirectoryFieldEventCategory\(before\.category\)[\s\S]*?\(editedPaths \?\? breederEditedFields\(before, profile\)\)/);
  assert.match(route, /updateManagedDirectoryProfile\(id, payload, user\.email, before\)/);
});

test("targeted Notion writeback confirms field echoes before marking synchronization complete", () => {
  const sync = source("lib/notion-directory-sync.ts");
  const start = sync.indexOf('  const fields = (input.adminChangedFields ?? []).filter(');
  const end = sync.indexOf('/**\n * Admin relation choices', start);
  assert.ok(start >= 0 && end > start);
  const writeback = sync.slice(start, end);
  assert.match(writeback, /const echoed = await patchNotionPage\(bindings, page\.id, patch\)/);
  assert.match(writeback, /fields\.every\(path =>/);
  assert.match(writeback, /DIRECTORY_ADMIN_TO_NOTION_FIELD_ECHO_MISMATCH/);
  assert.ok(writeback.indexOf("DIRECTORY_ADMIN_TO_NOTION_FIELD_ECHO_MISMATCH") <
    writeback.indexOf('"Sync stav": select("Synchronizované")'));
  assert.match(sync, /DIRECTORY_TARGETED_NOTION_SYNC_FAILED/);
});

test("explicit contact clears survive form baselines and remove old D1 aliases", () => {
  const editor = source("components/admin-directory-editor.tsx");
  const route = source("app/api/admin/directory/[id]/route.ts");
  assert.match(editor, /explicitlyClearedContacts = \(breederChangedPaths \?\? \[\]\)/);
  assert.match(editor, /explicitlyClearedContacts \} : \{\}/);
  assert.match(route, /editedPaths\.includes\(field as BreederEditorialField\)/);
  assert.match(route, /safeOptionalFields\.websiteUrl = null/);
  assert.match(route, /source_data_json = json_remove/);
  assert.match(route, /website_url = NULL/);
  assert.match(route, /AND updated_at = \?/);
  assert.match(route, /EXPLICIT_CONTACT_CLEAR_NOT_PERSISTED/);
  assert.match(route, /contactClearWarnings/);
});

test("legacy Web and Telefon survive a Facebook-only full form save", () => {
  // Reproduce a migrated profile: the visible Web lives in source_data_json
  // while the website_url column is NULL. Both the editor and server must
  // take the same effective contact value.
  const src = source("lib/notion-directory-sync.ts");
  const start = src.indexOf("function profileSnapshot(");
  const end = src.indexOf("function notionSnapshot(", start);
  assert.ok(start > 0 && end > start);
  const js = ts.transpileModule(src.slice(start, end) +
    "\nexports.profileSnapshot = profileSnapshot;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const values = {};
  runInNewContext(js, {
    exports: values,
    readDirectoryPublicContacts,
    clean: x => String(x ?? "").trim(),
    readTrainerServicesText: () => "",
    normalizeAdditionalDirectoryCategories: () => [],
    directoryQualityFields: [],
    directoryQualityCheckedAtSummary: () => "",
    externalSourceImageUrl: () => "",
    absoluteAsset: x => String(x ?? ""),
  });
  const profile = {
    category: "veterinari", name: "Veterina", status: "published",
    slug: "veterina", excerpt: "Perex", description: "Popis", services: [],
    qualifications: [], region: "", district: "", city: "", address: "",
    postalCode: "", street: "", houseNumber: "", addressFormat: "",
    priceNote: "", websiteUrl: null, internalEmail: null, imageUrl: null,
    importData: {
      Web: "www.veterina.sk", Telefon: "+421 905 123 456",
      "E-mail": "info@veterina.sk", Facebook: "starý Facebook",
      Instagram: "@veterina",
    },
    qualityMetadata: {}, verified: false, featured: false, seo: {},
  };
  const live = values.profileSnapshot(profile);
  assert.equal(live.websiteUrl, "www.veterina.sk");
  assert.equal(live.publicPhone, "+421 905 123 456");
  const submitted = {
    ...live, websiteUrl: "", publicPhone: "", publicEmail: "",
    facebookUrl: "nový Facebook", instagramUrl: "",
  };
  const preserved = breederPreserveUneditedFields(submitted, live, ["facebookUrl"]);
  assert.equal(preserved.websiteUrl, "www.veterina.sk");
  assert.equal(preserved.publicPhone, "+421 905 123 456");
  assert.equal(preserved.publicEmail, "info@veterina.sk");
  assert.equal(preserved.instagramUrl, "@veterina");
  assert.equal(preserved.facebookUrl, "nový Facebook");
});
