import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");

test("Admin grants and updates only an active OWNER", () => {
 const source = read("lib/partner-admin-store.ts");
 const create = source.slice(source.indexOf("export async function createPartnerMembershipAdmin"),
  source.indexOf("export async function changePartnerMembershipAdmin"));
 assert.match(create, /input\.role!=="OWNER"/);
 assert.match(create, /account\.status!=="ACTIVE"/);
 const change = source.slice(source.indexOf("export async function changePartnerMembershipAdmin"),
  source.indexOf("export async function ensurePartnerOwnerMembershipAdmin"));
 assert.match(change, /!input\.revoke && input\.role!=="OWNER"/);
 assert.match(change, /UPDATE partner_memberships SET revoked_at/);
 assert.doesNotMatch(change, /DELETE FROM partner_memberships/);
});

test("Admin and API no longer offer legacy role creation", () => {
 const component = read("components/admin-partner-account-actions.tsx");
 assert.match(component, /canonicalId:selected\.id,role:"OWNER"/);
 assert.match(component, /Správca profilu/);
 assert.match(component, /Historická rola:/);
 assert.match(component, /Nastaviť správcu/);
 assert.doesNotMatch(component, /<option value="MANAGER"|<option value="EDITOR"/);
 for (const path of ["app/api/admin/partners/memberships/route.ts",
  "app/api/admin/partners/memberships/[id]/route.ts"]) {
  assert.doesNotMatch(read(path), /"MANAGER"\|"EDITOR"/);
 }
});

test("0171 still enforces one active manager and only OWNER", () => {
 const sql = read("drizzle/0171_partner_single_manager.sql");
 assert.match(sql, /CREATE UNIQUE INDEX/);
 assert.match(sql, /partner_memberships_one_active_resource/);
 assert.match(sql, /CREATE TRIGGER/);
 assert.match(sql, /partner_memberships_only_owner_insert/);
 assert.match(sql, /partner_memberships_only_owner_update/);
});
