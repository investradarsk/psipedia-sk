import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  breederBreedSourceLabel,
  attachBreederCardBreeds,
} from "../lib/directory-breeder-card.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const station = (id, breedSummary = "") => ({
  id, category: "chovatelske-stanice", breedSummary,
});
const vet = (id) => ({ id, category: "veterinari" });

test("breeder fallback accepts only actual editorial breed names", () => {
  assert.equal(breederBreedSourceLabel("Labradorský retríver"), "Labradorský retríver");
  assert.equal(breederBreedSourceLabel("Border kólia; Zlatý retríver"), "Border kólia, Zlatý retríver");
  assert.equal(breederBreedSourceLabel('["Akita","Labradorský retríver"]'), "Akita, Labradorský retríver");
  assert.equal(breederBreedSourceLabel(["Akita", "Akita", "Beagle"]), "Akita, Beagle");
  assert.equal(breederBreedSourceLabel("Aktívny chov"), "");
  assert.equal(breederBreedSourceLabel(null), "");
});

test("canonical published breed relations take precedence in a single batch and other categories stay unchanged", async () => {
  let calls = 0;
  let sql = "";
  let ids = [];
  const database = {
    prepare(query) {
      calls++;
      sql = query;
      return {
        bind(input) {
          ids = JSON.parse(input);
          return {
            async all() {
              return { results: [
                { profileId: 1, breedName: "Labradorský retríver" },
                { profileId: 1, breedName: "Zlatý retríver" },
                { profileId: 2, breedName: "Nemecký ovčiak" },
              ] };
            },
          };
        },
      };
    },
  };
  const other = vet(10);
  const profiles = await attachBreederCardBreeds(database, [station(1), station(2), other]);
  assert.equal(calls, 1);
  assert.deepEqual(ids, [1, 2]);
  assert.match(sql, /breed_directory_relations/);
  assert.match(sql, /canonical/);
  assert.equal(profiles[0].breedSummary, "Labradorský retríver, Zlatý retríver");
  assert.equal(profiles[1].breedSummary, "Nemecký ovčiak");
  assert.equal(profiles[2], other);
});

test("no station skips relations; relation failures preserve editorial fallback", async () => {
  let calls = 0;
  const database = {
    prepare() {
      calls++;
      throw Error("unavailable");
    },
  };
  const others = [vet(10)];
  assert.equal(await attachBreederCardBreeds(database, others), others);
  assert.equal(calls, 0);
  const fallback = [station(3, "Border kólia")];
  const result = await attachBreederCardBreeds(database, fallback);
  assert.equal(result[0].breedSummary, "Border kólia");
  assert.equal(calls, 1);
});

test("all public breeder listing routes attach the same display-only projection", () => {
  const store = read("lib/directory-store.ts");
  const landing = read("lib/breeding-station-landings.ts");
  const card = read("components/directory-card.tsx");
  assert.match(store, /attachBreederCardBreeds\(database, result\.results\.map\(rowToPublicProfile\)\)/);
  assert.match(store, /profiles: await attachBreederCardBreeds/);
  assert.match(store, /previews\["chovatelske-stanice"\] = await attachBreederCardBreeds/);
  assert.match(store, /AS breeder_breed_source/);
  assert.match(landing, /profiles: await attachBreederCardBreeds\(database, rows\.map\(profileFromRow\)\)/);
  assert.match(card, /profile\.category === "chovatelske-stanice"/);
  assert.match(card, /meta=\{breederBreeds \?/);
  assert.doesNotMatch(card, /Aktívny chov/);
});
