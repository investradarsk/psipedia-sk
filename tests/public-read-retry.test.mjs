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
