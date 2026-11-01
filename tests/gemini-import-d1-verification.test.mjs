import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/gemini-import-d1-verification.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const exports = {};
runInNewContext(js, {
  exports,
  require: name => {
    assert.equal(name, "./gemini-concept-manager");
    return { geminiCanonicalEditorUrl: item =>
      item.canonicalVerified === true && item.psipediaId === "77"
        ? "/admin/" + (item.agenda ?? "directory") + "/77" : null,
    };
  },
});
const verify = exports.verifiedPrivateGeminiEditor;

function dbFor(result) {
  return { prepare(sql) {
    assert.match(sql, /JOIN /);
    assert.match(sql, /WHERE m.notion_page_id=/);
    return { bind(id) {
      assert.equal(id, "notion-page");
      return { first: async () => result };
    } };
  } };
}

test("all six Gemini agenda mappings require a verified private canonical D1 row", async () => {
  const agendas = ["directory", "events", "organizations", "adoptions", "help-cases", "lost-found"];
  for (const agenda of agendas) {
    const status = ["directory", "events", "help-cases"].includes(agenda) ? "draft" : "DRAFT";
    const url = await verify(dbFor({ id: 77, status }), agenda, "notion-page");
    assert.ok(url?.startsWith("/admin/"), agenda);
    for (const publiclyVisible of ["published", "PUBLISHED", "ACTIVE", "RESOLVED", "ARCHIVED"]) {
      assert.equal(await verify(dbFor({ id: 77, status: publiclyVisible }), agenda, "notion-page"),
        null, agenda + ":" + publiclyVisible);
    }
    assert.equal(await verify(dbFor(null), agenda, "notion-page"), null);
    assert.equal(await verify(dbFor({ id: 0, status }), agenda, "notion-page"), null);
  }
});

test("D1 verification is the post-import authority, not a second Notion fetch", () => {
  const canonical = readFileSync(new URL("../lib/gemini-canonical-save-sync.ts", import.meta.url), "utf8");
  const help = readFileSync(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../app/api/admin/gemini-automation/import-pending/route.ts", import.meta.url), "utf8");
  assert.match(canonical, /verifiedPrivateGeminiEditor\(database, agenda, notionPageId\)/);
  assert.match(canonical, /if \(verifiedEditor\)/);
  assert.match(help, /ownerTargetedImport/);
  assert.match(help, /if \(\(input.webhookMappedOnly \|\| ownerTargetedImport\) && input.targetPageId\)/);
  assert.match(owner, /ownerConfirmedLegacy: true, validatedDraft: draft/);
});
