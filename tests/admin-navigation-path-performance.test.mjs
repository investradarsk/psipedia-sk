import assert from "node:assert/strict";
import test from "node:test";
import {
  findActiveAdminNavigationItem,
  getAdminBreadcrumbs,
} from "../lib/admin-navigation.ts";

test("admin section matching preserves exact, nested and alias routes", () => {
  const cases = [
    ["/admin", "/admin"],
    ["/admin/plemena/12", "/admin/plemena"],
    ["/admin/adresar/12", "/admin/adresar"],
    ["/admin/sluzby-pre-psov", "/admin/adresar"],
    ["/admin/sluzby-pre-psov/katalog", "/admin/sluzby-pre-psov/katalog"],
    ["/admin/podania", "/admin/podania"],
    ["/admin/dopyty", "/admin/podania"],
    ["/admin/steniatka/pokrytie", "/admin/clanky"],
    ["/admin/podujatia/3", "/admin/podujatia"],
    ["/admin/facebook-obrazky", "/admin/facebook-obrazky"],
    ["/admin/kvalita/seo", "/admin/kvalita/seo"],
    ["/admin/pomoc/12", "/admin/pomoc-psom"],
    ["/admin/operations/automation", "/admin/automatizacie-gemini"],
    ["/admin/operations/geo", "/admin/mapy"],
    ["/admin/nastavenia/notion", "/admin/nastavenia"],
  ];

  for (const [path, expectedHref] of cases) {
    assert.equal(findActiveAdminNavigationItem(path)?.href, expectedHref, path);
  }
  assert.equal(findActiveAdminNavigationItem("/neexistujuca"), null);
});

test("breadcrumb links remain stable across navigation details", () => {
  const breadcrumbs = getAdminBreadcrumbs("/admin/plemena/12");
  assert.deepEqual(breadcrumbs.map(item => item.href), [
    "/admin", "/admin/plemena", "/admin/plemena/12",
  ]);
  assert.equal(breadcrumbs.at(-1)?.current, true);
});
