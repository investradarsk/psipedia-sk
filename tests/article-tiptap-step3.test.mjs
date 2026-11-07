import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("ARTICLE-TIPTAP-3: all article rich text uses one scoped Tiptap toolbar", () => {
  const article = read("components/admin-article-editor.tsx");
  const blocks = read("components/admin-article-block-editor.tsx");
  const tiptap = read("components/admin-tiptap-article-editor.tsx");
  const css = read("components/admin-tiptap-article-editor.module.css");
  assert.match(article, /<AdminTiptapArticleScope activeSectionId=\{activeArticleSection\}/);
  assert.match(blocks, /<AdminTiptapRichTextEditor/);
  assert.doesNotMatch(blocks, /AdminLexicalRichTextEditor/);
  assert.match(tiptap, /data-admin-tiptap-toolbar/);
  assert.match(tiptap, /onFocus\(\{ editor: focused \}\)/);
  assert.match(tiptap, /immediatelyRender: false/);
  assert.match(tiptap, /shouldRerenderOnTransaction: false/);
  assert.match(tiptap, /tiptapToEditorial\(updated.getJSON\(\)\)/);
  assert.match(tiptap, /editor\.commands\.setContent/);
  assert.match(tiptap, /handlePaste\(view, event\)/);
  assert.match(css, /position: sticky/);
  assert.match(article, /data-article-tiptap-invalid/);
});

test("ARTICLE-TIPTAP-4: native unrestricted color pickers use the versioned v2 contract", () => {
  const tiptap = read("components/admin-tiptap-article-editor.tsx");
  const content = read("lib/editorial-content.ts");
  const renderer = read("components/editorial-rich-text.tsx");
  assert.match(tiptap, /aria-label="Celá paleta farieb textu"/);
  assert.match(tiptap, /aria-label="Celá paleta zvýraznenia"/);
  assert.match(tiptap, /setMark\("textStyle"/);
  assert.match(tiptap, /setMark\("highlight"/);
  assert.match(content, /EDITORIAL_RICH_TEXT_VERSION = 2/);
  assert.match(renderer, /backgroundColor: mark\.color/);
  assert.match(renderer, /color: mark\.color/);
  assert.match(read("lib/tiptap-editorial-bridge.ts"), /Invalid Tiptap color/);
  assert.match(read("components/admin-article-editor.tsx"), /querySelector\('/);
});

test("ARTICLE-TIPTAP-3: exact versions and npm ci lock closure", () => {
  const manifest = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const direct = ["@tiptap/core", "@tiptap/react", "@tiptap/starter-kit"];
  for (const name of direct) {
    assert.equal(manifest.dependencies[name], "3.33.0");
    assert.equal(lock.packages[""].dependencies[name], "3.33.0");
    assert.equal(lock.packages["node_modules/" + name].version, "3.33.0");
  }
  const pending = [...direct], seen = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const entry = lock.packages["node_modules/" + name];
    assert.ok(entry, "Missing locked Tiptap dependency " + name);
    assert.ok(entry.resolved?.startsWith("https://registry.npmjs.org/"), "Unsafe lock URL: " + name);
    assert.ok(entry.integrity?.startsWith("sha512-"), "Missing SRI for " + name);
    pending.push(...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {}));
  }
});

test("ARTICLE-TIPTAP-3: media, SEO, Notion and public rendering still use the original contracts", () => {
  const blocks = read("components/admin-article-block-editor.tsx");
  const article = read("components/admin-article-editor.tsx");
  assert.match(blocks, /AdminSingleImageUpload/);
  assert.match(blocks, /AdminSortableGallery/);
  assert.match(blocks, /normalizeEditorialExternalVideo/);
  assert.match(article, /introRichText,/);
  assert.match(article, /takeawayRichText,/);
  assert.match(article, /blocks,/);
  assert.match(article, /relatedBreedIds,/);
  assert.doesNotMatch(read("components/editorial-rich-text.tsx"), /dangerouslySetInnerHTML/);
});
