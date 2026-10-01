import assert from "node:assert/strict";
import test from "node:test";
import { articleReadingProgress, clampArticleReadingProgress } from "../lib/article-reading-progress.ts";

const geometry = {
  viewportHeight: 900,
  startTop: 200,
  endBottom: 3200,
};

test("article reading progress clamps before and after the article range", () => {
  assert.equal(articleReadingProgress({ ...geometry, scrollY: 0 }), 0);
  assert.equal(articleReadingProgress({ ...geometry, scrollY: 5000 }), 1);
  assert.equal(clampArticleReadingProgress(Number.NaN), 0);
});

test("article reading progress is fractional through the article and reaches 1 when its end enters the viewport", () => {
  const endScroll = geometry.endBottom - geometry.viewportHeight;
  const midScroll = geometry.startTop + (endScroll - geometry.startTop) / 2;
  assert.equal(articleReadingProgress({ ...geometry, scrollY: midScroll }), 0.5);
  assert.equal(articleReadingProgress({ ...geometry, scrollY: endScroll }), 1);
  assert.equal(articleReadingProgress({ ...geometry, scrollY: endScroll + 800 }), 1);
});

test("article reading progress remains deterministic for short article ranges", () => {
  assert.equal(articleReadingProgress({ scrollY: 100, viewportHeight: 900, startTop: 100, endBottom: 500 }), 0);
  assert.equal(articleReadingProgress({ scrollY: 101, viewportHeight: 900, startTop: 100, endBottom: 500 }), 1);
});
