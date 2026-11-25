import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observeWorkerResponse } from "../lib/stability-diagnostics.ts";
import { ensureNoSniffHeader } from "../lib/http-response-security.ts";

const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

test("all Worker responses cross the security boundary, including early returns", () => {
  assert.match(workerSource, /async fetch\(request: Request, env: Env, ctx: ExecutionContext\): Promise<Response> \{\s*return observeWorkerResponse\(request, async \(\) => \{\s*return ensureNoSniffHeader\(await worker\.fetch\(request, env, ctx\)\);\s*\}\);\s*\}/);
  assert.match(workerSource, /export default securedWorker;/);
  // Cache and redirects run inside worker.fetch; they cannot bypass the wrapper.
  assert.match(workerSource, /if \(cached\) return responseWithHeaders\(cached/);
  assert.match(workerSource, /return Response\.redirect\(url, 301\)/);
});

test("nosniff is attached without changing document content, cache headers or status", async () => {
  const original = new Response("<html>sample</html>", {
    headers: { "Content-Type": "text/html", "Cache-Control": "private, no-store", "ETag": "\"abc\"" },
  });
  const guarded = ensureNoSniffHeader(original);
  assert.equal(guarded.headers.get("x-content-type-options"), "nosniff");
  assert.equal(guarded.headers.get("cache-control"), "private, no-store");
  assert.equal(guarded.headers.get("etag"), "\"abc\"");
  assert.equal(guarded.headers.get("content-type"), "text/html");
  assert.equal(guarded.status, 200);
  assert.equal(await guarded.text(), "<html>sample</html>");
});

test("nosniff works for redirects and access errors without changing location or cookie", async () => {
  const redirect = Response.redirect("https://psipedia.sk/plemena/", 301);
  const guardedRedirect = ensureNoSniffHeader(redirect);
  assert.equal(guardedRedirect.status, 301);
  assert.equal(guardedRedirect.headers.get("location"), "https://psipedia.sk/plemena/");
  assert.equal(guardedRedirect.headers.get("x-content-type-options"), "nosniff");

  const forbidden = new Response("Forbidden", {
    status: 403,
    headers: { "Set-Cookie": "session=invalid; HttpOnly", "Cache-Control": "private, no-store" },
  });
  const guarded = ensureNoSniffHeader(forbidden);
  assert.equal(guarded.status, 403);
  assert.equal(guarded.headers.get("set-cookie"), "session=invalid; HttpOnly");
  assert.equal(guarded.headers.get("cache-control"), "private, no-store");
  assert.equal(await guarded.text(), "Forbidden");
});

test("already protected responses are returned without rewriting", () => {
  const protectedResponse = new Response("asset", {
    headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000" },
  });
  assert.equal(ensureNoSniffHeader(protectedResponse), protectedResponse);
});

test("network error responses are not reconstructed into invalid HTTP status 0", () => {
  const failed = Response.error();
  assert.equal(ensureNoSniffHeader(failed), failed);
});

test("no-body 304 responses remain valid when security header is attached", () => {
  const notModified = new Response(null, { status: 304, headers: { ETag: '"unchanged"' } });
  const guarded = ensureNoSniffHeader(notModified);
  assert.equal(guarded.status, 304);
  assert.equal(guarded.body, null);
  assert.equal(guarded.headers.get("ETag"), '"unchanged"');
  assert.equal(guarded.headers.get("X-Content-Type-Options"), "nosniff");
});

test("diagnostic observation preserves security on every returned response", async () => {
  const request = new Request("https://psipedia.sk/adresar");
  for (const status of [200, 301, 403, 503]) {
    const upstream = new Response("fixture", {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
    let calls = 0;
    const result = await observeWorkerResponse(request, async () => {
      calls++;
      return ensureNoSniffHeader(upstream);
    });
    assert.equal(calls, 1);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.equal(await result.text(), "fixture");
  }
});
