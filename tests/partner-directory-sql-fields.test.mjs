import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

for (const path of [
  "lib/partner-direct-profile.ts",
  "lib/partner-profile-changes-admin.ts",
]) {
  test(path + " mirrors only explicitly changed service and qualification lists", () => {
    const code = source(path);
    assert.match(code, /planDirectoryStep3PresentationSqlMirror/);
    assert.match(code, /planDirectory0173EditorialSqlMirror/);
    assert.match(code, /Object\.hasOwn\(effectivePatch,"services"\)/);
    assert.match(code, /Object\.hasOwn\(effectivePatch,"qualifications"\)/);
    assert.match(code, /services:effectivePatch\.services as string\[\]/);
    assert.match(code, /qualifications:effectivePatch\.qualifications as string\[\]/);
    assert.match(code, /if\(plans\.length \|\| presentationMirror\.length \|\| editorialMirror\.length\)/);
    assert.match(code, /for\(const item of presentationMirror\)[\s\S]*?\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)/);
    assert.match(code, /for\(const item of editorialMirror\)[\s\S]*?\.prepare\(item\.sql\)\.bind\(\.\.\.item\.bindings\)/);
  });
}

test("direct partner save keeps CAS before SQL sidecars and audit", () => {
  const code = source("lib/partner-direct-profile.ts");
  assert.ok(code.indexOf("PARTNER_EDIT_CAS_CONFLICT") < code.indexOf("...statements.slice(1)"));
  assert.ok(code.indexOf("...statements.slice(1)") < code.indexOf("adminNotificationEventStatement(database"));
  assert.match(code, /const batchResults=await database\.batch\(/);
});

test("admin-approved partner save includes SQL sidecars in moderation transaction", () => {
  const code = source("lib/partner-profile-changes-admin.ts");
  assert.match(code, /extraStatements:\[\s*\.\.\.canonicalStatements,/);
  assert.match(code, /const guard=plans\.length\?plans\[0\]\[0\]/);
});
