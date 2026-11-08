import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ensureCanonicalServiceChoicesInLegacy } from "../lib/service-profile-notion-bridge.ts";
import { readTrainerServicesText, isDirectoryInternalMetadataKey,
  TRAINER_SERVICES_TEXT_METADATA_KEY, TRAINER_BREED_IDS_METADATA_KEY,
  TRAINER_CLUB_IDS_METADATA_KEY } from "../lib/directory-profile-metadata.ts";
import { getBreederRelationSelection } from "../lib/breeder-profile-relations.ts";

test("RSDC: canonical YES choices fill missing public labels without duplicate aliases", async () => {
  const profile = {
    id: 543, category: "treneri", updated_at: "2026-11-06T00:00:00Z",
    services_json: JSON.stringify([
      "základná poslušnosť", "agility", "obedience",
      "dogfrisbee", "dogdancing", "show handling",
    ]),
  };
  const db = {
    prepare(sql) {
      const statement = {
        async all() {
          assert.match(sql, /service_catalog_admin_options/);
          return { results: [] };
        },
        bind(...params) {
          return {
            async first() {
              if (sql.startsWith("SELECT id,category,services_json")) return { ...profile };
              if (sql.startsWith("UPDATE directory_profiles")) {
                assert.equal(params[2], 543);
                assert.equal(params[3], profile.services_json);
                profile.services_json = params[0];
                profile.updated_at = params[1];
                return { id: 543 };
              }
              throw new Error("Unexpected SQL: " + sql);
            },
          };
        },
      };
      return statement;
    },
  };
  const selections = [
    "svc.training.basic_obedience", "svc.training.agility",
    "svc.training.obedience", "svc.training.dogfrisbee",
    "svc.training.dogdancing", "svc.training.show_handling",
    "svc.training.socialization", "svc.training.rally_obedience",
  ];
  assert.equal(await ensureCanonicalServiceChoicesInLegacy(db, 543, selections), 2);
  assert.deepEqual(JSON.parse(profile.services_json), [
    "základná poslušnosť", "agility", "obedience",
    "dogfrisbee", "dogdancing", "show handling",
    "Socializačné tréningy", "Rally obedience",
  ]);
  assert.equal(await ensureCanonicalServiceChoicesInLegacy(db, 543, selections), 0);
});

test("trainer Notion webhook and Admin PUT reuse field events without bulk profile reconciliation", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const webhook = await readFile(new URL("../app/api/integrations/notion/webhook/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
  assert.match(directory, /\["chovatelske-stanice", "treneri"\]\.includes\(profile\.category\)/);
  assert.match(directory, /relationChanged/);
  assert.match(directory, /notionAdditionsOnly/);
  assert.match(directory, /propertyText\(page, "Kategória"\) === "treneri"\) continue/);
  assert.match(webhook, /dp\.category IN \('chovatelske-stanice','treneri'\)/);
  assert.match(admin, /\["chovatelske-stanice", "treneri"\]\.includes\(before\.category\)/);
  assert.match(editor, /category === profile\.category && breederBaseline/);
});

test("mapped trainer without an explicit change does not enter legacy baseline conflict resolution", async () => {
  const source = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const trainer = source.indexOf('if (profile.category === "treneri" &&');
  const breeder = source.indexOf('if (profile.category === "chovatelske-stanice" &&', trainer);
  const legacy = source.indexOf("LOSSLESS_FIELD_REVIEW_REQUIRED", trainer);
  assert.ok(trainer > 0 && breeder > trainer && legacy > breeder);
  const guard = source.slice(trainer, breeder);
  assert.match(guard, /!input\.manualDirection/);
  assert.match(guard, /input\.breederWebhookPropertyIds === undefined/);
  assert.match(guard, /input\.breederAdminFields === undefined/);
  assert.match(guard, /TRAINER_IDENTITY_MISMATCH/);
  assert.match(guard, /return "unchanged" as const/);
  // Actual signed field events still reach syncBreederEvent, not the no-op guard.
  assert.match(source.slice(breeder, legacy), /return syncBreederEvent\(\{/);
});

test("signed Notion catalog changes are additions-only and guarded by relation readback", async () => {
  const relation = await readFile(new URL("../lib/service-catalog-notion-relations.ts", import.meta.url), "utf8");
  assert.match(relation, /const target=\[\.\.\.new Set\(\[\.\.\.local,\.\.\.remote\]\)\]\.sort\(\)/);
  assert.match(relation, /SERVICES_RELATION_CHANGED_BEFORE_IMPORT/);
  assert.match(relation, /ensureCanonicalServiceChoicesInLegacy\(db,profileId,confirmed\)/);
  assert.match(relation, /SERVICES_RELATION_WRITE_NOT_VERIFIED/);
  assert.match(relation, /syncProfileCatalogRelation/);
});

test("trainer free text is separate from Services V3 and persisted without touching services_json", async () => {
  assert.equal(readTrainerServicesText(undefined), "");
  assert.equal(readTrainerServicesText({ [TRAINER_SERVICES_TEXT_METADATA_KEY]: "Nosework\nSocializácia" }),
    "Nosework\nSocializácia");
  for (const key of [TRAINER_SERVICES_TEXT_METADATA_KEY, TRAINER_BREED_IDS_METADATA_KEY, TRAINER_CLUB_IDS_METADATA_KEY])
    assert.equal(isDirectoryInternalMetadataKey(key), true);

  const [sync, store, editor, route] = await Promise.all([
    readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  // Inbound Notion text writes only a trainer metadata key, not the service list.
  assert.match(sync, /path === "services" && current\.category === "treneri"/);
  assert.match(sync, /TRAINER_SERVICES_TEXT_METADATA_KEY, text/);
  assert.match(sync, /current = await saveBreederEditorialValue\(database, current, desired, path\)/);
  assert.doesNotMatch(sync.slice(sync.indexOf("async function syncBreederEvent"), sync.indexOf("export async function mirrorBreederCategoryFiltersToNotion")), /Trainers retain their existing validator/);
  assert.match(sync, /const paths = breederNotionChangedFields\(page\.properties, input\.changedPropertyIds\);/);
  assert.match(store, /key === TRAINER_SERVICES_TEXT_METADATA_KEY \|\| !isDirectoryInternalMetadataKey\(key\)/);
  assert.match(store, /sourceData\[TRAINER_SERVICES_TEXT_METADATA_KEY\] = payload\.trainerServicesText/);
  assert.match(editor, /Služby – voľný text \(Notion\)/);
  assert.match(route, /services: before\.services/);
  assert.match(route, /trainerServicesText: rawTrainerServicesEdited === true/);
});

test("trainer relations use independent storage and can load both name-selected links", async () => {
  const fakeDb = {
    prepare(query) {
      assert.match(query, /FROM directory_profiles WHERE id=/);
      return {
        bind(id) {
          assert.equal(id, 543);
          return { async first() {
            return { id, category: "treneri", status: "published",
              source_data_json: JSON.stringify({
                [TRAINER_BREED_IDS_METADATA_KEY]: "[5,14]",
                [TRAINER_CLUB_IDS_METADATA_KEY]: "[18]",
              }),
            };
          } };
        },
      };
    },
  };
  assert.deepEqual(await getBreederRelationSelection(fakeDb, 543),
    { breedIds: [5, 14], clubIds: [18] });

  const [relations, sync, page, detail, editor] = await Promise.all([
    readFile(new URL("../lib/breeder-profile-relations.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(relations, /category='treneri' AND status <> 'archived' AND source_data_json=\?/);
  assert.match(relations, /TRAINER_BREED_IDS_METADATA_KEY/);
  assert.match(relations, /TRAINER_CLUB_IDS_METADATA_KEY/);
  assert.match(sync, /const relationFields = \["chovatelske-stanice", "treneri"\]/);
  assert.match(sync, /mirrorBreederRelationNamesToNotion/);
  assert.match(page, /\["chovatelske-stanice", "treneri"\]\.includes\(profile\.category\)/);
  assert.match(detail, /const hasNamedLinks = isBreeder \|\| presentation\.category === "treneri"/);
  assert.match(editor, /\["chovatelske-stanice", "treneri"\]\.includes\(category\)/);
});
