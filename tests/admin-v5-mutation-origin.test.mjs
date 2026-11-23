import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env } from "cloudflare:workers";
import { GET as getAnalytics, POST as setAnalytics } from "../app/api/admin/analytics-device/route.ts";
import { POST as upload } from "../app/api/admin/uploads/route.ts";
import { POST as applyAddressResearch } from "../app/api/admin/address-research-import/apply/route.ts";
import { GET as getNames, POST as createName } from "../app/api/admin/name-days/route.ts";
import { PUT as editName, DELETE as archiveName } from "../app/api/admin/name-days/[id]/route.ts";
import { POST as importNames } from "../app/api/admin/name-days/import/route.ts";
import { GET as getMonetization, POST as addMonetization, PATCH as updateMonetization } from "../app/api/admin/monetization/route.ts";

const ADMIN = { authProvider: "chatgpt", email: "admin@example.com", displayName: "Admin", fullName: "Admin" };
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOioAAAAASUVORK5CYII=", "base64"));
const params = { params: Promise.resolve({ id: "1" }) };
const cases = [
  { label: "uploads/articles", path: "uploads", handler: upload, type: "image/png", folder: "articles", body: PNG, status: 201 },
  { label: "uploads/facebook-images", path: "uploads", handler: upload, type: "image/png", folder: "facebook-images", body: PNG, status: 201 },
  { label: "analytics-device POST", path: "analytics-device", handler: setAnalytics, body: '{"excluded":true}', status: 200 },
  { label: "address-research-import/apply POST", path: "address-research-import/apply", handler: applyAddressResearch, body: '{"records":[],"confirmationToken":"test"}', status: 200 },
  { label: "name-days POST", path: "name-days", handler: createName, body: '{"name":"Neo"}', status: 201 },
  { label: "name-days PUT", path: "name-days/1", method: "PUT", handler: editName, params, body: '{"name":"Neo"}', status: 200 },
  { label: "name-days DELETE", path: "name-days/1", method: "DELETE", handler: archiveName, params, status: 200 },
  { label: "name-days/import POST", path: "name-days/import", handler: importNames, body: '{"records":[],"apply":true}', status: 200 },
  { label: "monetization POST", path: "monetization", handler: addMonetization, body: '{"kind":"promotion"}', status: 201 },
  { label: "monetization PATCH", path: "monetization", method: "PATCH", handler: updateMonetization, body: '{"kind":"promotion","id":"x","status":"active"}', status: 200 },
];

function makeRequest(item, { origin, site, headers: extraHeaders } = {}) {
  const headers = new Headers({ "content-type": item.type ?? "application/json", ...extraHeaders });
  if (item.folder) headers.set("x-upload-folder", item.folder);
  if (origin !== undefined) headers.set("origin", origin);
  if (site !== undefined) headers.set("sec-fetch-site", site);
  return new Request("https://psipedia.sk/api/admin/" + item.path, {
    method: item.method ?? "POST",
    headers,
    ...(item.body === undefined ? {} : { body: item.body }),
  });
}
function invoke(item, provenance) {
  return item.handler(makeRequest(item, provenance), item.params);
}
function loggedIn() {
  env.AUTH_MODE = "chatgpt";
  globalThis.__v5TrustedHeaders = new Headers({ host: "psipedia.sk" });
  globalThis.__v5TestIdentity = ADMIN;
}
function writes() { return { ...(globalThis.__v5Writes ?? {}) }; }

test("all selected live write handlers use strict provenance before parsing or storing", () => {
  const paths = [
    "uploads/route.ts", "analytics-device/route.ts", "address-research-import/apply/route.ts",
    "name-days/route.ts", "name-days/[id]/route.ts", "name-days/import/route.ts",
    "monetization/route.ts",
  ];
  let count = 0;
  for (const path of paths) {
    const source = readFileSync(new URL("../app/api/admin/" + path, import.meta.url), "utf8");
    const matches = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\(/g)];
    assert.ok(matches.length, path);
    for (const match of matches) {
      count++;
      const after = source.slice(match.index);
      const next = /\nexport async function (?:GET|POST|PUT|PATCH|DELETE)\(/.exec(after.slice(match[0].length));
      const section = next ? after.slice(0, match[0].length + next.index) : after;
      assert.match(section, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/, path + " " + match[1]);
      const guardAt = section.indexOf("requireAdminMutation(");
      const parseAt = section.search(/await request\.(?:json|text|arrayBuffer)\(/);
      if (parseAt >= 0) assert.ok(guardAt >= 0 && guardAt < parseAt, path + " guard before parsing");
    }
  }
  assert.equal(count, 9, "all nine HTTP mutator exports are covered");
});

test("authenticated first-party Origin and Fetch Metadata fallback allow real route mutations", async () => {
  loggedIn();
  globalThis.__v5Writes = {};
  for (const item of cases) {
    for (const provenance of [
      { origin: "https://psipedia.sk", site: "same-origin" },
      { origin: "https://psipedia.sk" },
      { site: "same-origin" },
    ]) {
      const response = await invoke(item, provenance);
      assert.equal(response.status, item.status, item.label + " " + JSON.stringify(provenance));
    }
  }
  assert.ok(globalThis.__v5Writes.upload >= 6, "uploads reach R2 only with authenticated provenance");
  assert.ok(globalThis.__v5Writes.name >= 3, "valid name mutations still persist");
  assert.ok(globalThis.__v5Writes.address >= 3, "valid address imports still apply");
  assert.ok(globalThis.__v5Writes.monetization >= 6, "valid monetization writes still persist");
});

test("cross-site, conflicting Fetch Metadata, missing and opaque provenance block every selected write", async () => {
  loggedIn();
  const blocked = [
    { origin: "https://attacker.example", site: "cross-site" },
    { origin: "https://psipedia.sk", site: "cross-site" },
    { origin: "https://psipedia.sk", site: "same-site" },
    { origin: "http://psipedia.sk", site: "same-origin" },
    { origin: "null", site: "same-origin" },
    { site: "cross-site" }, { site: "none" }, {},
  ];
  for (const item of cases) {
    for (const provenance of blocked) {
      const before = writes();
      const response = await invoke(item, provenance);
      assert.equal(response.status, 403, item.label + " " + JSON.stringify(provenance));
      assert.deepEqual(writes(), before, item.label + " must not write when provenance fails");
    }
  }
});

test("Cloudflare Access or configured Admin identity remains mandatory before CSRF evaluation", async () => {
  env.AUTH_MODE = "chatgpt";
  globalThis.__v5TrustedHeaders = new Headers({ host: "psipedia.sk" });
  for (const identity of [null, { ...ADMIN, email: "outsider@example.com" }]) {
    globalThis.__v5TestIdentity = identity;
    for (const item of cases) {
      assert.equal((await invoke(item, { origin: "https://attacker.example" })).status, 401, item.label);
    }
  }
  try {
    env.AUTH_MODE = "cloudflare-access";
    globalThis.__v5TestIdentity = { ...ADMIN, authProvider: "cloudflare-access" };
    globalThis.__v5TrustedHeaders = new Headers({ host: "psipedia.sk" });
    const spoofed = makeRequest(cases[2], {
      origin: "https://psipedia.sk",
      headers: { "cf-access-jwt-assertion": "forged", "x-psipedia-admin-authorized": "1" },
    });
    assert.equal((await setAnalytics(spoofed)).status, 401, "client-provided Access headers cannot bypass Worker verification");
    globalThis.__v5TrustedHeaders = new Headers({
      host: "psipedia.sk", "cf-access-jwt-assertion": "verified-worker-assertion",
      "x-psipedia-admin-authorized": "1",
    });
    assert.equal((await invoke(cases[2], { site: "same-origin" })).status, 200, "trusted Worker marker and same-origin signal are both required");
  } finally {
    loggedIn();
  }
});

test("GET remains readable to authenticated Admin; PWA analytics cookie remains functional", async () => {
  loggedIn();
  assert.equal((await getAnalytics(new Request("https://psipedia.sk/api/admin/analytics-device"))).status, 200);
  assert.equal((await getNames(new Request("https://psipedia.sk/api/admin/name-days"))).status, 200);
  assert.equal((await getMonetization()).status, 200);
  const response = await invoke(cases[2], { site: "same-origin" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Lax; Secure/);
  assert.match(readFileSync(new URL("../lib/admin-image-upload.ts", import.meta.url), "utf8"), /fetch\("\/api\/admin\/uploads"/);
  assert.match(readFileSync(new URL("../components/admin-pwa-settings.tsx", import.meta.url), "utf8"), /fetch\("\/api\/admin\/analytics-device"/);
});
