import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("public tip and warning boxes preserve author text without automatic headings", () => {
  const renderer = read("components/article-blocks.tsx");
  const callouts = renderer.slice(
    renderer.indexOf('if (block.type === "tip")'),
    renderer.indexOf('if (block.type === "quote")'),
  );
  assert.doesNotMatch(callouts, /<strong>|withoutLeadingEditorialLabel/);
  assert.equal(
    (
      callouts.match(
        /document=\{block.richText \?\? legacyRichTextToDocument\(block.content\)\}/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(callouts, /article-block-callout--tip/);
  assert.match(callouts, /article-block-callout--warning/);
  const labels = read("lib/article-blocks.ts");
  assert.match(labels, /tip: "Tip z praxe"/);
  assert.match(labels, /warning: "Dôležité upozornenie"/);
  assert.match(
    read("components/admin-article-block-editor.tsx"),
    /articleBlockLabels\[block.type\]/,
  );
});
