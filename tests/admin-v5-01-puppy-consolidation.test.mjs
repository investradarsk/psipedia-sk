import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5-01: legacy puppy Admin URL preserves auth and canonical article filters", () => {
  const legacy = read("app/admin/steniatka/page.tsx");
  const articles = read("app/admin/clanky/page.tsx");
  assert.match(legacy, /requireAdminPageUser\("\/admin\/steniatka"\)/);
  assert.match(legacy, /params\.tab === "oblasti"/);
  assert.match(legacy, /redirect\("\/admin\/sekcie\?sekcia=steniatka"\)/);
  assert.match(legacy, /parseArticleAdminListFilters/);
  assert.match(legacy, /portalSection: "steniatka"/);
  assert.match(legacy, /articleAdminListHref\("\/admin\/clanky"/);
  assert.match(articles, /portalSection: filters\.portalSection === "all" \? undefined : filters\.portalSection/);
  assert.equal(existsSync(new URL("../components/admin-puppy-area-editor.tsx", import.meta.url)), false);
});

test("V5-01: puppy subpages have one editable source and retain image functions", () => {
  const editor = read("components/admin-section-editor.tsx");
  assert.match(editor, /initialOpenSlug/);
  assert.match(editor, /updateSubpage\(sectionSlug, subIndex/);
  assert.match(editor, /fetch\("\/api\/admin\/sections"/);
  assert.match(editor, /method: "PUT"/);
  assert.match(editor, /<AdminSingleImageUpload/);
  assert.match(editor, /uploadAdminImage\(file, "articles"\)/);
  assert.match(editor, /imageAlt: subpage\.imageAlt \|\| subpage\.label/);
  assert.match(editor, /onRejected={setError}/);
  assert.match(editor, /imageUrl: "", imageAlt: ""/);
  assert.match(editor, /ALT text obrázka/);
  assert.match(editor, /reorderSubpages/);
  assert.match(editor, /moveSubpage/);
  assert.match(editor, /<AdminLexicalAppendButton/);
  assert.match(editor, /<AdminLexicalTextField/);
  assert.match(editor, /dirty={dirty}/);
  assert.match(editor, /disabled={saving \|\| Boolean\(uploading\) \|\| !dirty}/);
});

test("V5-01: read-only coverage stays at original URL and linked from Sections", () => {
  const editor = read("components/admin-section-editor.tsx");
  const coverage = read("app/admin/steniatka/pokrytie/page.tsx");
  assert.match(editor, /href="\/admin\/steniatka\/pokrytie"/);
  assert.match(coverage, /requireAdminPageUser/);
  assert.match(coverage, /getPuppyCoverageSource/);
  assert.match(coverage, /buildPuppyCoverageMatrix/);
  assert.match(coverage, /href="\/admin\/sekcie\?sekcia=steniatka"/);
  assert.doesNotMatch(coverage, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});
