import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function clientSource() {
  const path = "components/admin-quick-navigation-dialog.tsx";
  const source = read(path);
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics, [], "Search dialog must parse as TypeScript/JSX");
  return source;
}

test("6/10 invalidates in-flight searches only when the effective server query changes", () => {
  const source = clientSource();
  assert.match(source, /SEARCH_QUERY_MAX_LENGTH = 80/);
  assert.match(source, /const searchTerm = query\.trim\(\)\.slice\(0, SEARCH_QUERY_MAX_LENGTH\)/);
  assert.match(source, /const nextTerm = event\.target\.value\.trim\(\)\.slice\(0, SEARCH_QUERY_MAX_LENGTH\)/);
  assert.match(source, /if \(nextTerm !== searchTerm\) \{\s*searchGeneration\.current \+= 1/);
  assert.match(source, /\[open, searchTerm, retryCount\]/);
  assert.match(source, /generation === searchGeneration\.current/);
  assert.match(source, /const isCurrent = \(\) => !controller\.signal\.aborted/);
  assert.match(source, /if \(!isCurrent\(\)\) return/);
  assert.match(source, /if \(isCurrent\(\)\) \{\s*setSearchError/);
});

test("6/10 failed and partial results can be retried without caching stale partials", () => {
  const source = clientSource();
  assert.match(source, /if \(!incomplete\) \{\s*cache\.current\.set\(term/);
  assert.match(source, /cached\.expiresAt > Date\.now\(\)/);
  assert.match(source, /cache\.current\.size > SEARCH_CACHE_LIMIT/);
  assert.match(source, /SEARCH_CACHE_TTL_MS = 15_000/);
  assert.match(source, /function retrySearch\(\) \{/);
  assert.match(source, /cache\.current\.delete\(searchTerm\)/);
  assert.match(source, /setRetryCount\(count => count \+ 1\)/);
  assert.match(source, /onClick=\{retrySearch\}/);
  assert.match(source, /\(searchError \|\| incomplete\) && shouldSearchRecords\(searchTerm\)/);
  assert.match(source, /!loading && !searchError && !incomplete/);
  const css = read("components/admin-quick-navigation.module.css");
  assert.match(css, /\.retry:focus-visible/);
  assert.match(css, /\.retry:hover/);
  assert.match(css, /\.retry:disabled/);
});

test("6/10 canceling dirty-editor navigation keeps search open and keyboard choice intact", () => {
  const source = clientSource();
  const gate = source.indexOf("if (!window.dispatchEvent(event)) return;");
  const close = source.indexOf("changeOpen(false);", gate);
  const navigate = source.indexOf("navigate();", close);
  assert.ok(gate >= 0 && close > gate && navigate > close, "close must follow successful dirty-editor guard");
  assert.match(source, /if \(event\.key === "Enter" && results\.length\)/);
  assert.match(source, /if \(event\.key === "ArrowDown" && results\.length\)/);
  assert.match(source, /if \(event\.key === "ArrowUp" && results\.length\)/);
  assert.match(source, /mergeUniqueAdminDestinations\(/);
  assert.match(source, /cache: "no-store"/);
});
