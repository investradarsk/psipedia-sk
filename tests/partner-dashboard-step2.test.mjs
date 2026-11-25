import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const { buildPartnerDashboardSummary } = await import(
  pathToFileURL(new URL("../lib/partner-dashboard.ts", import.meta.url).pathname).href
);

test("Partner dashboard counts actual resources and only outstanding requests", () => {
  const summary = buildPartnerDashboardSummary({
    resources: [
      { entityType: "DIRECTORY_PROFILE" }, { entityType: "HELP_ORGANIZATION" },
      { entityType: "MANAGED_EVENT" }, { entityType: "MANAGED_EVENT" },
    ],
    claims: [
      { id: "claim1", name: "Veterina", status: "PENDING", createdAt: "2026-11-15T11:00:00Z" },
      { id: "claim2", name: "Salón", status: "REJECTED", createdAt: "2026-11-13T11:00:00Z" },
    ],
    newProfiles: [
      { id: "new1", displayName: "Útulok", status: "SUBMITTED", statusLabel: "Čaká na kontrolu", createdAt: "2026-11-17T11:00:00Z" },
    ],
    eventSubmissions: [
      { id: "event1", title: "Výstava", status: "APPROVED", statusLabel: "Schválené", createdAt: "2026-11-11T11:00:00Z" },
      { id: "event2", title: "Preteky", status: "QUARANTINED", statusLabel: "Vyžaduje kontrolu", createdAt: "2026-11-18T11:00:00Z" },
    ],
    profileChanges: [
      { id: "change1", resourceName: "Psí hotel", status: "WITHDRAWN", statusLabel: "Zrušené", createdAt: "2026-11-16T11:00:00Z" },
    ],
  });
  assert.deepEqual([summary.profiles, summary.events, summary.pendingRequests], [2, 2, 3]);
  assert.deepEqual(summary.recentRequests.map((item) => item.id), ["event2", "new1", "change1", "claim1"]);
  assert.equal(summary.recentRequests[0].category, "Podujatie");
  assert.equal(summary.recentRequests[3].statusLabel, "Čaká na schválenie");
  assert.equal(summary.recentRequests[2].pending, false);
});

test("Partner dashboard handles an account without any claims or managed records", () => {
  const result = buildPartnerDashboardSummary({
    resources: [], claims: [], newProfiles: [], eventSubmissions: [], profileChanges: [],
  });
  assert.deepEqual(result, { profiles: 0, events: 0, pendingRequests: 0, recentRequests: [] });
});

test("Partner dashboard counts moderation statuses but never closed requests", () => {
  const statuses = ["SUBMITTED", "PENDING_REVIEW", "QUARANTINED", "APPROVED", "REJECTED", "WITHDRAWN"];
  const result = buildPartnerDashboardSummary({
    resources: [],
    claims: [],
    newProfiles: statuses.map((status, index) => ({
      id: String(index), displayName: status, status, statusLabel: status, createdAt: `2026-11-18T00:00:0${index}Z`,
    })),
    eventSubmissions: [],
    profileChanges: [],
  });
  assert.equal(result.pendingRequests, 3);
  assert.equal(result.recentRequests.length, 4);
});

test("Partner dashboard uses existing authenticated, account-scoped data and real destinations", async () => {
  const home = await read("app/partner/page.tsx");
  const shell = await read("components/partner-shell.tsx");
  const navigation = await read("components/partner-workspace-navigation.tsx");
  const css = await read("app/partner/partner.css");
  assert.match(home, /requirePartnerPageIdentity\(\)/);
  assert.match(home, /listPartnerResources\(identity\.accountId\)/);
  for (const loader of [
    "listPartnerClaims", "listPartnerNewProfiles", "listPartnerEventSubmissions", "listPartnerProfileChanges",
  ]) assert.ok(home.includes(`${loader}(identity.accountId)`), `Loader is not account-scoped: ${loader}`);
  assert.match(home, /buildPartnerDashboardSummary/);
  assert.match(home, /summary\.pendingRequests/);
  assert.match(home, /summary\.recentRequests/);
  // The single welcome action group links directly to canonical draft routes.
  for (const route of ["adresar", "podujatie", "adopcia"]) {
    const href = '/partner/koncepty/novy/' + route;
    assert.equal(home.split('href="' + href + '"').length - 1, 1, href);
  }
  assert.doesNotMatch(home, /Čo chcete urobiť\?|partner-dashboard-quick-actions/);
  assert.match(home, /\/partner\/ziadosti/);
  assert.match(home, /\/partner\/prevziat/);
  assert.match(shell, /<PartnerWorkspaceNavigation \/>/);
  assert.match(navigation, /\/partner\/prevziat/);
  assert.match(home, /resourceEditHref\(item\)/);
  assert.match(home, /resources\.slice\(0, 6\)/);
  assert.match(home, /rel="noopener noreferrer"/);
  assert.match(navigation, /aria-label="Partner navigácia"/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.partner-dashboard-record-grid/);
  assert.match(css, /\.partner-dashboard-stat:focus-visible/);
  assert.doesNotMatch(home, /href=["']#["']|disabled.*Adopcia/);
});
