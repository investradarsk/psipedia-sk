import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared sortable preview uses accessible pointer and keyboard dnd-kit without persistence", () => {
  const source = read("components/admin-sortable-order-preview.tsx");
  assert.match(source, /DndContext/);
  assert.match(source, /SortableContext/);
  assert.match(source, /useSortable/);
  assert.match(source, /useSensor\(PointerSensor/);
  assert.match(source, /useSensor\(KeyboardSensor/);
  assert.match(source, /sortableKeyboardCoordinates/);
  assert.match(source, /activationConstraint: \{ distance: 8 \}/);
  assert.match(source, /aria-label=/);
  assert.match(source, /onReorder\(from, to\)/);
  assert.match(source, /disabled=\{disabled \|\| index === 0\}/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|PUT|POST|DELETE/);
});

test("section editor drafts section and subpage card order until explicit existing save", () => {
  const source = read("components/admin-section-editor.tsx");
  assert.match(source, /function reorderSections\(from: number, to: number\)/);
  assert.match(source, /function reorderSubpages\(slug: string, from: number, to: number\)/);
  assert.match(source, /arrayMove\(current, from, to\)/);
  assert.match(source, /arrayMove\(section\.subpages, from, to\)/);
  assert.match(source, /position \}\)/);
  assert.match(source, /<AdminSortableOrderPreview/);
  assert.match(source, /onReorder=\{reorderSections\}/);
  assert.match(source, /onReorder=\{\(from, to\) => reorderSubpages/);
  assert.match(source, /fetch\("\/api\/admin\/sections"/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /disabled=\{saving \|\| !dirty\}/);
});

test("hero quick link cards retain full label, href and visibility when reordered", () => {
  const source = read("components/admin-section-visuals.tsx");
  assert.match(source, /function reorderQuickLinks\(from: number, to: number\)/);
  assert.match(source, /patchHeroConfig\(\{ quickLinks: arrayMove\(links, from, to\) \}\)/);
  assert.match(source, /onReorder=\{reorderQuickLinks\}/);
  assert.match(source, /title="Náhľad poradia rýchlych odkazov"/);
  assert.match(source, /Uložiť hlavičku/);
  assert.match(source, /fetch\("\/api\/admin\/sections"/);
  assert.match(source, /fetch\("\/api\/admin\/section-visuals"/);
  assert.doesNotMatch(read("components/admin-sortable-order-preview.tsx"), /section-visuals|section-store/);
});
