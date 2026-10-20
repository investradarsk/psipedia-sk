import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireAdminMutation } from "../lib/admin-auth.ts";
import { rejectUntrustedAdminMutationOrigin } from "../lib/admin-mutation-origin.ts";
import { GET as readTopics, POST as createTopic } from "../app/api/admin/article-topics/route.ts";

const ADMIN = { authProvider: "chatgpt", email: "admin@example.com", displayName: "Admin", fullName: "Admin" };
function request({ method = "POST", target = "https://psipedia.sk/api/admin/article-topics", origin, site, body = "{}" } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== undefined) headers.set("origin", origin);
  if (site !== undefined) headers.set("sec-fetch-site", site);
  return new Request(target, { method, headers, ...(method === "GET" ? {} : { body }) });
}
function authorized() { globalThis.__csrfTestIdentity = ADMIN; }

test("strict same-origin permits exact Origin and Fetch Metadata fallback", () => {
  for (const options of [
    {origin:"https://psipedia.sk",site:"same-origin"},
    {origin:"https://psipedia.sk"},
    {site:"same-origin"},
    {target:"http://localhost:3000/api/admin/articles",origin:"http://localhost:3000",site:"same-origin"}
  ]) assert.equal(rejectUntrustedAdminMutationOrigin(request(options)), null, JSON.stringify(options));
});

test("cross-origin, scheme/port mismatch, malformed Origin, and missing trusted headers fail closed", () => {
  for (const options of [
    {origin:"https://evil.example",site:"cross-site"},
    {origin:"https://psipedia.sk",site:"cross-site"},
    {origin:"https://psipedia.sk",site:"same-site"},
    {origin:"http://psipedia.sk",site:"same-origin"},
    {origin:"https://psipedia.sk:8443",site:"same-origin"},
    {origin:"https://psipedia.sk.evil.example",site:"same-origin"},
    {origin:"null",site:"same-origin"},
    {origin:"not a url",site:"same-origin"},
    {origin:"https://psipedia.sk/path",site:"same-origin"},
    {origin:"https://psipedia.sk/",site:"same-origin"},
    {origin:"https://user@psipedia.sk",site:"same-origin"},
    {origin:"https://psipedia.sk",site:"invalid"},
    {}, {site:"none"}, {site:"cross-site"}, {origin:"null"}
  ]) assert.equal(rejectUntrustedAdminMutationOrigin(request(options))?.status, 403, JSON.stringify(options));
});

test("real requireAdminMutation rejects unauthorized identities before origin", async () => {
  globalThis.__csrfTestIdentity = null;
  assert.equal((await requireAdminMutation(request({origin:"https://evil.example"}))).response?.status, 401);
  globalThis.__csrfTestIdentity = {...ADMIN,email:"outsider@example.com"};
  assert.equal((await requireAdminMutation(request({origin:"https://psipedia.sk"}))).response?.status, 401);
});

test("real requireAdminMutation checks Origin after successful identity", async () => {
  authorized();
  assert.equal((await requireAdminMutation(request({origin:"https://evil.example",site:"same-origin"}))).response?.status, 403);
  assert.equal((await requireAdminMutation(request({origin:"http://psipedia.sk",site:"same-origin"}))).response?.status, 403);
  const valid = await requireAdminMutation(request({origin:"https://psipedia.sk",site:"same-origin"}));
  assert.equal(valid.response, null);
  assert.equal(valid.user?.email, "admin@example.com");
});

test("live legacy Article Topics handler: GET, CSRF, invalid JSON and successful write", async () => {
  authorized();
  globalThis.__csrfTestTopicWrites = 0;
  assert.equal((await readTopics(request({method:"GET"}))).status, 200);
  assert.equal((await createTopic(request({origin:"https://attacker.example",site:"cross-site"}))).status, 403);
  assert.equal((await createTopic(request())).status, 403);
  assert.equal((await createTopic(request({origin:"https://psipedia.sk",site:"same-origin",body:"{"}))).status, 400);
  assert.equal(globalThis.__csrfTestTopicWrites, 0, "malformed request must not write");
  assert.equal((await createTopic(request({origin:"https://psipedia.sk",site:"same-origin",body:'{"label":"Test"}'}))).status, 201);
  assert.equal(globalThis.__csrfTestTopicWrites, 1);
});

const legacyRoutes = [
  "directory/route.ts", "directory/[id]/route.ts", "directory/[id]/service-options/route.ts",
  "articles/route.ts", "articles/[id]/route.ts", "articles/content-qa-remediation/route.ts",
  "article-topics/route.ts", "article-topics/[id]/route.ts", "article-feedback/[id]/route.ts",
  "events/route.ts", "events/[id]/route.ts", "events/bulk/route.ts",
  "organizations/route.ts", "organizations/[id]/route.ts", "organizations/bulk/route.ts",
  "organizations/[id]/publication/route.ts", "organizations/[id]/google-place/route.ts",
  "organizations/[id]/fundraising/route.ts", "organizations/[id]/fundraising/[methodId]/route.ts",
  "organizations/[id]/fundraising/[methodId]/verification/route.ts",
  "organizations/[id]/locations/route.ts", "organizations/[id]/locations/[locationId]/route.ts",
  "adoptions/route.ts", "adoptions/[id]/route.ts",
  "breeds/route.ts", "breeds/[id]/route.ts", "breeds/bulk/route.ts",
];

test("every legacy mutator has centralized guard before request parsing; GET remains unmodified", () => {
  let total = 0;
  for (const relativePath of legacyRoutes) {
    const source = readFileSync(new URL("../app/api/admin/" + relativePath, import.meta.url), "utf8");
    const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
    assert.ok(methods.length, relativePath);
    for (let i=0; i<methods.length; i++) {
      const method = methods[i][1];
      const section = source.slice(methods[i].index, i+1 < methods.length ? methods[i+1].index : undefined);
      const guard = section.indexOf("requireAdminMutation(request)");
      if (method === "GET") {
        assert.equal(guard, -1, relativePath + " GET");
      } else {
        total++;
        assert.ok(guard >= 0, relativePath + " " + method);
        assert.doesNotMatch(section, /getAdminApiUser\(\)/, relativePath + " " + method);
        const parsed = section.indexOf("request.json()");
        if (parsed !== -1) assert.ok(parsed > guard, relativePath + " " + method + " parses before guard");
      }
    }
  }
  assert.ok(total >= 35, "All known mutating handlers must be represented");
});

test("existing CAS, publication, Notion, and extra endpoint guards are still present", () => {
  const read = (p) => readFileSync(new URL("../app/api/admin/" + p, import.meta.url), "utf8");
  assert.match(read("articles/[id]/route.ts"), /expectedUpdatedAt/);
  assert.match(read("articles/[id]/route.ts"), /writeBackPublishedArticleToNotion/);
  assert.match(read("events/[id]/route.ts"), /writeBackPublishedEventToNotion/);
  assert.match(read("events/[id]/route.ts"), /request\.headers\.get\("origin"\)/);
  assert.match(read("directory/[id]/route.ts"), /source_data_json=\?6/);
  assert.match(read("organizations/[id]/route.ts"), /expectedUpdatedAt/);
  assert.match(read("organizations/[id]/google-place/route.ts"), /sameOriginJson\(request\)/);
});
