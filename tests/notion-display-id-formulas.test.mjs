import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {displayIdScopes} from "../lib/admin-display-id.ts";
import {notionDisplayIdFormula,notionDisplayIdSchemaStatement,NOTION_DISPLAY_ID_FIELD}
  from "../lib/notion-display-id-formulas.ts";

test("formula's ID suffix matches all 28 registry entries",()=>{
  for(const scope of displayIdScopes){
    const formula=notionDisplayIdFormula(scope.kind);
    assert.match(formula,/if\(empty\(prop\("Psipedia ID"\)\), "", format\(prop\("Psipedia ID"\)\)/);
    if(scope.category!==null)
      assert.ok(formula.includes('prop("Kategória") == "'+scope.category+'"'),scope.label);
    assert.ok(formula.includes('"/" +'),scope.label);
  }
  assert.equal(NOTION_DISPLAY_ID_FIELD,"Zobrazované ID");
});

test("schema property is computed; canonical D1 and Notion Psipedia ID never changed",()=>{
  const stmt=notionDisplayIdSchemaStatement("directory");
  assert.match(stmt,/^ADD COLUMN "Zobrazované ID" FORMULA\('/);
  assert.match(stmt,/prop\("Kategória"\)/);
  assert.doesNotMatch(stmt,/ALTER COLUMN "Psipedia ID"|DROP COLUMN/);
  const routes=[
    "lib/notion-directory-sync.ts",
    "lib/notion-breed-sync.ts",
    "lib/notion-article-sync.ts",
    "lib/admin-record-lifecycle.ts",
  ].map(path=>readFileSync(new URL("../"+path,import.meta.url),"utf8"));
  assert.ok(routes.every(value=>value.includes('"Psipedia ID"')));
  assert.ok(!routes.some(value=>value.includes('formatDisplayId(')),
    "the raw ID identity and synchronization must not read a display-only ID");
});
