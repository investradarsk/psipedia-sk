import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detailFields,
  directoryPublicEditorFieldLabels,
  isDirectoryPublicMetadataField,
  readDirectoryPublicMetadataValue,
} from "../lib/directory-public-facts.ts";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all rendered category-specific directory facts are offered by the Admin editor", () => {
  const categories = [
    "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby",
  ];
  for (const category of categories) {
    const fields = directoryPublicEditorFieldLabels(category);
    assert.equal(fields.length, new Set(fields).size, category);
    for (const field of detailFields[category] ?? []) {
      if (["Organizácia", "Zameranie", "Zastrešujúca organizácia"].includes(field)) continue;
      assert.ok(fields.includes(field), category + ": missing " + field);
      assert.equal(isDirectoryPublicMetadataField(field), true, category + ": " + field);
    }
    assert.ok(fields.includes("Pokrytie"), category);
  }
  for (const field of ["Ordinačné hodiny", "Organizácia", "Zameranie", "Alt text obrázka"]) {
    assert.equal(isDirectoryPublicMetadataField(field), true, field);
  }
  for (const field of ["source_data_json", "__proto__", "Kvalita skontrolované", "Slug"]) {
    assert.equal(isDirectoryPublicMetadataField(field), false, field);
  }
});

test("a canonical field explicitly cleared in Admin must never revive a legacy import alias", () => {
  const source = {
    "Organizácia": "", "Zastrešujúca organizácia": "Starý klub",
    "Ordinačné hodiny": "", "Otváracie hodiny": "Starý rozpis",
    Pokrytie: "", "Oblasť pôsobenia": "Staré územie",
  };
  assert.equal(readDirectoryPublicMetadataValue(source, "Organizácia"), "");
  assert.equal(readDirectoryPublicMetadataValue(source, "Ordinačné hodiny"), "");
  assert.equal(readDirectoryPublicMetadataValue(source, "Pokrytie"), "");

  const legacy = {
    "Zastrešujúca organizácia": "Klub z importu",
    "Otváracie hodiny": "",
    "Ordinačná doba": "Po–Pi 09:00–15:00",
    "Oblasť pôsobenia": "Nitra",
  };
  assert.equal(readDirectoryPublicMetadataValue(legacy, "Organizácia"), "Klub z importu");
  assert.equal(readDirectoryPublicMetadataValue(legacy, "Ordinačné hodiny"), "Po–Pi 09:00–15:00");
  assert.equal(readDirectoryPublicMetadataValue(legacy, "Pokrytie"), "Nitra");
  assert.equal(readDirectoryPublicMetadataValue(null, "Organizácia"), "");
});

test("public presentation, editor and guarded Admin save share the same public fact contract", () => {
  const presentation = source("lib/directory-detail-presentation.ts");
  const editor = source("components/admin-directory-editor.tsx");
  const route = source("app/api/admin/directory/[id]/route.ts");
  const notion = source("lib/notion-directory-sync.ts");

  assert.match(presentation, /import \{ detailFields, relationFields, readDirectoryPublicMetadataValue \} from/);
  assert.match(presentation, /importedValue\(profile, "Ordinačné hodiny"\)/);
  assert.match(presentation, /importedValue\(profile, "Pokrytie"\)/);
  assert.match(editor, /directoryPublicEditorFieldLabels\(category\)\.map\(field => \(/);
  assert.match(editor, /pilotMetadataOriginalValues/);
  assert.match(route, /isDirectoryPublicMetadataField\(field\)/);
  assert.match(route, /DIRECTORY_PILOT_METADATA_ADMIN_SAVE_FAILED/);
  assert.match(notion, /isDirectoryPublicMetadataField\(input\.field\)/);
  assert.match(notion, /DIRECTORY_PUBLIC_METADATA_STALE_VALUE/);
  assert.match(notion, /AND updated_at = \?/);
});
