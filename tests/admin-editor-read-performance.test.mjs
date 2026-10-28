import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const paths = {
  directory: "app/admin/adresar/[id]/page.tsx",
  event: "app/admin/podujatia/[id]/page.tsx",
  help: "app/admin/pomoc/[id]/page.tsx",
  organization: "app/admin/organizacie/[id]/page.tsx",
  adoption: "app/admin/adopcie/[id]/page.tsx",
  article: "app/admin/clanky/[id]/page.tsx",
};

test("five canonical editors await independent reads in parallel, after authorization and ID validation", () => {
  const checks = [
    ["directory", "getManagedDirectoryProfileById(id)", "getCanonicalDraftDuplicateWarning(\"DIRECTORY\", id)", "listCanonicalAutomationUpdateSuggestions"],
    ["event", "getManagedEventById(numericId)", "getCanonicalDraftDuplicateWarning(\"EVENT\", numericId)", "getAdminEntityReview(\"EVENT\", numericId)"],
    ["organization", "getOrganizationPublicationAdminById(organizationId)", "getCanonicalDraftDuplicateWarning(\"ORGANIZATION\", organizationId)", "getAdminEntityReview(\"ORGANIZATION\", organizationId)"],
    ["adoption", "getAdoptionById(numericId)", "getCanonicalDraftDuplicateWarning(\"ADOPTION\", numericId)", "getAdminEntityReview(\"ADOPTION\", numericId)"],
    ["help", "getManagedHelpCaseById(numericId)", "getAdminEntityReview(\"HELP_CASE\", numericId)"],
  ];
  for (const [name, entityRead, independentA, independentB] of checks) {
    const file = read(paths[name]);
    const authorizedAt = file.indexOf("await requireAdminPageUser(");
    const parallelAt = file.indexOf("await Promise.all([");
    assert.ok(authorizedAt >= 0 && parallelAt > authorizedAt, name + " must not read protected data before auth");
    const parallelEnd = file.indexOf("]);", parallelAt);
    const batch = file.slice(parallelAt, parallelEnd);
    for (const expected of [entityRead, independentA, independentB].filter(Boolean)) {
      assert.ok(batch.includes(expected), name + " parallel group missing " + expected);
    }
    assert.match(file.slice(parallelEnd), /if \(!(?:profile|event|organization|item)\) notFound\(\)/,
      name + " must still reject missing canonical record");
    assert.match(file, /\.catch\(\(\) => null\)/, name + " preserves best-effort duplicate warning");
    assert.doesNotMatch(file, /Promise\.allSettled/, name + " must not silently mask hard failures");
  }
});

test("FOSTER/HELP_ITEM warnings still depend on actual Help category", () => {
  const source = read(paths.help);
  const category = source.indexOf('item.category === "docasna-opatera"');
  const reviewed = source.indexOf('getAdminEntityReview("HELP_CASE", numericId)');
  const warning = source.indexOf('getCanonicalDraftDuplicateWarning(entityType, item.id)');
  assert.ok(reviewed >= 0 && category > reviewed && warning > category);
});

test("adoption's selected breed remains dependent on the canonical item's breed ID", () => {
  const source = read(paths.adoption);
  const loaded = source.indexOf("if (!item) notFound()");
  const selected = source.indexOf("const selectedBreed = item.breedId");
  const breeds = source.indexOf("listAdoptionAdminBreedOptions(undefined, selectedBreed, item.breedId)");
  assert.ok(loaded >= 0 && selected > loaded && breeds > selected);
});

test("article editor's breed picker transfers only the scalar values its checkboxes display", () => {
  const store = read("lib/breed-store.ts");
  const page = read(paths.article);
  const editor = read("components/admin-article-editor.tsx");
  const begin = store.indexOf("export async function listAdminArticleBreedOptions(");
  const end = store.indexOf("export async function listPublishedBreedIndex()", begin);
  assert.ok(begin > 0 && end > begin);
  const definition = store.slice(begin, end);
  assert.match(definition, /SELECT id,name,fci_number AS fciNumber FROM managed_breeds ORDER BY fci_group,name LIMIT \?/);
  assert.doesNotMatch(definition, /sports_json|editorial_json|fci_standard_json|breed_article_relations|breed_directory_relations/);
  assert.match(page, /listAdminArticleBreedOptions\(500\)/);
  assert.doesNotMatch(page, /listManagedBreedSummaries/);
  assert.match(editor, /breedOptions\?: AdminArticleBreedOption\[\]/);
  assert.match(editor, /className=\{editorStyles\.breedName\}>\{item\.name\}/);
  assert.match(editor, /item\.fciNumber \? <small>FCI \{item\.fciNumber\}<\/small>/);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_breeds (id INTEGER PRIMARY KEY,name TEXT,fci_number INTEGER,fci_group INTEGER, editorial_json TEXT)");
    const insert = db.prepare("INSERT INTO managed_breeds VALUES(?,?,?,?,?)");
    insert.run(10,"Biely švajčiarsky ovčiak",347,1,"{".repeat(12000));
    insert.run(11,"Burgoský stavač",null,7,"{".repeat(12000));
    insert.run(12,"Beagle",161,6,"{".repeat(12000));
    const rows = db.prepare("SELECT id,name,fci_number AS fciNumber FROM managed_breeds ORDER BY fci_group,name LIMIT ?").all(500);
    assert.deepEqual(rows.map(row => ({...row})), [
      {id:10,name:"Biely švajčiarsky ovčiak",fciNumber:347},
      {id:12,name:"Beagle",fciNumber:161},
      {id:11,name:"Burgoský stavač",fciNumber:null},
    ]);
    assert.ok(rows.every(row => Object.keys(row).length === 3));
  } finally { db.close(); }
});
