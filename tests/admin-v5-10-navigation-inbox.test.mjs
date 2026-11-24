import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  adminNavigationGroups,
  adminNavigationItems,
  findActiveAdminNavigationItem,
  getAdminBreadcrumbs,
} from "../lib/admin-navigation.ts";
import {
  filterAdminAttentionItems,
  isAdminAttentionActive,
  isAdminAttentionView,
} from "../lib/admin-attention-queue.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const NOW = new Date("2026-11-24T08:00:00.000Z");

test("V5-10: seven compact work areas preserve canonical and historic destinations", () => {
  assert.deepEqual(adminNavigationGroups.map(group => group.label), [
    "Prehľad", "Redakcia", "Profily", "Partneri",
    "Kvalita a automatizácie", "Systém",
  ]);
  const groupFor = href => adminNavigationGroups.find(group => group.items.some(item => item.href === href))?.label;
  assert.equal(groupFor("/admin/podujatia"), "Redakcia");
  assert.equal(groupFor("/admin/facebook-obrazky"), "Redakcia");
  assert.equal(groupFor("/admin/adresar"), "Profily");
  assert.equal(groupFor("/admin/pomoc-psom"), "Profily");
  assert.equal(groupFor("/admin/podania"), "Partneri");
  assert.equal(groupFor("/admin/mapy"), "Systém");
  assert.equal(groupFor("/admin/nastroje"), "Systém");
  assert.equal(groupFor("/admin/automatizacie-gemini"), "Kvalita a automatizácie");
  assert.equal(adminNavigationItems.some(item => item.href === "/admin/steniatka"), false);
  assert.equal(adminNavigationItems.some(item => item.href === "/admin/sluzby-pre-psov"), false);
  const hrefs = adminNavigationItems.map(item => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.every(path => path === "/admin" || path.startsWith("/admin/")));
});

test("V5-10: breadcrumbs and navigation match long routes without swallowing specific workspaces", () => {
  const samples = [
    ["/admin", "/admin"],
    ["/admin/adresar/1872", "/admin/adresar"],
    ["/admin/sluzby-pre-psov", "/admin/adresar"],
    ["/admin/sluzby-pre-psov/katalog", "/admin/sluzby-pre-psov/katalog"],
    ["/admin/steniatka/pokrytie", "/admin/clanky"],
    ["/admin/podania", "/admin/podania"],
    ["/admin/dopyty", "/admin/podania"],
    ["/admin/pomoc/18", "/admin/pomoc-psom"],
    ["/admin/operations/automation", "/admin/automatizacie-gemini"],
    ["/admin/operations/geo", "/admin/mapy"],
    ["/admin/kvalita/seo", "/admin/kvalita/seo"],
  ];
  for (const [path, expected] of samples) {
    assert.equal(findActiveAdminNavigationItem(path)?.href, expected, path);
    const trail = getAdminBreadcrumbs(path);
    assert.equal(trail[0].href, "/admin", path);
    assert.equal(trail.at(-1)?.current, true, path);
    if (path !== "/admin") assert.equal(trail[1].href, expected, path);
  }
  assert.deepEqual(getAdminBreadcrumbs("/admin/sluzby-pre-psov").map(item => item.href),
    ["/admin", "/admin/adresar"]);
});

function item(id, status, extra = {}) {
  return {
    key: "notice:" + id, sourceType: "MODERATION_SUBMISSION", sourceId: id,
    title: id, reason: "", priority: "HIGH", status,
    attentionState: status === "APPROVED" ? "RESOLVED" : "IN_PROGRESS",
    createdAt: NOW.toISOString(), relevantAt: NOW.toISOString(), ageDays: 0,
    targetHref: "/admin/podania", ...extra,
  };
}

test("V5-10: read and seven-day snooze never resolve a pending moderation case", () => {
  const notices = [
    item("new", "PENDING_REVIEW"),
    item("read", "PENDING_REVIEW", { readAt: "2026-11-24T07:00:00Z" }),
    item("later", "PENDING_REVIEW", { snoozedUntil: "2026-12-01T08:00:00Z" }),
    item("expired", "PENDING_REVIEW", { snoozedUntil: "2026-11-23T08:00:00Z" }),
    item("done", "APPROVED"),
  ];
  const view = name => filterAdminAttentionItems(notices, { view: name }, NOW).map(x => x.sourceId);
  assert.deepEqual(view("unread"), ["new", "expired"]);
  assert.deepEqual(view("pending"), ["new", "read", "later", "expired"]);
  assert.deepEqual(view("active"), ["new", "read", "later", "expired"]);
  assert.deepEqual(view("snoozed"), ["later"]);
  assert.deepEqual(view("history"), ["done"]);
  assert.deepEqual(view("all"), ["new", "read", "later", "expired", "done"]);
  assert.equal(isAdminAttentionActive(notices[1]), true);
  assert.equal(isAdminAttentionActive(notices[2]), true);
  for (const name of ["unread", "pending", "snoozed", "history", "active", "all"]) {
    assert.equal(isAdminAttentionView(name), true);
  }
  assert.equal(isAdminAttentionView("approved"), false);
});

test("V5-10: Ctrl+K protects drafts, routes through authenticated admin search and uses real pages", () => {
  const dialog = read("components/admin-quick-navigation-dialog.tsx");
  const endpoint = read("app/api/admin/global-search/route.ts");
  const nav = read("components/admin-navigation.tsx");
  assert.match(dialog, /\/api\/admin\/global-search\?q=/);
  assert.match(dialog, /target\.origin !== window\.location\.origin/);
  assert.match(dialog, /target\.pathname\.startsWith\("\/admin\/"\)/);
  assert.match(dialog, /ADMIN_NAVIGATION_INTENT_EVENT/);
  assert.match(dialog, /\/admin\/podania|\/admin\/partners\/submissions/);
  assert.match(dialog, /\/admin\/steniatka\/pokrytie/);
  assert.match(endpoint, /getAdminApiUser\(\)/);
  assert.match(endpoint, /unauthorizedAdminResponse/);
  assert.match(nav, /dispatchAdminOverviewNavigation/);
  assert.match(nav, /if \(href === "\/admin"\) return;/);
  assert.match(nav, /prefetch=\{false\}/);
});

test("V5-10: acknowledgement API changes inbox metadata only, never approval", () => {
  const route = read("app/api/admin/attention/ack/route.ts");
  const store = read("lib/admin-attention-queue-store.ts");
  const ui = read("components/admin-attention-queue.tsx");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /INSERT INTO admin_attention_ack/);
  assert.doesNotMatch(route, /UPDATE moderation_submissions|UPDATE profile_reviews|status='APPROVED'/);
  assert.match(store, /UNREAD_INBOX_PREDICATE/);
  assert.match(store, /SNOOZED_INBOX_PREDICATE/);
  assert.match(store, /LEFT JOIN admin_attention_ack ack/);
  for (const label of ["Neprečítané", "Na vybavenie", "Odložené", "História"]) {
    assert.ok(ui.includes(label), label);
  }
});
