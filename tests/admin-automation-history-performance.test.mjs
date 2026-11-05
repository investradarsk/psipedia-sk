import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("automation history authenticates and streams results inside a responsive shell", () => {
  const page = read("app/admin/operations/automaticke-udalosti/page.tsx");
  assert.match(page, /requireAdminPageUser/);
  assert.match(page, /import \{ Suspense \} from "react"/);
  assert.match(page, /async function AdminAutomationHistoryResults/);
  assert.match(page, /<Suspense fallback=/);
  assert.match(page, /<AdminAutomationHistoryResults userEmail=/);
  assert.match(page, /aria-busy="true"/);
  assert.ok(page.indexOf("<Suspense fallback=") > page.indexOf("Filtrovať"));
});

test("history uses bounded previews, keyset paging and keeps the full event detail", () => {
  const list = read("app/admin/operations/automaticke-udalosti/page.tsx");
  const detail = read("app/admin/operations/automaticke-udalosti/[id]/page.tsx");
  assert.match(list, /substr\(e\.body, 1, 601\) AS body/);
  assert.match(list, /event\.body\.slice\(0, 600\)/);
  assert.match(list, /e\.id < \?/);
  assert.match(list, /ORDER BY e\.id DESC LIMIT 41/);
  assert.match(list, /href=\{automationHistoryDetailHref\(event\.id\)\}/);
  assert.match(detail, /SELECT id, event_type, resource_type, resource_ref, actor_ref,[\s\S]*?title, body, created_at/);
  assert.match(detail, /ORDER BY id ASC LIMIT 20/);
});
