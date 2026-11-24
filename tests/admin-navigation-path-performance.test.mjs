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
    ["/admin/kvalita/seo", "/admin/kvalita"],
    ["/admin/pomoc/12", "/admin/adresar"],
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


test("V6-06 quality subroutes share one sidebar owner with exact breadcrumbs", () => {
  for (const [path, label] of [["/admin/kvalita/prehlad", "Chýbajúce polia"], ["/admin/kvalita/seo", "SEO audit"], ["/admin/kontrola-odkazov", "Kontrola odkazov"]]) {
    assert.equal(findActiveAdminNavigationItem(path)?.href, "/admin/kvalita");
    assert.deepEqual(getAdminBreadcrumbs(path).at(-1), { href: path, label, current: true });
  }
  assert.equal(findActiveAdminNavigationItem("/admin/mapy")?.href, "/admin/mapy");
});


test("V6-07 canonical profile and quality breadcrumbs preserve one active owner", () => {
  for (const [path, label] of [
    ["/admin/adopcie/", "Adopcie"],
    ["/admin/stratene-najdene", "Stratené a nájdené psy"],
    ["/admin/organizacie", "Organizácie a útulky"],
    ["/admin/pomoc", "Ostatná pomoc"],
  ]) {
    assert.equal(findActiveAdminNavigationItem(path)?.href, "/admin/adresar");
    const crumbs = getAdminBreadcrumbs(path);
    assert.equal(crumbs.at(-1)?.label, label);
    assert.equal(crumbs.at(-1)?.current, true);
  }
  const detail = getAdminBreadcrumbs("/admin/adopcie/42");
  assert.deepEqual(detail.map(item => item.href), ["/admin", "/admin/adresar", "/admin/adopcie", "/admin/adopcie/42"]);
  assert.equal(findActiveAdminNavigationItem("/admin/kontrola-odkazov")?.href, "/admin/kvalita");
  assert.equal(findActiveAdminNavigationItem("/admin/kvalita/seo")?.href, "/admin/kvalita");
});
