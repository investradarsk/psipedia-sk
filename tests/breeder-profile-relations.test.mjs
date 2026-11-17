import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateBreederRelations } from "../lib/breeder-profile-relations.ts";

test("relationship selection only accepts distinct positive canonical IDs", () => {
  assert.deepEqual(validateBreederRelations({ breedIds: [8, 11], clubIds: [5] }), {
    breedIds: [8, 11], clubIds: [5],
  });
  assert.throws(() => validateBreederRelations({ breedIds: [8, 8], clubIds: [] }), /duplicitné/);
  assert.throws(() => validateBreederRelations({ breedIds: ["8"], clubIds: [] }), /neplatné/);
  assert.throws(() => validateBreederRelations({ breedIds: [0], clubIds: [] }), /neplatné/);
  assert.throws(() => validateBreederRelations({ breedIds: [], clubIds: "5" }), /najviac/);
});

test("canonical breed relation is reused and club selection is stored in SQL", async () => {
  const store = await readFile(new URL("../lib/breeder-profile-relations.ts", import.meta.url), "utf8");
  assert.match(store, /breed_directory_relations/);
  assert.match(store, /category='chovatelske-kluby'/);
  assert.doesNotMatch(store, /json_set\(source_data_json/);
  assert.match(store, /directory_breeder_club_relations/);
  assert.match(store, /canonicalBreedIdsSql/);
  assert.match(store, /category='chovatelske-stanice'/);
  const metadata = await readFile(new URL("../lib/directory-profile-metadata.ts", import.meta.url), "utf8");
  assert.match(metadata, /BREEDER_CLUB_IDS_METADATA_KEY/); // Retained only as historical migration metadata, never as live relations.
  const route = await readFile(new URL("../app/api/admin/directory/[id]/breeder-relations/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /saveBreederRelationSelection/);
});

test("shared detail template places expertise under contact and gallery before reviews", async () => {
  const source = await readFile(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");
  const contact = source.indexOf('key: "contact"');
  const expertise = source.indexOf('key: "expertise"');
  const services = source.indexOf('key: "services"');
  const gallery = source.indexOf('key: "profile-gallery"');
  const reviews = source.indexOf('key: "reviews"');
  assert.ok(contact > 0 && expertise > contact && services > expertise);
  assert.ok(gallery > services && reviews > gallery);
  assert.match(source, /key: "expertise",\s*column: "aside"/);
  // The shared expertise grid renders canonical links with stable IDs;
  // an earlier assertion expected an obsolete unkeyed inline link shape.
  assert.match(source, /relatedClubs\.map\(\s*\(?club\)?\s*=>\s*\(?\s*<Link key=\{club\.id\} href=\{club\.href\}>/);
  assert.match(source, /relatedBreeds\.map\(\s*\(?breed\)?\s*=>\s*\(?\s*<Link key=\{breed\.id\} href=\{breed\.href\}>/);
  assert.match(source, /<DetailOptionGrid options=\{\[\.\.\.expertFacts, \.\.\.breederLinkFacts\]\}\s*\/>/);
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /Prepojené plemená a chovateľské kluby/);
  assert.match(editor, /breederRelationsDirty/);
  assert.match(editor, /\/breeder-relations/);
});

test("directory breed filters use published canonical relations ahead of legacy labels", async () => {
  const store = await readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
  const breeder = await readFile(new URL("../lib/directory-breeder-card.ts", import.meta.url), "utf8");
  const detail = await readFile(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");
  assert.match(store, /DIRECTORY_HAS_CANONICAL_BREEDS/);
  assert.match(store, /linked_breed\.id IN \(\$\{canonicalBreedIdsSql\}\)/);
  assert.match(store, /linked_breed\.name = \?/);
  assert.match(store, /NOT \$\{DIRECTORY_HAS_CANONICAL_BREEDS\}/);
  assert.match(store, /canonicalBreedOptions/);
  assert.match(store, /loadCanonicalBreedOptions\(\)/);
  assert.match(breeder, /breedSummary: names\.join\(", "\)/);
  assert.match(detail, /suppressLinkedBreederFact/);
  assert.match(detail, /suppressLinkedBreederQualification/);
});

test("Admin proposes explicit canonical links from legacy labels without rewriting old text", async () => {
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  const options = await readFile(new URL("../lib/breeder-profile-relations.ts", import.meta.url), "utf8");
  assert.match(editor, /suggestBreederRelationIds\(legacyText, group\.options\)/);
  assert.match(editor, /data-breeder-legacy-relation-proposal/);
  assert.match(editor, /Použiť existujúce prepojenie/);
  assert.match(editor, /isCanonicalRelationText\(field\)/);
  assert.match(editor, /!isCanonicalRelationText\(key\)/);
  assert.match(editor, /setBreederRelationsDirty\(true\)/);
  assert.match(options, /SELECT id,name,slug,city,status FROM directory_profiles/);
  assert.match(options, /SELECT id,name,slug,status FROM managed_breeds/);
});
