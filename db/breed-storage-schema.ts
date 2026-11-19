/**
 * Plemená 0174 (staged schema-only): planned D1 1:1 tables + SQL relations.
 * NOT bound into db/index.ts until production schema 0174 is verified.
 * The existing managed_breeds and its legacy JSON fields stay untouched.
 * SQL-only `seo_*` columns are staged in drizzle/0174 and are
 * deliberately NOT appended to the live managedBreeds Drizzle projection
 * before physical production installation, avoiding SELECT * regressions.
 */
import { integer, primaryKey, sqliteTable, text, real, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { managedBreeds } from "./schema";

export const breedFciStandard = sqliteTable("breed_fci_standard", {
  breedId: integer("breed_id").primaryKey()
    .references(() => managedBreeds.id, { onDelete: "cascade" }),
  fciStatusFci: text("fci_status_fci"),
  fciHistorickySuhrn: text("fci_historicky_suhrn"),
  fciCelkovyVzhlad: text("fci_celkovy_vzhlad"),
  fciDoleziteProporcie: text("fci_dolezite_proporcie"),
  fciPovahaTemperament: text("fci_povaha_temperament"),
  fciHlavaLebecnaCast: text("fci_hlava_lebecna_cast"),
  fciHlavaTvarovaCast: text("fci_hlava_tvarova_cast"),
  fciOci: text("fci_oci"),
  fciUsi: text("fci_usi"),
  fciKrk: text("fci_krk"),
  fciTelo: text("fci_telo"),
  fciChvost: text("fci_chvost"),
  fciPredneKoncatiny: text("fci_predne_koncatiny"),
  fciZadneKoncatiny: text("fci_zadne_koncatiny"),
  fciPohyb: text("fci_pohyb"),
  fciKoza: text("fci_koza"),
  fciSrst: text("fci_srst"),
  fciFarba: text("fci_farba"),
  fciVyskaPesCm: text("fci_vyska_pes_cm"),
  fciVyskaSukaCm: text("fci_vyska_suka_cm"),
  fciHmotnostPesKg: text("fci_hmotnost_pes_kg"),
  fciHmotnostSukaKg: text("fci_hmotnost_suka_kg"),
  fciVelkostHmotnostPoznamka: text("fci_velkost_hmotnost_poznamka"),
  fciChyby: text("fci_chyby"),
  fciZavazneChyby: text("fci_zavazne_chyby"),
  fciDiskvalifikacneChyby: text("fci_diskvalifikacne_chyby"),
  fciPoznamkaChov: text("fci_poznamka_chov"),
  fciVyuzitie: text("fci_vyuzitie"),
  fciFciSkupinaNazov: text("fci_fci_skupina_nazov"),
  fciFciSekciaNazov: text("fci_fci_sekcia_nazov"),
  fciZdrojPoznamka: text("fci_zdroj_poznamka"),
  fciFciNomenklaturaUrl: text("fci_fci_nomenklatura_url"),
  fciFciStandardPdf: text("fci_fci_standard_pdf"),
});

export const breedEditorialText = sqliteTable("breed_editorial_text", {
  breedId: integer("breed_id").primaryKey()
    .references(() => managedBreeds.id, { onDelete: "cascade" }),
  overview: text("overview"),
  coatCare: text("coat_care"),
  familyLife: text("family_life"),
  otherDogsLife: text("other_dogs_life"),
  curiosities: text("curiosities"),
  commonOwnerMistakes: text("common_owner_mistakes"),
  exerciseTip: text("exercise_tip"),
  trainingTip: text("training_tip"),
  healthTip: text("health_tip"),
  coatTip: text("coat_tip"),
  heroTraitsJson: text("hero_traits_json"),
}, (table) => [
  check("breed_editorial_hero_traits_json_array", sql`${table.heroTraitsJson} IS NULL OR CASE WHEN json_valid(${table.heroTraitsJson}) THEN json_type(${table.heroTraitsJson})='array' ELSE 0 END`),
]);

export const breedPublicFacts = sqliteTable("breed_public_facts", {
  breedId: integer("breed_id").primaryKey()
    .references(() => managedBreeds.id, { onDelete: "cascade" }),
  heightMinCm: real("height_min_cm"),
  heightMaxCm: real("height_max_cm"),
  weightMinKg: real("weight_min_kg"),
  weightMaxKg: real("weight_max_kg"),
  lifespanMinYears: real("lifespan_min_years"),
  lifespanMaxYears: real("lifespan_max_years"),
  originCountriesJson: text("origin_countries_json"),
  coatTypesJson: text("coat_types_json"),
  useTypesJson: text("use_types_json"),
}, (table) => [
  check("breed_public_facts_origin_countries_json_array", sql`${table.originCountriesJson} IS NULL OR CASE WHEN json_valid(${table.originCountriesJson}) THEN json_type(${table.originCountriesJson}) = 'array' ELSE 0 END`),
  check("breed_public_facts_coat_types_json_array", sql`${table.coatTypesJson} IS NULL OR CASE WHEN json_valid(${table.coatTypesJson}) THEN json_type(${table.coatTypesJson}) = 'array' ELSE 0 END`),
  check("breed_public_facts_use_types_json_array", sql`${table.useTypesJson} IS NULL OR CASE WHEN json_valid(${table.useTypesJson}) THEN json_type(${table.useTypesJson}) = 'array' ELSE 0 END`),
]);

export const breedRelatedBreeds = sqliteTable("breed_related_breeds", {
  breedId: integer("breed_id").notNull()
    .references(() => managedBreeds.id, { onDelete: "cascade" }),
  relatedBreedId: integer("related_breed_id").notNull()
    .references(() => managedBreeds.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.breedId, table.relatedBreedId] }),
  uniqueIndex("breed_related_breeds_unique_position").on(table.breedId,table.position),
  index("breed_related_breeds_target_idx").on(table.relatedBreedId,table.breedId),
  check("breed_related_breeds_nonnegative_position",sql`${table.position} >= 0`),
  check("breed_related_breeds_no_self_relation",sql`${table.breedId} <> ${table.relatedBreedId}`),
]);
