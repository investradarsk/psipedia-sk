import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
test("Manual-only protected workflow",()=>{
 const y=read(".github/workflows/production-d1-partner-0171-0172.yml");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/environment: production/);
 assert.match(y,/production-d1-migration/);
 assert.doesNotMatch(y,/^\s*(push|pull_request):/m);
 for(const mode of ["audit","apply0171","apply0172"])assert.ok(y.includes(mode));
});
test("Fixed migrations, preflight and Time Travel guard",()=>{
 const s=read("scripts/production-d1-partner-0171-0172.mjs");
 for(const v of ["0171_partner_single_manager.sql","0172_partner_help_claim_ownership.sql",
 "SQL_NOT_PINNED","PARTIAL_SCHEMA_STOP","PREFLIGHT_CONFLICT_STOP","NO_RECOVERY_BOOKMARK",
 "0171_REQUIRED_FIRST","POSTFLIGHT_BASE_COUNT_CHANGED"])assert.ok(s.includes(v),v);
 assert.doesNotMatch(s,/["']migrations["']\s*,\s*["']apply["']/);
});
test("Additive manager and help schema source",()=>{
 const a=read("drizzle/0171_partner_single_manager.sql");
 const b=read("drizzle/0172_partner_help_claim_ownership.sql");
 assert.match(a,/CREATE UNIQUE INDEX/);
 assert.match(a,/WHERE.*revoked_at.*IS NULL/);
 assert.doesNotMatch(a,/DELETE FROM partner_memberships/);
 assert.match(b,/CREATE TABLE/);
 assert.equal((b.match(/CREATE UNIQUE INDEX/g)||[]).length,6);
});
