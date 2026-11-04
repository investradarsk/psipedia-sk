import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL(`../components/${name}`, import.meta.url), "utf8");

test("breed, article, and help editor navigation stays in the Next.js app", () => {
  for (const name of ["admin-breed-editor.tsx", "admin-article-editor.tsx", "admin-help-editor.tsx"]) {
    const editor = source(name);
    assert.match(editor, /useRouter/);
    assert.match(editor, /router\.replace\(/);
    assert.doesNotMatch(editor, /window\.location\.(?:assign|reload)\s*\(/);
  }
});

test("directory archive restore and Notion review update state instead of reloading", () => {
  const editor = source("admin-directory-editor.tsx");
  assert.match(editor, /setStatus\(data\.profile\.status\)/);
  assert.match(editor, /profile && status === "archived"/);
  assert.doesNotMatch(editor, /window\.location\.reload\s*\(/);
});

test("article and event saves cannot submit concurrent duplicate requests", () => {
  for (const name of ["admin-article-editor.tsx", "admin-event-editor.tsx"]) {
    const editor = source(name);
    assert.match(editor, /if \(savePendingRef\.current \|\| uploading\) return;/);
    assert.match(editor, /savePendingRef\.current = false;/);
  }
});
