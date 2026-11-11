import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  displayIdScopes,displayIdScope,formatDisplayId,parseDisplayId,
  displayIdMatches,looksLikeDisplayId,
} from "../lib/admin-display-id.ts";

const read = path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("scoped IDs cover nine canonical domains without reused numeric codes",()=>{
  assert.equal(displayIdScopes.length,28);
  assert.equal(new Set(displayIdScopes.map(x=>x.code)).size,displayIdScopes.length);
  assert.deepEqual(new Set(displayIdScopes.map(x=>x.kind)),
    new Set(["breeds","directory","events","articles","adoptions","lost-found","organizations","help","eshops"]));
  for(const scope of displayIdScopes) {
    assert.equal(displayIdScope(scope.kind,scope.category).code,scope.code);
    assert.equal(parseDisplayId("25/"+scope.code)?.scope.code,scope.code);
  }
});

test("every actual Directory category is allocated and never collides with another category",()=>{
  const source=read("lib/directory.ts");
  const active=source.split("export const directoryCategories = [")[1].split("] as const;")[0];
  const old=source.split("const legacyDirectoryCategories = [")[1].split("] as const;")[0];
  const categories=[...active.matchAll(/slug: "([^"]+)"/g),...old.matchAll(/slug: "([^"]+)"/g)].map(x=>x[1]);
  assert.equal(categories.length,12);
  const assigned=categories.map(category=>displayIdScope("directory",category).code);
  assert.equal(new Set(assigned).size,categories.length);
  assert.ok(assigned.every(code=>code>=2&&code<=13));
});

test("all seven Help categories are explicitly mapped, including historical values",()=>{
  const source=read("lib/help.ts");
  const active=source.split("export const helpCategories = [")[1].split("] as const;")[0];
  const old=source.split("const legacyHelpCategories = [")[1].split("] as const;")[0];
  const categories=[...active.matchAll(/slug: "([^"]+)"/g),...old.matchAll(/slug: "([^"]+)"/g)].map(x=>x[1]);
  assert.equal(categories.length,7);
  const codes=categories.map(category=>displayIdScope("help",category).code);
  assert.equal(new Set(codes).size,categories.length);
  assert.ok(codes.every(code=>code>=19&&code<=25));
});

test("literal 25/2 is easy to copy but cannot accidentally change the canonical ID",()=>{
  assert.equal(formatDisplayId(25,"directory","veterinari"),"25/2");
  assert.equal(formatDisplayId(25,"breeds"),"25/1");
  assert.equal(formatDisplayId(25,"articles"),"25/15");
  assert.equal(formatDisplayId(25,"events"),"25/14");
  assert.deepEqual({ ...parseDisplayId("#25 / 2"),scope:undefined},{id:25,code:2,scope:undefined});
  assert.equal(displayIdMatches("25/2",25,"directory","veterinari"),true);
  assert.equal(displayIdMatches("25/2",25,"directory","treneri"),false);
  assert.equal(displayIdMatches("25/2",25,"breeds"),false);
  assert.equal(displayIdMatches("25/2",26,"directory","veterinari"),false);
  assert.equal(parseDisplayId("25"),null);
  for(const invalid of ["0/2","25/0","25/999","25/02","abc/2","25/2; DROP TABLE x","1.5/2","99999999999999999/2"])
    assert.equal(parseDisplayId(invalid),null,invalid);
  assert.equal(looksLikeDisplayId("25/999"),true);
  assert.equal(looksLikeDisplayId("25"),false);
  assert.throws(()=>formatDisplayId(0,"breeds"),/DISPLAY_ID_INVALID/);
});

test("legacy names remain valid and unknown future categories use reserved, nonoverlapping codes",()=>{
  assert.equal(formatDisplayId(5,"directory","psie-skoly"),"5/12");
  assert.equal(formatDisplayId(5,"directory","unknown-category"),"5/27");
  assert.equal(formatDisplayId(5,"help","unknown-category"),"5/28");
  assert.notEqual(formatDisplayId(5,"directory","unknown-category"),formatDisplayId(5,"help","unknown-category"));
});

test("display ID UI does not change D1 IDs, Notion identity, or lifecycle tombstone keys",()=>{
  const ui=read("components/admin-record-id.tsx");
  const shell=read("components/admin-shell.tsx");
  const core=read("lib/admin-record-lifecycle.ts");
  const migration=read("drizzle/0164_admin_record_lifecycle.sql");
  assert.match(ui,/navigator\.clipboard\.writeText\(displayed\)/);
  assert.match(shell,/recordKind\?: DisplayIdKind/);
  assert.match(migration,/PRIMARY KEY \(kind, record_id\)/);
  assert.match(core,/notionText\(page,"Psipedia ID"\)!==String\(id\)/);
  assert.doesNotMatch(core,/parseDisplayId|formatDisplayId/);
});
