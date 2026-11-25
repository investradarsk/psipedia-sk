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

test("unified Help hub returns to the same filtered category and page", () => {
  const origins = ["/admin/adopcie", "/admin/pomoc-psom"];
  const source = "/admin/pomoc-psom?category=adopcia&q=labrador&page=4";
  const detail = adminDetailHref("/admin/adopcie/127", source);
  const parsed = new URL(detail, "https://admin.invalid");
  assert.equal(parsed.pathname, "/admin/adopcie/127");
  assert.equal(adminReturnHref(parsed.searchParams.get("returnTo") ?? undefined, origins), source);
  assert.equal(adminReturnHref("/admin/pomoc-psom-evil?category=adopcia", origins), origins[0]);
});

test("all Help editors can return to the explicitly allowed unified hub", () => {
  for (const root of ["/admin/organizacie", "/admin/pomoc", "/admin/stratene-najdene"]) {
    const source = "/admin/pomoc-psom?category=utulky&page=3";
    assert.equal(adminReturnHref(source, [root, "/admin/pomoc-psom"]), source);
  }
});

test("partner detail and messages preserve a filtered account list", () => {
  const root = "/admin/partners";
  const list = root + "?q=neo&status=ACTIVE&verified=VERIFIED&access=LINKED&pageSize=50&page=2";
  const detail = root + "/accounts/partner-id";
  for (const href of [detail, detail + "?tab=spravy", detail + "?tab=historia&page=2"]) {
    const parsed = new URL(adminDetailHref(href, list), "https://admin.invalid");
    const original = new URL(href, "https://admin.invalid");
    assert.equal(parsed.searchParams.get("tab"), original.searchParams.get("tab"));
    assert.equal(parsed.searchParams.get("page"), original.searchParams.get("page"));
    assert.equal(adminReturnHref(parsed.searchParams.get("returnTo") ?? undefined, root), list);
  }
  assert.equal(adminReturnHref(root + "/accounts/partner-id", root), root);
});
