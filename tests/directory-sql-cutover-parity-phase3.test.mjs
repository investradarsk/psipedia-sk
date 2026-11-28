import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Retain the live Admin API contract; the pre-cutover SQL/JSON shadow reader is retired.
test("the authenticated Admin GET retires the historical JSON parity endpoint",()=>{
  const source=readFileSync(fileURLToPath(new URL(
    "../app/api/admin/directory/[id]/route.ts",import.meta.url)),"utf8");
  const start=source.indexOf("export async function GET(");
  const stop=source.indexOf("export async function PUT(",start);
  const get=source.slice(start,stop);
  assert.match(get,/await getAdminApiUser\(\)/);
  assert.ok(get.indexOf("await getAdminApiUser()") < get.indexOf("sqlParity"));
  assert.match(get,/searchParams\.get\("sqlParity"\) === "1"/);
  assert.doesNotMatch(get,/readDirectorySqlShadowParity\(db, id\)/);
  assert.match(get,/status:\s*410/);
  // The Admin GET now returns an SQL-enriched profile, failing closed on read errors.
  assert.match(get,/readDirectory0170EditorialFields\(db,/);
  assert.match(get,/return Response\.json\(\{profile:\{\.\.\.profile,importData\}\}/);
  assert.match(get,/if \(!db\) return Response\.json/);
  assert.match(get,/status:503/);
  assert.doesNotMatch(get,/\b(?:UPDATE|DELETE|INSERT)\b/i);
});
