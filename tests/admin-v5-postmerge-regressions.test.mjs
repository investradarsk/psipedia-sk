import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V5 post-merge: desktop, mobile and breadcrumbs use guarded fresh Admin Overview navigation", () => {
  const nav = read("components/admin-navigation.tsx");
  const guard = read("components/admin-editor-navigation-guard.tsx");
  assert.match(nav, /dispatchAdminOverviewNavigation\(\(\) => window\.location\.assign\("\/admin"\)\)/);
  assert.match(nav, /onClick=\{item\.href === "\/admin" \? handleAdminOverviewLink : undefined\}/);
  assert.match(nav, /event\.preventDefault\(\);\s*dispatchAdminOverviewNavigation/);
  assert.doesNotMatch(nav, /router\.push\("\/admin"\)/);
  assert.match(guard, /window\.addEventListener\(ADMIN_NAVIGATION_INTENT_EVENT, onIntent\)/);
  assert.match(guard, /event\.preventDefault\(\);\s*requestNavigation\(detail\.navigate\)/);
});

test("V5 post-merge: Profiles does not duplicate Help or Events navigation", () => {
  const directory = read("app/admin/adresar/page.tsx");
  assert.doesNotMatch(directory, /<AdminDirectoryModuleNav/);
  assert.match(directory, /<AdminDirectoryCategoryNav filters=\{filters\}/);
  const registry = read("lib/admin-navigation.ts");
  assert.match(registry, /label: "Všetky profily", href: ADMIN_PROFILE_HOME/);
  assert.match(registry, /\{ label: "Profily", items:/);
  assert.match(directory, /<AdminProfileTypeTabs active="services"/);
  const help = read("app/admin/pomoc-psom/page.tsx");
  assert.match(help, /<AdminProfileTypeTabs active=\{active\}/);
  assert.doesNotMatch(read("components/admin-help-unified-table.tsx"), /aria-label="Typ pomoci"/);
  assert.match(registry, /label: "Podujatia", href: "\/admin\/podujatia"/);
});

test("V5 post-merge: Services V3 stays narrow on desktop without shrinking mobile controls", () => {
  const css = read("components/admin-service-catalog.module.css");
  assert.match(css, /@media \(min-width: 821px\)[\s\S]*?\.profileCard \{[^}]*max-width: 860px/);
  assert.match(css, /@media \(min-width: 821px\)[\s\S]*?\.profileRow select \{[^}]*min-height: 36px/);
  assert.match(css, /\.profileCard :global\(\[data-editor-actionbar\]\) button \{ min-height: 44px/);
  assert.match(css, /@media \(max-width: 820px\)/);
});

test("V5 post-merge: SEO audit identifies its D1 snapshot without claiming Google live verification", () => {
  const seo = read("app/admin/kvalita/seo/page.tsx");
  const store = read("lib/admin-seo-quality-store.ts");
  assert.match(seo, /Audit (?:D1 prepočítaný|prepočítaný z databázy):/);
  assert.match(seo, /nie o živé overenie indexácie v Google/);
  assert.match(store, /generatedAt: new Date\(\)\.toISOString\(\)/);
});

test("V5 post-merge: Notion audit reports a safe failing stage and stays read-only", () => {
  const route = read("app/api/admin/notion-data-quality-audit/route.ts");
  const ui = read("components/admin-notion-data-quality-audit.tsx");
  assert.match(route, /let stage: "SOURCE" \| "NOTION_QUERY" \| "D1_EVIDENCE" \| "TRIAGE"/);
  assert.match(route, /error: "NOTION_AUDIT_UNAVAILABLE",\s*stage,/);
  assert.match(route, /readOnly: true/);
  assert.doesNotMatch(route, /method: "PATCH"|\bINSERT INTO\b/);
  assert.match(ui, /data\.error === "NOTION_AUDIT_UNAVAILABLE"/);
  assert.match(ui, /Žiadne údaje sa nezmenili/);
});

test("V5 post-merge: invalid transfer mapping remains fail closed with understandable error", () => {
  const queue = read("lib/notion-manual-transfer-queue.ts");
  const transfer = read("components/admin-notion-manual-transfer.tsx");
  assert.match(queue, /throw new InvalidManualTransferMapping\(scope,row\.profile_id,"NOTION_PAGE_ID"\)/);
  const api = read("app/api/admin/notion-manual-transfer/route.ts");
  assert.match(api, /error instanceof InvalidManualTransferMapping/);
  assert.match(api, /profileId:error\.profileId/);
  assert.match(transfer, /TRANSFER_MAPPING_INVALID:"Našla sa neplatná väzba/);
  assert.match(transfer, /Oblasť: \$\{scope\}\$\{id\}/);
  assert.match(transfer, /TRANSFER_DUPLICATE_NOTION_PAGE:"Jedna Notion stránka/);
});
