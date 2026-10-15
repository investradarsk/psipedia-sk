import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import { mergeManagedBreedEdit, mergeNotionBreedInput } from "../lib/breed-sync-preservation.ts";

// Execute the actual production SQL statement factory, including both kinds
// of relation replacement, on isolated real SQLite. This is not a production
// D1 call and does not substitute a mocked SQL string for the guarded UPDATE.
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const store = read("lib/breed-store.ts");
const api = read("app/api/admin/breeds/[id]/route.ts");
const editor = read("components/admin-breed-editor.tsx");
const notion = read("lib/notion-breed-sync.ts");

function section(src, first, after) {
  const a = src.indexOf(first);
  const b = src.indexOf(after, a);
  assert.ok(a !== -1 && b > a, first);
  return src.slice(a, b);
}
const factories = section(store, "function values(", "export async function createManagedBreed(")
  + "\n" + section(store, "export function buildManagedBreedUpdateStatements(", "export async function updateManagedBreed(").replace(/^export /, "");
const { buildManagedBreedUpdateStatements } = vm.runInNewContext(
  stripTypeScriptTypes(factories + "\n({buildManagedBreedUpdateStatements})"),
  { JSON, Date, clean: value => value },
);

const stamp = "2026-10-15T09:00:00.000Z";
const later = "2026-10-15T09:00:01.000Z";
const next = "2026-10-15T09:00:02.000Z";

function payload(overrides = {}) {
  return {
    slug: "labrador-retriever", name: "Labrador retriever", status: "draft",
    image: "/media/breeds/main.webp", imageKey: "breeds/main.webp",
    gallery: [{ imageUrl: "/media/breeds/gallery.webp", imageKey: "breeds/gallery.webp", alt: "Pri vode" }],
    fciNumber: 122, fciGroup: 8, fciSection: "Retrievery", fciSectionNumber: "1",
    officialFciName: "LABRADOR RETRIEVER", validStandardDate: "2011-01-12",
    workingTrial: "Áno", importKey: "fci-122",
    fciStandard: { oci: "Hnedé", fci_standard_pdf: "https://www.fci.be/standard.pdf" },
    editorial: { overview: "Odborný text", healthTip: "Preventívne prehliadky" },
    sports: [{ key: "field-trials", label: "Field trials", rating: 5 }],
    relatedBreedIds: [3], relatedArticleIds: [10], directoryProfileIds: [20],
    searchText: "Labrador retriever",
    editorialComplete: true, origin: "Veľká Británia", group: "Retriever",
    size: "Stredný", weight: "25–36 kg", height: "54–57 cm", lifespan: "10–14 rokov",
    coat: "Krátka", energy: 5, trainability: 5, family: 5, children: 5,
    otherDogs: 4, apartment: 3, grooming: 2, shedding: 4, preyDrive: 3,
    intro: "Labrador", character: "Pôvodný charakter", needs: "Veľa práce",
    history: "História", exercise: "Každodenný pohyb", training: "Pravidelný výcvik",
    health: "Pôvodné zdravotné informácie",
    healthRisks: ["DBK"], goodFor: ["Aktívni ľudia"], consider: ["Čas"],
    sources: [{ label: "FCI", url: "https://www.fci.be/" }],
    accent: "forest", seo: { title: "Labrador", ogTitle: "Ručné OG", noindex: true },
    ...overrides,
  };
}
function adapter() {
  const sqlite = new DatabaseSync(":memory:");
  const dummy = { prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; } };
  const firstSql = buildManagedBreedUpdateStatements(dummy, 1, payload(), "admin", stamp, later)[0].sql;
  const assignments = firstSql.match(/^UPDATE managed_breeds SET (.+) WHERE id=\? AND updated_at=\? RETURNING id$/);
  assert.ok(assignments, "production UPDATE has expected CAS clause");
  const columns = [...assignments[1].matchAll(/(?:^|,)([a-z_]+)=/g)].map(match => match[1]);
  assert.ok(columns.length > 45, "full canonical columns are covered");
  sqlite.exec("CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY," + [...new Set(columns)].map(col => col + " TEXT").join(",") + ")");
  sqlite.exec("CREATE TABLE managed_articles(id INTEGER PRIMARY KEY)");
  sqlite.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,category TEXT)");
  sqlite.exec("CREATE TABLE breed_article_relations(breed_id INTEGER,article_id INTEGER,created_at TEXT,created_by TEXT)");
  sqlite.exec("CREATE TABLE breed_directory_relations(breed_id INTEGER,profile_id INTEGER,relation_type TEXT,source TEXT,created_at TEXT,created_by TEXT)");
  sqlite.exec("INSERT INTO managed_articles(id) VALUES (10),(11)");
  sqlite.exec("INSERT INTO directory_profiles(id,category) VALUES (20,'chovatelske-stanice'),(21,'chovatelske-kluby')");
  sqlite.prepare("INSERT INTO managed_breeds(id,updated_at,status,slug,name) VALUES (1,?,'draft','labrador-retriever','Labrador retriever')").run(stamp);
  sqlite.exec("INSERT INTO breed_article_relations VALUES (1,10,'first','admin')");
  sqlite.exec("INSERT INTO breed_directory_relations VALUES (1,20,'breeding-station','manual','first','admin')");
  const db = {
    prepare: dummy.prepare,
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, args = [] }) => {
          const stmt = sqlite.prepare(sql);
          return /\bRETURNING\b/i.test(sql) || /^\s*SELECT\b/i.test(sql)
            ? { results: stmt.all(...args) }
            : { results: [], meta: stmt.run(...args) };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  const row = () => sqlite.prepare("SELECT * FROM managed_breeds WHERE id=1").get();
  const articleLinks = () => sqlite.prepare("SELECT article_id FROM breed_article_relations ORDER BY article_id").all().map(x => x.article_id);
  const directoryLinks = () => sqlite.prepare("SELECT profile_id FROM breed_directory_relations ORDER BY profile_id").all().map(x => x.profile_id);
  const write = (candidate, expectedVersion, nextVersion) =>
    db.batch(buildManagedBreedUpdateStatements(db, 1, candidate, "editor", expectedVersion, nextVersion));
  return { sqlite, row, articleLinks, directoryLinks, write };
}

test("concurrent editor writes: first full update wins, stale save rolls back fields, FCI, gallery and links", async () => {
  const f = adapter();
  try {
    const first = payload({
      health: "Nové zdravotné informácie",
      gallery: [{ imageUrl: "/media/breeds/new.webp", alt: "Nová galéria" }],
      relatedArticleIds: [11], directoryProfileIds: [21],
    });
    const [result] = await f.write(first, stamp, later);
    assert.equal(result.results.length, 1);
    const winningRow = f.row();
    assert.equal(winningRow.updated_at, later);
    assert.equal(winningRow.health, "Nové zdravotné informácie");
    assert.deepEqual(f.articleLinks(), [11]);
    assert.deepEqual(f.directoryLinks(), [21]);
    const stale = payload({ health: "ZASTARANÉ", gallery: [], relatedArticleIds: [10], directoryProfileIds: [20] });
    await assert.rejects(f.write(stale, stamp, next), /malformed JSON/);
    assert.deepEqual(f.row(), winningRow, "stale transaction must preserve every column");
    assert.deepEqual(f.articleLinks(), [11], "stale transaction must not change article links");
    assert.deepEqual(f.directoryLinks(), [21], "stale transaction must not change directory links");
  } finally { f.sqlite.close(); }
});

test("delayed Notion import cannot overwrite a newer manual edit; current retry succeeds", async () => {
  const f = adapter();
  try {
    await f.write(payload({ training: "Editorovo nové tréningové usmernenie" }), stamp, later);
    const staleNotion = mergeNotionBreedInput(
      payload({ updatedAt: stamp }),
      { slug: "labrador-retriever", fciNumber: 122, training: "Starý Notion obsah", health: "" },
    );
    await assert.rejects(f.write(staleNotion, stamp, next), /malformed JSON/);
    assert.equal(f.row().training, "Editorovo nové tréningové usmernenie");
    const refreshed = payload({ training: "Aktualizované po ručnom zosúladení" });
    await f.write(refreshed, later, next);
    assert.equal(f.row().training, "Aktualizované po ručnom zosúladení");
  } finally { f.sqlite.close(); }
});

test("partial patch retains unrelated health, gallery, FCI, sports, SEO and relations", async () => {
  const f = adapter();
  try {
    const previous = payload();
    const edited = mergeManagedBreedEdit(previous, { character: "Zmenený charakter", seo: { description: "Nová metadáta" } });
    assert.equal(edited.health, previous.health);
    assert.deepEqual(edited.fciStandard, previous.fciStandard);
    assert.deepEqual(edited.gallery, previous.gallery);
    assert.deepEqual(edited.sports, previous.sports);
    assert.deepEqual(edited.relatedArticleIds, previous.relatedArticleIds);
    await f.write(edited, stamp, later);
    const row = f.row();
    assert.equal(row.character, "Zmenený charakter");
    assert.equal(row.health, previous.health);
    assert.deepEqual(JSON.parse(row.fci_standard_json), previous.fciStandard);
    assert.deepEqual(JSON.parse(row.gallery_json), previous.gallery);
    assert.deepEqual(JSON.parse(row.sports_json), previous.sports);
    assert.equal(JSON.parse(row.seo_json).description, "Nová metadáta");
    assert.deepEqual(f.articleLinks(), [10]);
    assert.deepEqual(f.directoryLinks(), [20]);
  } finally { f.sqlite.close(); }
});

test("same version can commit only once, including when the same payload is retried", async () => {
  const f = adapter();
  try {
    await f.write(payload(), stamp, later);
    const snapshot = f.row();
    await assert.rejects(f.write(payload(), stamp, next), /malformed JSON/);
    assert.deepEqual(f.row(), snapshot);
    assert.deepEqual(f.articleLinks(), [10]);
  } finally { f.sqlite.close(); }
});

test("admin and Notion call-sites must use the read version and return an actionable conflict", () => {
  assert.match(api, /expectedUpdatedAt.*request\.json/);
  assert.match(api, /status: 428/);
  assert.match(api, /error instanceof BreedUpdateConflictError/);
  assert.match(api, /status: 409/);
  assert.match(api, /updateManagedBreed\(id, mergeManagedBreedEdit\(before, patch\), user\.email, expectedUpdatedAt\)/);
  assert.match(editor, /breed\?\{expectedUpdatedAt\}/);
  assert.match(editor, /setExpectedUpdatedAt\(data\.breed\.updatedAt\)/);
  assert.match(notion, /updateManagedBreed\(existing\.id, payload, SYNC_ACTOR, existing\.updatedAt\)/);
  assert.match(notion, /if \(mapping\.content_hash === contentHash\)/);
  assert.match(notion, /return "unchanged"/);
  assert.match(store, /new Date\(Math\.max\(Date\.now\(\), previous \+ 1\)\)\.toISOString\(\)/);
  assert.match(store, /breeds\.map\(\(breed\) => Date\.parse\(breed\.updatedAt\) \+ 1\)/);
  assert.match(store, /SELECT CASE WHEN changes\(\) = 1/);
  assert.ok(store.indexOf("breed_update_guard") < store.indexOf("...breedRelationStatements(database,id,value,user)"));
});
