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
  assert.doesNotMatch(component, /runNotion|POST|PATCH/);
});
