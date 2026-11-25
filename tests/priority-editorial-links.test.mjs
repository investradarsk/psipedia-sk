import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { listPriorityEditorialLinks } from "../lib/priority-editorial-links.ts";

test("priority links only use verified, canonical targets from their assigned source pages", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY, category TEXT, slug TEXT, status TEXT, archived_at TEXT);
      CREATE TABLE directory_profile_seo(profile_id INTEGER, canonical_url TEXT, noindex INTEGER);
      INSERT INTO directory_profiles(id, category, slug, status) VALUES
        (1,'veterinari','veterinarna-klinika-primavet','published'),
        (2,'treneri','canis-arena','published'),
        (3,'chovatelske-stanice','emalera','published'),
        (4,'chovatelske-stanice','ab-astris','draft'),
        (5,'dalsie-sluzby','spiritas-krematorium-pre-psy-zilina','published');
      INSERT INTO directory_profile_seo VALUES
        (1,'https://psipedia.sk/adresar/veterinari/veterinarna-klinika-primavet',0),
        (2,'/adresar/treneri/inny-profil',0),
        (5,'',1);
    `);
    let calls = 0;
    const database = {
      prepare(sql) {
        calls++;
        return {
          bind: (...args) => ({ all: async () => ({ results: db.prepare(sql).all(...args) }) }),
        };
      },
    };
    const paths = async (source) =>
      (await listPriorityEditorialLinks(source, database)).map((link) => link.href);
    assert.deepEqual(await paths("/steniatka/ako-vybrat-dobreho-chovatela"), [
      "/plemena",
      "/adresar/chovatelske-stanice",
    ]);
    assert.deepEqual(await paths("/adresar/obycajna-kategoria"), []);
    assert.equal(calls, 0);
    assert.deepEqual(await paths("/starostlivost/kedy-ist-so-psom-k-veterinarovi"), [
      "/adresar/veterinari",
      "/adresar/veterinari/veterinarna-klinika-primavet",
    ]);
    assert.deepEqual(await paths("/aktivity/rally-obedience-so-psom-ako-zacat"), ["/podujatia"]);
    assert.deepEqual(await paths("/plemena/teriery/jack-russell-terier"), [
      "/adresar/chovatelske-stanice/emalera",
      "/adresar/chovatelske-stanice",
    ]);
    assert.deepEqual(await paths("/plemena/pince-bradace-molosy-salasnicke/bradac"), [
      "/adresar/chovatelske-stanice",
    ]);
    assert.deepEqual(await paths("/adresar/dalsie-sluzby"), ["/adresar"]);
    db.exec("UPDATE directory_profiles SET archived_at='2026-11-25' WHERE id=1");
    assert.deepEqual(await paths("/adresar/veterinari"), ["/adresar"]);
  } finally {
    db.close();
  }
});
