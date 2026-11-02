import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared Help table exposes canonical adoption and lost-dog name quick edits", () => {
  const page = read("app/admin/pomoc-psom/page.tsx");
  const ui = read("components/admin-help-unified-table.tsx");
  assert.match(page, /inlineDog: \{ name: item\.name, editable: item\.status !== "ARCHIVED", kind: "adopcia" \}/);
  assert.match(page, /kind: "stratene-a-najdene"/);
  assert.match(page, /item\.duplicateOfId === null/);
  assert.match(ui, /const canInlineEditDogs = category === "adopcia" \|\| category === "stratene-a-najdene"/);
  assert.match(ui, /<AdminInlineRowActions/);
  assert.match(ui, /"\/api\/admin\/adoptions\/"/);
  assert.match(ui, /"\/api\/admin\/lost-found\/"/);
  assert.match(ui, /action: "set-inline-name"/);
  assert.match(ui, /action: "set-inline-dog-name"/);
  assert.match(ui, /expectedUpdatedAt: draft\.updatedAt/);
  assert.match(ui, /router\.refresh\(\)/);
  assert.doesNotMatch(ui, /method: "DELETE"/);
});

test("shared Help dog edits cannot change moderation, adoption status or source data", () => {
  const adoption = read("app/api/admin/adoptions/[id]/route.ts");
  const lost = read("app/api/admin/lost-found/[id]/route.ts");
  assert.match(adoption, /Object\.keys\(body\)\.length !== 3/);
  assert.match(adoption, /updateAdoptionInlineName/);
  assert.match(lost, /Object\.keys\(input\)\.length !== 3/);
  assert.match(lost, /updateAdminDogReportInlineName/);
  assert.match(read("lib/adoption-store.ts"), /AND status <> 'ARCHIVED' RETURNING id/);
  assert.match(read("lib/lost-found-dog-store.ts"), /AND duplicate_of_id IS NULL RETURNING id/);
});
