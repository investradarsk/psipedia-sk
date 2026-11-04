import assert from "node:assert/strict";
import test from "node:test";
import { createShortLivedAsyncCache } from "../lib/public-navigation-cache.ts";

test("navigation cache deduplicates parallel D1 reads, expires and invalidates", async () => {
  let now = 1000;
  let reads = 0;
  const cache = createShortLivedAsyncCache(30_000, () => now);
  const load = async () => { reads += 1; return ["Plemená"]; };
  const [first, concurrent] = await Promise.all([cache.get(load), cache.get(load)]);
  assert.deepEqual(first, ["Plemená"]);
  assert.deepEqual(concurrent, first);
  assert.equal(reads, 1);
  now += 29_999;
  assert.deepEqual(await cache.get(load), first);
  assert.equal(reads, 1);
  now += 1;
  await cache.get(load);
  assert.equal(reads, 2);
  cache.invalidate();
  await cache.get(load);
  assert.equal(reads, 3);
});

test("failed reads retry and an invalidated in-flight read cannot poison the cache", async () => {
  const cache = createShortLivedAsyncCache(30_000);
  let release;
  const stale = cache.get(() => new Promise((resolve) => { release = resolve; }));
  cache.invalidate();
  assert.deepEqual(await cache.get(async () => ["Nová navigácia"]), ["Nová navigácia"]);
  release(["Stará navigácia"]);
  assert.deepEqual(await stale, ["Stará navigácia"]);
  assert.deepEqual(await cache.get(async () => { throw Error("Must be cached"); }), ["Nová navigácia"]);

  const failing = createShortLivedAsyncCache(30_000);
  await assert.rejects(failing.get(async () => { throw Error("D1 unavailable"); }), /D1 unavailable/);
  assert.deepEqual(await failing.get(async () => ["Recovered"]), ["Recovered"]);
});
