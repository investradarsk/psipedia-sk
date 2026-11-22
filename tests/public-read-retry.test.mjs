import assert from "node:assert/strict";
import test from "node:test";
import { isTransientPublicReadError, retryTransientPublicRead } from "../lib/public-read-retry.ts";

test("public read succeeds without an extra query", async () => {
  let reads = 0;
  const value = await retryTransientPublicRead(async () => {
    reads += 1;
    return { items: ["veterinari"] };
  });
  assert.deepEqual(value, { items: ["veterinari"] });
  assert.equal(reads, 1);
});

test("retries one transient D1 transport error without changing the returned data", async () => {
  let reads = 0;
  const value = await retryTransientPublicRead(async () => {
    reads += 1;
    if (reads === 1) throw new Error("D1_ERROR: Network connection lost");
    return { total: 23, profiles: [1, 2] };
  });
  assert.deepEqual(value, { total: 23, profiles: [1, 2] });
  assert.equal(reads, 2);
});

test("persistent transient failure stops after one retry", async () => {
  let reads = 0;
  await assert.rejects(retryTransientPublicRead(async () => {
    reads += 1;
    throw new Error("database is locked");
  }), /database is locked/);
  assert.equal(reads, 2);
});

test("schema, authorization and arbitrary errors never retry", async () => {
  for (const message of [
    "D1_ERROR: no such column: status",
    "D1_ERROR: no such table: directory_profiles",
    "Access denied",
    "Unexpected render exception",
    "D1_ERROR: UNIQUE constraint failed",
  ]) {
    let reads = 0;
    await assert.rejects(retryTransientPublicRead(async () => {
      reads += 1;
      throw new Error(message);
    }), (error) => error.message === message);
    assert.equal(reads, 1, message);
  }
});

test("only recognized transient failures are retryable", () => {
  assert.equal(isTransientPublicReadError(new Error("SQLITE_BUSY: database is locked")), true);
  assert.equal(isTransientPublicReadError("query timed out"), true);
  assert.equal(isTransientPublicReadError(new Error("D1_ERROR")), false);
  assert.equal(isTransientPublicReadError(new Error("no such column")), false);
});

test("directory diagnostics logs only a fixed stage and transient flag, preserving the original error", async () => {
  const { reportDirectoryPublicReadFailure } = await import("../lib/public-directory-read-diagnostics.ts");
  const original = console.error;
  const logs = [];
  console.error = (line) => logs.push(String(line));
  const originalError = new Error("Network connection lost. sensitive user@example.com");
  try {
    assert.throws(
      () => reportDirectoryPublicReadFailure("category_previews", originalError),
      (error) => error === originalError,
    );
  } finally {
    console.error = original;
  }
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    event: "public_directory_read_failed",
    stage: "category_previews",
    transient: true,
    errorType: "Error",
  });
  assert.doesNotMatch(logs[0], /sensitive|user@example.com/);
});

test("directory SSR diagnostics cover primary listing, previews, hero and sidebar without changing data", async () => {
  const { readFileSync } = await import("node:fs");
  const root = readFileSync(new URL("../app/adresar/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/directory-page.tsx", import.meta.url), "utf8");
  assert.match(root, /reportDirectoryPublicReadFailure\("listing", error\)/);
  for (const stage of ["category_previews", "hero_visual", "article_discovery"]) {
    assert.ok(component.includes('reportDirectoryPublicReadFailure("' + stage + '", error)'));
  }
  assert.match(component, /const \[categoryPreviews, heroVisual, discovery\] = await Promise\.all\(\[/);
});
