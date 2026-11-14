import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin merge reconciliation preserves upstream traffic analytics and compact settings", () => {
  const page = read("app/admin/nastavenia/page.tsx");
  assert.match(page, /data-admin-content-module="application-settings"/);
  assert.match(page, /data-admin-settings-statistics/);
  assert.match(page, /href="\/admin\/nastavenia\/statistiky"/);
  assert.match(page, /href="\/admin\/nastavenia\/notion"/);
  assert.match(page, /<AdminPwaSettings/);
  assert.equal(existsSync(new URL("../app/admin/nastavenia/statistiky/page.tsx", import.meta.url)), true);
  const navigation = read("lib/admin-navigation.ts");
  assert.match(navigation, /href: "\/admin\/nastavenia\/statistiky"/);
});

test("admin merge reconciliation does not resurrect organization registration number", () => {
  const source = read("components/admin-organization-editor.tsx");
  assert.match(source, /data-admin-content-module="organizations-editor"/);
  assert.doesNotMatch(source, /id="organization-registration"/);
  assert.match(source, /Stav publikovania/);
  assert.match(source, /Základné údaje organizácie/);
});

test("closed Knip audit tooling remains available in the main admin PR", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["audit:knip"], "npm exec --yes --package=knip@6.45.1 -- knip --no-exit-code");
  assert.ok(pkg.scripts["audit:knip:report"].includes("reports/knip/findings.json"));
  assert.ok(pkg.scripts["audit:knip:report"].includes("reports/knip/findings.md"));
  assert.ok(existsSync(new URL("../knip.json", import.meta.url)));
  assert.ok(existsSync(new URL("../.github/workflows/knip-audit.yml", import.meta.url)));
  assert.ok(read(".gitignore").includes("/reports/knip/"));
  assert.ok(existsSync(new URL("../docs/audits/knip-step1.md", import.meta.url)));
});
