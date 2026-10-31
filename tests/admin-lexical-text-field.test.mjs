import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("ADMIN-LEXICAL reuses installed Lexical packages without a new framework or storage schema", () => {
  const manifest = JSON.parse(source("package.json"));
  const editor = source("components/admin-lexical-text-field.tsx");
  assert.equal(manifest.dependencies.lexical, "0.52.0");
  assert.equal(manifest.dependencies["@lexical/react"], "0.52.0");
  assert.match(editor, /LexicalComposer/);
  assert.match(editor, /PlainTextPlugin/);
  assert.match(editor, /HistoryPlugin/);
  assert.match(editor, /LexicalPlainTextBridge/);
  assert.match(editor, /writePlainText\(value\)/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML|execCommand|@tiptap|blocknote/);
});

test("ADMIN-LEXICAL has one normalized string contract including newline and external sync", () => {
  const editor = source("components/admin-lexical-text-field.tsx");
  assert.match(editor, /value\.replace\(\/\\r\\n\?\/g, "\\n"\)\.split\("\\n"\)/);
  assert.match(editor, /root\.append\(paragraph\)/);
  assert.match(editor, /getTextContent\(\)/);
  assert.match(editor, /lastEmitted\.current === value/);
  assert.match(editor, /tag: "external"/);
  assert.match(editor, /onChangeRef\.current\(next\)/);
  assert.match(editor, /name=\{name\}/);
  assert.match(editor, /data-lexical-value/);
});

test("ADMIN-LEXICAL covers all canonical profile text editors", () => {
  const paths = [
    "components/admin-directory-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-organization-editor.tsx",
    "components/admin-adoption-editor-profile.tsx",
    "components/admin-adoption-editor-details.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-breed-editor.tsx",
    "components/admin-eshop-editor.tsx",
  ];
  for (const path of paths) assert.match(source(path), /AdminLexicalTextField/, path);
  assert.match(source("components/admin-adoption-editor-profile.tsx"), /name="description"/);
  assert.match(source("components/admin-adoption-editor-details.tsx"), /name="adoptionRequirements"/);
  assert.match(source("components/admin-adoption-editor.tsx"), /new FormData\(event\.currentTarget\)/);
  assert.match(source("components/admin-adoption-editor.tsx"), /dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
  assert.match(source("components/admin-directory-editor.tsx"), /setFormDirty\(true\)/);
  assert.match(source("components/admin-help-editor.tsx"), /navigation\.markDirty\(\)/);
});
