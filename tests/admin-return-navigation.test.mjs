import assert from "node:assert/strict";
import test from "node:test";
import { adminDetailHref, adminReturnHref } from "../lib/admin-return-navigation.ts";

const listing = "/admin/organizacie";
test("record return keeps the filtered second page and sort", () => {
  const source = "/admin/organizacie?q=nitra&status=PUBLISHED&sort=name&direction=asc&page=2";
  const detail = adminDetailHref("/admin/organizacie/42#fundraising", source);
  const parsed = new URL(detail, "https://admin.invalid");
  assert.equal(parsed.pathname, "/admin/organizacie/42");
  assert.equal(parsed.hash, "#fundraising");
  assert.equal(adminReturnHref(parsed.searchParams.get("returnTo") ?? undefined, listing), source);
});

test("supports either directory listing without escaping the admin", () => {
  const roots = ["/admin/adresar", "/admin/sluzby-pre-psov"];
  assert.equal(adminReturnHref("/admin/sluzby-pre-psov?category=veterinari&page=2", roots),
    "/admin/sluzby-pre-psov?category=veterinari&page=2");
});

test("rejects external, protocol-relative, sibling and malformed return destinations", () => {
  for (const untrusted of [
    "//evil.example/path", "https://evil.example", "/admin/organizacie-extra?page=2",
    "/admin/pomoc?page=2", "/admin/organizacie#malicious",
    "/admin/organizacie\\evil", "/admin/organizacie\nlocation:evil",
  ]) assert.equal(adminReturnHref(untrusted, listing), listing, untrusted);
  assert.equal(adminReturnHref(["/admin/organizacie?page=2"], listing), listing);
  assert.equal(adminReturnHref(undefined, listing), listing);
});
