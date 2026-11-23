import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Notion audit page includes one shared read-only sync overview", async () => {
  const page = await readFile(new URL("../app/admin/nastroje/notion-audit/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/admin-notion-sync-overview.tsx", import.meta.url), "utf8");
  assert.match(page, /<AdminNotionWorkspace initialTab="issues" \/>/);
  assert.match(component, /<AdminNotionDataQualityAudit \/>/);
  assert.match(component, /onClick=\{\(\) => void refresh\(\)\}/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(component, /Toto nie je živý stav synchronizátora/);
  assert.doesNotMatch(component, /runNotion|\bPOST\s*\(|\bPATCH\s*\(|method:\s*["\x27](POST|PATCH)["\x27]/);
});

test("admin overview labels combined run evidence without fabricating per-agenda success", async () => {
  const route = await readFile(new URL("../app/api/admin/notion-sync-overview/route.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/admin-notion-sync-overview.tsx", import.meta.url), "utf8");
  assert.match(route, /readNotionRunReceipts\(db\)/);
  assert.match(route, /EXISTING_ADMIN_AUTOMATION_EVENTS/);
  assert.match(component, /runForArea/);
  assert.match(component, /zdieľajú jednu hodinovú úlohu/);
  assert.match(component, /Záznam behu nie je dostupný/);
  assert.match(component, /runLabels\[run\.status\]/);
  assert.match(component, /Konflikty \/ chyby v behu/);
  assert.doesNotMatch(component, /method: ["'](?:POST|PATCH)["']/);
});

test("read-only production preflight is shown without exposing config values or creating work", async () => {
  const endpoint = await readFile(new URL("../app/api/admin/notion-sync-overview/route.ts", import.meta.url), "utf8");
  const view = await readFile(new URL("../components/admin-notion-sync-overview.tsx", import.meta.url), "utf8");
  assert.match(endpoint, /notionSyncConfigurationPreflight/);
  assert.match(view, /read-only prednasadzovacia kontrola/);
  assert.match(view, /snapshot\.preflight\.map/);
  assert.match(view, /Neprezrádza tokeny/);
  assert.doesNotMatch(view, /NOTION_API_TOKEN|method:\s*["'](?:POST|PATCH)["']/);
});

test("existing Notion audit panel displays all areas and qualified D1 pending indicators", async () => {
  const view = await readFile(new URL("../components/admin-notion-sync-overview.tsx", import.meta.url), "utf8");
  const overview = await readFile(new URL("../lib/notion-sync-overview.ts", import.meta.url), "utf8");
  const preflight = await readFile(new URL("../lib/notion-sync-preflight.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/nastroje/notion-audit/page.tsx", import.meta.url), "utf8");
  for (const [key, label, table] of [
    ["breeds", "Plemená", "breed_notion_sync"],
    ["articles", "Články", "article_notion_sync"],
    ["eshops", "E-shopy", "eshop_notion_sync"],
  ]) {
    assert.ok(overview.includes('key: "' + key + '"'));
    assert.ok(overview.includes('label: "' + label + '"'));
    assert.ok(overview.includes('table: "' + table + '"'));
    assert.ok(preflight.includes('key:"' + key + '"'));
  }
  assert.match(page, /<AdminNotionWorkspace initialTab="issues" \/>/);
  assert.match(view, /Zmeny bez potvrdenia/);
  assert.match(view, /pendingLabel\(row\)/);
  assert.match(view, /Nula neznamená úplnú zhodu/);
  assert.match(view, /zdieľajú jednu hodinovú úlohu/);
  assert.match(view, /Záznam behu nie je dostupný/);
  assert.match(view, /Toto nie je živý stav synchronizátora/);
  assert.doesNotMatch(view, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
  assert.doesNotMatch(overview, /notionRequest\(|fetch\(|\.run\(/);
});

test("Notion settings and audit resolve to the same four-tab workspace", async () => {
  const [settings, audit, ui] = await Promise.all([
    "../app/admin/nastavenia/notion/page.tsx",
    "../app/admin/nastroje/notion-audit/page.tsx",
    "../components/admin-notion-sync-overview.tsx",
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(settings, /<AdminNotionWorkspace initialTab="fields" \/>/);
  assert.match(audit, /<AdminNotionWorkspace initialTab="issues" \/>/);
  for (const label of ["Stav synchronizácie", "Chyby a konflikty", "Nastavenia polí", "Manuálny prenos"]) {
    assert.ok(ui.includes(label), label);
  }
  assert.match(ui, /role="tablist"/);
  assert.match(ui, /aria-selected=\{tab===item\.value\}/);
  assert.match(ui, /<AdminNotionFieldSettings \/>/);
  assert.match(ui, /<AdminNotionManualTransfer \/>/);
  assert.match(ui, /<AdminNotionDataQualityAudit \/>/);
});

test("Notion UI distinguishes D1, pending, review, exhausted retries and unknown evidence", async () => {
  const [ui, settings, overview] = await Promise.all([
    "../components/admin-notion-sync-overview.tsx",
    "../components/admin-notion-field-settings.tsx",
    "../lib/notion-sync-overview.ts",
  ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(ui, /Uložené v D1 ≠ doručené do Notionu/);
  assert.match(ui, /Synchronizované = len potvrdený konkrétny prenos/);
  assert.match(ui, /Čaká na Notion/);
  assert.match(ui, /Konflikt – vyžaduje kontrolu/);
  assert.match(ui, /Trvalé zlyhanie – vyžaduje zásah/);
  assert.match(ui, /Neznámy stav neznamená nula chýb/);
  assert.match(ui, /helpEditors\[item\.agenda\] \+ item\.entityId/);
  assert.match(ui, /<AdminNotionDataQualityAudit \/>/);
  assert.match(overview, /FROM notion_help_admin_writeback_outbox/);
  assert.match(overview, /LIMIT 51/);
  assert.doesNotMatch(overview, /SELECT [^"\n]*fields_json FROM notion_help_admin_writeback_outbox/);
  assert.match(settings, /Výnimka: uprednostniť Notion/);
  assert.match(settings, /Výnimka: uprednostniť Admin/);
  assert.match(settings, /useState<Mode>\("latest"\)/);
  assert.match(settings, /Review locks/);
});
