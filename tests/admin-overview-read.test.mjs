import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_OVERVIEW_READ_TIMEOUT_MS,
  settleAdminOverviewRead,
} from "../lib/admin-overview-read.ts";

test("successful optional Admin read returns the real value", async () => {
  const real = { status: "OK", count: 12 };
  const fallback = { status: "UNAVAILABLE", count: null };
  assert.equal(await settleAdminOverviewRead(Promise.resolve(real), fallback, 50), real);
});

test("failed optional D1 read keeps the Admin overview available but explicitly unavailable", async () => {
  const fallback = { status: "UNAVAILABLE", count: null };
  const rejected = Promise.reject(new Error("D1 timeout"));
  assert.equal(await settleAdminOverviewRead(rejected, fallback, 50), fallback);
});

test("unresolved D1 read cannot indefinitely block Admin route streaming", async () => {
  const fallback = { status: "UNAVAILABLE", count: null };
  const hung = new Promise(() => {});
  const started = Date.now();
  assert.equal(await settleAdminOverviewRead(hung, fallback, 15), fallback);
  assert.ok(Date.now() - started < ADMIN_OVERVIEW_READ_TIMEOUT_MS);
  assert.equal(ADMIN_OVERVIEW_READ_TIMEOUT_MS, 5_000);
});

test("a late rejection after timeout is consumed without changing the unavailable response", async () => {
  let rejectRead = () => {};
  const delayed = new Promise((_, reject) => { rejectRead = reject; });
  const fallback = { status: "UNAVAILABLE" };
  assert.equal(await settleAdminOverviewRead(delayed, fallback, 5), fallback);
  rejectRead(new Error("Late D1 failure"));
  await new Promise(resolve => setTimeout(resolve, 5));
});
