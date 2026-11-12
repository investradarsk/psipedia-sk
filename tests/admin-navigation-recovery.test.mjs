import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_NAVIGATION_START_EVENT,
  ADMIN_NAVIGATION_STALL_MS,
  adminNavigationTarget,
} from "../lib/admin-navigation-recovery.ts";

const origin = "https://psipedia.sk/admin/operations";

test("recovery accepts only same-origin Admin destinations", () => {
  assert.equal(adminNavigationTarget("/admin/plemena?sort=name#list", origin),
    "/admin/plemena?sort=name#list");
  assert.equal(adminNavigationTarget("https://psipedia.sk/admin/clanky", origin),
    "/admin/clanky");
  assert.equal(adminNavigationTarget("/admin", origin), "/admin");
  for (const href of [
    "/administer", "/partner", "/api/admin/breeds", "https://other.example/admin",
    "javascript:alert(1)", "//other.example/admin", "http://[",
  ]) {
    assert.equal(adminNavigationTarget(href, origin), null, href);
  }
});

test("recovery uses the existing navigation wait budget and an isolated event", () => {
  assert.equal(ADMIN_NAVIGATION_STALL_MS, 12_000);
  assert.equal(ADMIN_NAVIGATION_START_EVENT, "psipedia:admin-navigation-start");
});
