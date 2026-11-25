import assert from "node:assert/strict";
import test from "node:test";
import {
  settleOptionalRead,
  matchOptionalPublicCache,
  putOptionalPublicCache,
} from "../lib/optional-read-recovery.ts";

test("optional read preserves real results and empty results", async () => {
  const rows = [{ id: 1 }];
  assert.equal(await settleOptionalRead("unspecified", Promise.resolve(rows), null), rows);
  assert.deepEqual(await settleOptionalRead("unspecified", Promise.resolve([]), null), []);
});

test("transient optional failure does not hide an independent primary result", async () => {
  const failure = new Error("Network connection lost.");
  const [primary, optional] = await Promise.all([
    Promise.resolve({ total: 42 }),
    settleOptionalRead("unspecified", Promise.reject(failure), null),
  ]);
  assert.deepEqual(primary, { total: 42 });
  assert.equal(optional, null);
});

test("unknown, authorization, framework and abort errors propagate unchanged", async () => {
  const errors = [
    new Error("no such table: items"),
    Object.assign(new Error("Network connection lost."), { status: 403 }),
    Object.assign(new Error("Network connection lost."), { digest: "NEXT_REDIRECT;replace" }),
    Object.assign(new Error("Network connection lost."), { name: "AbortError" }),
  ];
  for (const error of errors) {
    await assert.rejects(settleOptionalRead("unspecified", Promise.reject(error), null), (e) => e === error);
  }
});

test("cache read outage falls through and successful cache hit is unchanged", async () => {
  const key = new Request("https://example.test/public");
  const response = new Response("ok");
  assert.equal(await matchOptionalPublicCache({ match: async () => response }, key, "html"), response);
  assert.equal(await matchOptionalPublicCache({ match: async () => undefined }, key, "html"), undefined);
  assert.equal(await matchOptionalPublicCache({ match: async () => { throw new Error("cache offline"); } }, key, "html"), undefined);
});

test("cache write outage cannot reject a valid origin response", async () => {
  const key = new Request("https://example.test/public");
  const response = new Response("origin");
  await putOptionalPublicCache({ put: async () => { throw new Error("cache offline"); } }, key, response, "html");
  assert.equal(await response.text(), "origin");
});
