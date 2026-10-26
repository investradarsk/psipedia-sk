import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {appendLexicalPlainTextToMarkdown} from "../lib/editorial-lexical-append.ts";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Lexical plain text appends without rewriting existing Markdown",()=>{
  assert.equal(appendLexicalPlainTextToMarkdown("## Pôvodný opis\n\n**Tučný text**", ""), "## Pôvodný opis\n\n**Tučný text**");
  assert.equal(appendLexicalPlainTextToMarkdown("## Pôvodný opis\n", "Nový text"),
    "## Pôvodný opis\n\nNový text");
  assert.equal(appendLexicalPlainTextToMarkdown("Bez úpravy", "# Nadpis *nie zvýraznenie*"),
    "Bez úpravy\n\n\\# Nadpis \\*nie zvýraznenie\\*");
  assert.equal(appendLexicalPlainTextToMarkdown("", "  Prvý text  "), "Prvý text");
  assert.equal(appendLexicalPlainTextToMarkdown("Text", " \n "), "Text");
});
test("Radix and Lexical must remain opt-in and must not replace canonical article format",()=>{
  const event=read("components/admin-event-markdown-editor.tsx"), draft=read("components/admin-lexical-draft-dialog.tsx");
  const shared=read("components/admin-lexical-append-button.tsx");
  assert.ok(event.includes('from "@/components/admin-lexical-append-button"'));
  assert.ok(shared.includes('import("@/components/admin-lexical-draft-dialog")'));
  assert.ok(event.includes("appendLexicalPlainTextToMarkdown(value, plainText)"));
  assert.ok(event.includes('<textarea disabled={!hydrated}'));
  for(const val of ['from "@radix-ui/react-dialog"','from "@lexical/react/LexicalComposer"','from "@lexical/react/LexicalPlainTextPlugin"','from "@lexical/react/LexicalOnChangePlugin"'])assert.ok(draft.includes(val));
  assert.ok(draft.includes("Pridať do popisu"));
});
test("dnd-kit stays in the shared gallery sorter with arrow and remove accessibility controls",()=>{
  const gallery=read("components/admin-photo-gallery.tsx");
  const sorter=read("components/admin-sortable-gallery.tsx");
  for(const val of ['from "@dnd-kit/core"','from "@dnd-kit/sortable"','from "@dnd-kit/utilities"','<DndContext','<SortableContext','ref={setActivatorNodeRef}','gallerySortableIds(urls)','KeyboardSensor'])assert.ok(sorter.includes(val),val);
  for(const val of ['<AdminSortableGallery','as="li"','containerAs="ol"','onReorder={(from,to)=>onChange(arrayMove(value,from,to))}','Posunúť fotografiu','Odstrániť fotografiu'])assert.ok(gallery.includes(val),val);
  assert.doesNotMatch(gallery, /<DndContext|useSortable|gallerySortableIds/);
});
test("all ten approved packages are direct pinned production dependencies",()=>{
  const p=JSON.parse(read("package.json")),l=JSON.parse(read("package-lock.json"));
  const actual=["@radix-ui/react-dialog","@tanstack/react-table","@tanstack/react-virtual","react-dropzone","@dnd-kit/core","zod","react-hook-form","fuse.js","lucide-react","lexical"];
  for(const name of actual){
    assert.equal(p.dependencies[name],l.packages[""].dependencies[name],name);
    assert.equal(l.packages["node_modules/"+name]?.version,p.dependencies[name],name);
    assert.ok(l.packages["node_modules/"+name]?.integrity?.startsWith("sha512-"),name);
  }
});
