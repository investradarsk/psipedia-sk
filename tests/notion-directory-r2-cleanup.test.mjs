import assert from "node:assert/strict";
import test from "node:test";
import { cleanupUnreferencedNotionUpload } from "../lib/notion-sync-shared.ts";

function fixtures({ reference = null, dbError = false } = {}) {
  const deleted = [];
  const queries = [];
  const bucket = { async delete(key) { deleted.push(key); } };
  const database = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind(key) {
          return { async first() {
            if (dbError) throw new Error("D1 response lost");
            return reference === key ? { used: 1 } : null;
          } };
        },
      };
    },
  };
  return { bucket, database, deleted, queries };
}

test("R2 cleanup deletes new unused upload after a rejected or pre-commit D1 write", async () => {
  const f = fixtures();
  await cleanupUnreferencedNotionUpload(f.database, f.bucket, "directory/new.webp");
  assert.deepEqual(f.deleted, ["directory/new.webp"]);
  assert.equal(f.queries.length, 1);
});

test("R2 cleanup retains uploaded image on committed D1 reference, even after post-commit GEO failure", async () => {
  const f = fixtures({ reference: "directory/new.webp" });
  await cleanupUnreferencedNotionUpload(f.database, f.bucket, "directory/new.webp");
  assert.deepEqual(f.deleted, []);
});

test("R2 cleanup defers deletion when D1 commit outcome cannot be determined", async () => {
  const f = fixtures({ dbError: true });
  await cleanupUnreferencedNotionUpload(f.database, f.bucket, "directory/new.webp");
  assert.deepEqual(f.deleted, []);
});

test("R2 cleanup never targets the original active image when no new upload exists", async () => {
  const f = fixtures({ reference: "directory/old.webp" });
  await cleanupUnreferencedNotionUpload(f.database, f.bucket, null);
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.queries, []);
});

test("R2 cleanup is idempotent for missing R2 binding", async () => {
  const f = fixtures();
  await cleanupUnreferencedNotionUpload(f.database, undefined, "directory/new.webp");
  assert.deepEqual(f.deleted, []);
});
