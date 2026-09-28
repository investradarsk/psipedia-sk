import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared selection is bound to the current query/page view and preserves failed partial selections", () => {
  const source = read("components/admin-bulk-selection.tsx");
  assert.match(source, /const viewFingerprint = `\$\{membershipFingerprint\}\|page:\$\{pageIds\.join\(","\)\}`/);
  assert.match(source, /stored\.membershipFingerprint === viewFingerprint/);
  assert.match(source, /currentPageSomeSelected/);
  assert.match(source, /payload\.counts\.failed === 0\) clear\(\)/);
  assert.match(source, /Výber zostáva zachovaný na kontrolu/);
  assert.match(source, /if \(pending \|\| !preflight/);
});

test("directory, help and events keep selection visible to the current page/query", () => {
  const directory = read("components/admin-directory-dashboard.tsx");
  const help = read("components/admin-help-dashboard.tsx");
  const events = read("components/admin-event-dashboard.tsx");

  assert.match(directory, /supportsAllMatching: false/);
  assert.match(directory, /supportsAllMatching=\{false\}/);

  assert.doesNotMatch(help, /selectionMode/);
  assert.doesNotMatch(help, /mode: "filter"/);
  assert.match(help, /node\.indeterminate = pageSomeSelected/);
  assert.match(help, /viewFingerprint/);
  assert.match(help, /AdminBulkActionToolbar/);
  assert.match(help, /AdminModalDialog/);
  assert.doesNotMatch(help, /window\.confirm\([^\n]*Hromad/);

  assert.match(events, /node\.indeterminate = pageSomeSelected/);
  assert.match(events, /clearSelection\(\); setPage\(currentPage - 1\)/);
  assert.match(events, /clearSelection\(\); setPage\(currentPage \+ 1\)/);
});

test("central bulk endpoints require server auth, same origin and JSON before database mutation", () => {
  for (const path of [
    "app/api/admin/bulk/preflight/route.ts",
    "app/api/admin/bulk/execute/route.ts",
  ]) {
    const source = read(path);
    const auth = source.indexOf("const user = await getAdminApiUser()");
    const deny = source.indexOf("if (!user) return unauthorizedAdminResponse()");
    const origin = source.indexOf('request.headers.get("origin") !== new URL(request.url).origin');
    const database = source.indexOf("getBulkSelectionDatabase()");
    assert.ok(auth >= 0 && deny > auth && origin > deny && database > origin, path);
    assert.match(source, /content-type/);
  }
});

test("organization bulk reuses canonical lifecycle writes and returns explicit partial-success counts", () => {
  const route = read("app/api/admin/organizations/bulk/route.ts");
  const dashboard = read("components/admin-organization-publication-dashboard.tsx");

  assert.match(route, /MAX_BULK_ORGANIZATIONS = 500/);
  assert.match(route, /changeOrganizationPublicationFromAdmin/);
  assert.match(route, /request\.headers\.get\("origin"\) !== new URL\(request\.url\)\.origin/);
  assert.match(route, /updated: updated\.length/);
  assert.match(route, /failed: failed\.length/);
  assert.doesNotMatch(route, /error\.stack/);

  assert.match(dashboard, /AdminBulkActionToolbar/);
  assert.match(dashboard, /AdminModalDialog/);
  assert.match(dashboard, /indeterminate=\{bulkSelection\.currentPageSomeSelected\}/);
  assert.match(dashboard, /payload\.counts\.failed > 0/);
  assert.match(dashboard, /Výber zostal zachovaný na kontrolu/);
  assert.match(dashboard, /variant=\{bulkAction === "archive" \? "destructive" : "primary"\}/);
});

test("domains with richer lifecycle semantics do not get invented generic bulk endpoints", () => {
  const adoptionLifecycle = read("lib/adoption.ts");
  const lostFoundLifecycle = read("lib/lost-found-lifecycle.js");
  assert.match(adoptionLifecycle, /DRAFT.*ACTIVE.*RESERVED.*ADOPTED.*ARCHIVED/s);
  assert.match(lostFoundLifecycle, /DRAFT.*PENDING.*ACTIVE.*RESOLVED.*EXPIRED.*REJECTED.*ARCHIVED/s);
  assert.equal(existsSync(new URL("../app/api/admin/adoptions/bulk/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/admin/lost-found/bulk/route.ts", import.meta.url)), false);
});
