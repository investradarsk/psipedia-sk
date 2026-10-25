import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Notion audit page includes one shared read-only sync overview", async () => {
  const page = await readFile(new URL("../app/admin/nastroje/notion-audit/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/admin-notion-sync-overview.tsx", import.meta.url), "utf8");
  assert.match(page, /<AdminNotionSyncOverview \/>/);
  assert.match(page, /<AdminNotionDataQualityAudit \/>/);
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
