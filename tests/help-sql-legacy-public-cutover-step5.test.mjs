import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { helpLegacyLostFoundCoverageQuery } from "../lib/help-sql-reviewed-backfill.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const store = read("lib/help-store.ts");
const urlInventory = read("lib/visual-library-dynamic-urls.ts");

test("generic Help public lists, image highlights and homepage exclude all three dedicated legacy domains", () => {
  const predicate = "category NOT IN ('adopcia', 'utulky', 'stratene-a-najdene')";
  assert.equal(store.split(predicate).length - 1, 3,
    "historical adoption, shelters, lost-found must not leak into list/highlights");
  assert.match(store,
    /if \(category === "adopcia" \|\| category === "stratene-a-najdene"\) return \[\] as HelpCase\[\]/);
  assert.match(store, /if \(category === "utulky"\)/);
  assert.match(store, /listPublishedOrganizations\(/);
  assert.match(store, /listPublishedOrganizationCards\(/);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_cases (id INTEGER PRIMARY KEY,category TEXT,status TEXT,slug TEXT);");
    const insert = db.prepare("INSERT INTO help_cases VALUES(?,?,?,?)");
    for(const [id,category] of [
      [1, "zbierky"], [2,"docasna-opatera"], [3,"dobrovolnictvo"],
      [4,"adopcia"],[5,"utulky"],[6,"stratene-a-najdene"],
      [7,"urgentne-pripady"],
    ]) insert.run(id,category,"published","row-"+id);
    const selected = db.prepare(
      "SELECT id FROM help_cases WHERE status='published' AND " +
      predicate + " ORDER BY id",
    ).all().map(r=>r.id);
    assert.deepEqual(selected,[1,2,3,7]);
  } finally {db.close();}
});

test("owner-only dynamic public URL inventory excludes dedicated legacy Help identity",()=>{
  assert.ok(urlInventory.includes(
    "h.category NOT IN ('adopcia','utulky','stratene-a-najdene')"));
  assert.match(urlInventory,
    /row\.category !== "adopcia" && row\.category !== "utulky" && row\.category !== "stratene-a-najdene"/);
  // Dedicated canonical report URLs still use the LOST/FOUND route builder.
  assert.match(urlInventory,/dogReportHref\(\{ type: row\.category, slug: row\.slug \}\)/);
  assert.match(urlInventory, /from: "lost_found_dog_reports r"/);
  assert.match(urlInventory, /from: "adoption_dogs d"/);
  assert.match(urlInventory, /from: "help_organizations o"/);
});

test("do not remove historic deep links, Notion mapping or SQL technical JSON before parity proof",()=>{
  const oldDetail = read("app/pomoc-psom/[category]/[slug]/page.tsx");
  const adoptionDetail = read("app/pomoc-psom/adopcia/[slug]/page.tsx");
  const organization = read("lib/help-organization-store.ts");
  const adoption = read("lib/adoption-store.ts");
  const reports = read("lib/lost-found-dog-store.ts");
  const notion = read("lib/notion-events-help-sync.ts");
  assert.match(oldDetail,/getPublishedHelpCase\(category, slug\)/,
    "deep links to unmatched older generic Help cases are kept until verified redirect parity");
  assert.match(oldDetail,/permanentRedirect\(\`\/organizacie\/\$\{slug\}\`\)/);
  assert.match(adoptionDetail,/getAdoptionBySlug\(slug\)/);
  assert.doesNotMatch(adoptionDetail,/getPublishedHelpCase|getLegacyAdoption/);
  assert.match(organization,/source_data_json/);
  assert.match(organization,/readProfileGallery/);
  assert.match(adoption,/gallery_json/);
  assert.match(reports,/gallery_json/);
  assert.match(notion,/notion_agenda_sync/);
});

test("lost-found legacy count audit never guesses canonical identity from slug alone",()=>{
  const sql = helpLegacyLostFoundCoverageQuery();
  assert.match(sql,/^SELECT COUNT\(\*\) AS legacy_total/);
  assert.match(sql,/category='stratene-a-najdene'/);
  assert.match(sql,/needs_type_review/);
  assert.match(sql,/ambiguous_type_match/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b|email|phone|contact|address|latitude|longitude/i);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE help_cases (id INTEGER PRIMARY KEY,category TEXT,slug TEXT);" +
      "CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY,type TEXT,slug TEXT);");
    const put = db.prepare("INSERT INTO help_cases VALUES(?,?,?)");
    put.run(1,"stratene-a-najdene","never-imported");
    put.run(2,"stratene-a-najdene","one-match");
    put.run(3,"stratene-a-najdene","two-types");
    put.run(4,"zbierky","one-match");
    const rep = db.prepare("INSERT INTO lost_found_dog_reports VALUES(?,?,?)");
    rep.run(11,"LOST","one-match");
    rep.run(12,"LOST","two-types");
    rep.run(13,"FOUND","two-types");
    const counts=db.prepare(sql).get();
    assert.deepEqual({...counts},{
      legacy_total:3,no_slug_match:1,needs_type_review:1,ambiguous_type_match:1,
    });
    db.exec("DELETE FROM help_cases");
    assert.deepEqual({...db.prepare(sql).get()},{
      legacy_total:0,no_slug_match:0,needs_type_review:0,ambiguous_type_match:0,
    });
  }finally{db.close();}
});

test("existing protected D1 inventory records lost-found blockers, never exports field values",()=>{
  const audit=read("scripts/production-editorial-storage-readonly.mjs");
  assert.match(audit,/helpLegacyLostFoundCoverageQuery/);
  assert.match(audit,/helpLegacyLostFoundCoverage/);
  assert.match(audit,/HELP_LEGACY_LOST_FOUND_COVERAGE_UNREADABLE/);
  assert.match(audit,/requires_manual_type_review/);
  assert.match(audit,/helpLegacyCoverage,helpLegacyFieldCandidates,helpLegacyLostFoundCoverage/);
});
