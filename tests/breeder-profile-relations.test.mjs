import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BREEDER_CLUB_IDS_METADATA_KEY,
  parseBreederClubIds,
  validateBreederRelations,
} from "../lib/breeder-profile-relations.ts";

test("club relations roundtrip in private metadata, independent of gallery and text fields", () => {
  const source = {
    "Chovateľ": "Ivana Zástěrová",
    "_psipedia_breeder_gallery_urls": JSON.stringify(["/media/a.jpg"]),
    [BREEDER_CLUB_IDS_METADATA_KEY]: JSON.stringify([17, 23]),
  };
  assert.deepEqual(parseBreederClubIds(JSON.stringify(source)), [17, 23]);
  assert.deepEqual(parseBreederClubIds(JSON.stringify({ ...source, [BREEDER_CLUB_IDS_METADATA_KEY]: "[]" })), []);
  assert.deepEqual(parseBreederClubIds("{}"), []);
  assert.deepEqual(parseBreederClubIds("not-json"), []);
});

test("relationship selection only accepts distinct positive canonical IDs", () => {
  assert.deepEqual(validateBreederRelations({ breedIds: [8, 11], clubIds: [5] }), {
    breedIds: [8, 11], clubIds: [5],
  });
  assert.throws(() => validateBreederRelations({ breedIds: [8, 8], clubIds: [] }), /duplicitné/);
  assert.throws(() => validateBreederRelations({ breedIds: ["8"], clubIds: [] }), /neplatné/);
  assert.throws(() => validateBreederRelations({ breedIds: [0], clubIds: [] }), /neplatné/);
  assert.throws(() => validateBreederRelations({ breedIds: [], clubIds: "5" }), /najviac/);
});

test("canonical breed relation is reused and club selection only affects breeder metadata", async () => {
  const store = await readFile(new URL("../lib/breeder-profile-relations.ts", import.meta.url), "utf8");
  assert.match(store, /breed_directory_relations/);
  assert.match(store, /category='chovatelske-kluby'/);
  assert.match(store, /json_set\(source_data_json/);
  assert.match(store, /canonicalBreedIdsSql/);
  assert.match(store, /category='chovatelske-stanice'/);
  const metadata = await readFile(new URL("../lib/directory-profile-metadata.ts", import.meta.url), "utf8");
  assert.match(metadata, /BREEDER_CLUB_IDS_METADATA_KEY/);
  const route = await readFile(new URL("../app/api/admin/directory/[id]/breeder-relations/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /saveBreederRelationSelection/);
});

test("shared detail template places expertise under contact and gallery before reviews", async () => {
  const source = await readFile(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");
  const contact = source.indexOf('key: "contact"');
  const expertise = source.indexOf('key: "expertise"');
  const services = source.indexOf('key: "services"');
  const gallery = source.indexOf('key: "breeder-gallery"');
  const reviews = source.indexOf('key: "reviews"');
  assert.ok(contact > 0 && expertise > contact && services > expertise);
  assert.ok(gallery > services && reviews > gallery);
  assert.match(source, /key: "expertise",\s*column: "aside"/);
  assert.match(source, /relatedClubs\.map\(club => <Link/);
  assert.match(source, /relatedBreeds\.map\(breed => <Link/);
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /Prepojené plemená a chovateľské kluby/);
  assert.match(editor, /breederRelationsDirty/);
  assert.match(editor, /\/breeder-relations/);
});
