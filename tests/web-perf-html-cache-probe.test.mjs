import assert from "node:assert/strict";
import test from "node:test";
import { permittedProbePath, probePublicHtmlCache } from "../scripts/web-perf-html-cache-probe.mjs";

test("HTML cache probe never accepts private routes, queries, alternate origins or RSC URLs", () => {
  for (const path of ["/", "/plemena", "/plemena/labradorsky-retriever", "/clanky", "/adresar/veterinari"]) {
    assert.equal(permittedProbePath(path), true, path);
  }
  for (const path of ["/admin", "/partner", "/api/test", "/recenzia", "//evil.test",
    "https://psipedia.sk/", "/plemena?next=1", "/plemena#fragment", "/plemena/abc/extra",
    "/pomoc-psom/stratene-a-najdene", "/adresar/veterinari/profile", "", null]) {
    assert.equal(permittedProbePath(path), false, String(path));
  }
});

test("manual read-only probe sends two anonymous sequential GETs and records only cache timing/status", async () => {
  const requests = [];
  const result = await probePublicHtmlCache("/", async (url, options) => {
    requests.push({ url, options });
    return new Response("<html><body>Fixture</body></html>", {
      status: 200,
      headers: { "content-type": "text/html", "x-psipedia-cache": requests.length === 1 ? "MISS" : "HIT" },
    });
  }, async () => {});
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.equal(url, "https://psipedia.sk/");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Accept, "text/html");
    assert.equal(Object.keys(options.headers).sort().join(","), "Accept,User-Agent");
    assert.equal(Object.keys(options).sort().join(","), "headers,method,redirect");
  }
  assert.equal(result.path, "/");
  assert.equal(result.first.status, 200);
  assert.equal(result.second.status, 200);
  assert.equal(result.first.edge, "MISS");
  assert.equal(result.second.edge, "HIT");
  assert.ok(Number.isFinite(result.first.ttfb_ms));
  assert.ok(Number.isFinite(result.second.ttfb_ms));
  assert.doesNotMatch(JSON.stringify(result), /Fixture|Cookie|Authorization/);
  await assert.rejects(() => probePublicHtmlCache("/admin", () => { throw new Error("never called"); }));
});
