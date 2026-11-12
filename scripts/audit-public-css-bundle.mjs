#!/usr/bin/env node
// Post-build, read-only evidence that the category CSS was actually removed
// from the initial Vite index CSS, not merely moved to another TS import.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";

const publicRoot = resolve("dist/client");
const cssDir = join(publicRoot, "assets");
const routeAsset = "styles/breed-reference-3f5dab25d000.css";
const directoryAsset = "styles/directory-146dc4e44713.css";
assert.ok(existsSync(cssDir), "CSS build output not found at dist/client/assets");
assert.ok(existsSync(join(publicRoot, routeAsset)), "Route-only breed asset was not copied to dist/client");
assert.ok(existsSync(join(publicRoot, directoryAsset)), "Route-only directory CSS was not copied to dist/client");

const entries = readdirSync(cssDir).filter(file => file.endsWith(".css"));
const mainEntries = entries.filter(file => /^index-[a-z0-9_-]+\.css$/i.test(file));
assert.ok(mainEntries.length > 0, "Cannot verify main index CSS chunk");
const info = mainEntries.map(file => {
  const full = join(cssDir, file);
  const source = readFileSync(full, "utf8");
  const sourceBytes = Buffer.from(source);
  return {
    file,
    bytes: sourceBytes.byteLength,
    gzipBytes: gzipSync(sourceBytes, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(sourceBytes).byteLength,
    hasBreedRules: source.includes(".breed-fci-anchor-nav") || source.includes(".breed-fci-dimensions"),
    hasDirectoryRules: source.includes(".directory-hero-grid") || source.includes(".directory-club-selects"),
  };
});
console.log(JSON.stringify({ event: "psipedia_css_index_candidates", index: info }, null, 2));
for (const item of info) {
  assert.ok(!item.hasBreedRules, `Breed-specific style leaked into global CSS: ${item.file}`);
  assert.ok(!item.hasDirectoryRules, `Directory-only style leaked into global CSS: ${item.file}`);
  assert.ok(item.gzipBytes < 180 * 1024, `Compressed main CSS remains too large: ${item.file} (${item.gzipBytes} B gzip)`);
}
const routeBytes = statSync(join(publicRoot, routeAsset)).size;
const directoryBytes = statSync(join(publicRoot, directoryAsset)).size;
assert.ok(directoryBytes > 25_000, "Directory stylesheet unexpectedly empty");
assert.ok(routeBytes > 60_000, "Breed style route asset unexpectedly empty");
const largest = entries
  .map(file => ({ file, bytes: statSync(join(cssDir, file)).size }))
  .sort((a,b) => b.bytes - a.bytes).slice(0,8);
console.log(JSON.stringify({ event:"psipedia_public_css_bundle_audit", index:info, routeAsset, routeBytes, directoryAsset, directoryBytes, cssLargest:largest },null,2));
