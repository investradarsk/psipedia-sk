import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { versionedPublicHtmlCacheUrl } from "../lib/public-html-cache.ts";

const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const smokeSource = readFileSync(new URL("./e2e/psipedia.spec.ts", import.meta.url), "utf8");
const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("public HTML cache keys are isolated by immutable Worker version", () => {
  const publicUrl = new URL("https://psipedia.sk/plemena/labradorsky-retriever");
  const oldVersionKey = versionedPublicHtmlCacheUrl(publicUrl, "version-old");
  const sameOldVersionKey = versionedPublicHtmlCacheUrl(publicUrl, "version-old");
  const newVersionKey = versionedPublicHtmlCacheUrl(publicUrl, "version-new");

  assert.equal(oldVersionKey.toString(), sameOldVersionKey.toString());
  assert.notEqual(oldVersionKey.toString(), newVersionKey.toString());
  assert.equal(publicUrl.toString(), "https://psipedia.sk/plemena/labradorsky-retriever");
  assert.equal(publicUrl.search, "");
});

test("new Worker HTML cannot resolve an old-version cache entry", () => {
  const publicUrl = new URL("https://psipedia.sk/");
  const simulatedCache = new Map();
  const oldVersionKey = versionedPublicHtmlCacheUrl(publicUrl, "version-old").toString();
  const newVersionKey = versionedPublicHtmlCacheUrl(publicUrl, "version-new").toString();

  simulatedCache.set(oldVersionKey, "<html>old asset hashes</html>");

  assert.equal(simulatedCache.get(oldVersionKey), "<html>old asset hashes</html>");
  assert.equal(simulatedCache.get(newVersionKey), undefined);
});

test("public cache version is internal and absent from canonical URLs", () => {
  const canonicalUrl = new URL("https://psipedia.sk/podujatia");
  const cacheUrl = versionedPublicHtmlCacheUrl(canonicalUrl, "version-123");

  assert.equal(canonicalUrl.toString(), "https://psipedia.sk/podujatia");
  assert.doesNotMatch(canonicalUrl.toString(), /psipedia_worker_version|version-123/);
  assert.match(cacheUrl.toString(), /__psipedia_worker_version=version-123/);
});

test("production config binds Cloudflare Worker Version Metadata", () => {
  assert.deepEqual(wrangler.version_metadata, { binding: "CF_VERSION_METADATA" });
  assert.match(workerSource, /env\.CF_VERSION_METADATA\?\.id/);
  assert.match(workerSource, /if \(!storage \|\| !workerVersionId\) return null/);
});

test("no-consent smoke has one non-conflicting storage initializer", () => {
  const testStart = smokeSource.indexOf("test(NO_CONSENT_TEST");
  const testEnd = smokeSource.indexOf("\ntest(", testStart + 1);
  const noConsentTest = smokeSource.slice(testStart, testEnd);

  assert.match(smokeSource, /if \(testInfo\.title !== NO_CONSENT_TEST\) await useNecessaryCookies\(page\)/);
  assert.equal(noConsentTest.match(/addInitScript/g)?.length, 1);
  assert.match(noConsentTest, /localStorage\.removeItem\(key\)/);
  assert.doesNotMatch(noConsentTest, /localStorage\.setItem\(key, "necessary"\)/);
});
