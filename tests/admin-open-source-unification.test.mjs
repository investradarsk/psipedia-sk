import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {appendLexicalPlainText,appendLexicalPlainTextToMarkdown} from "../lib/editorial-lexical-append.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("safe plain-text drafts append without converting canonical persisted data",()=>{
  assert.equal(appendLexicalPlainText("Starý opis",""),"Starý opis");
  assert.equal(appendLexicalPlainText("Starý opis\n"," Nový text "),"Starý opis\n\nNový text");
  assert.equal(appendLexicalPlainText("Pôvodný","**nerozbíjať Markdown**"),"Pôvodný\n\n**nerozbíjať Markdown**");
  assert.equal(appendLexicalPlainTextToMarkdown("## Pôvodné","Ďalší text"),"## Pôvodné\n\nĎalší text");
});

test("one Radix/Lexical draft control is reused by canonical profile editors",()=>{
  const shared=read("components/admin-lexical-append-button.tsx");
  assert.match(shared,/AdminLexicalDraftDialog/);
  assert.match(shared,/ssr:false/);
  const paths=[
    "components/admin-event-markdown-editor.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-organization-editor.tsx",
    "components/admin-directory-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-breed-editor.tsx",
  ];
  for(const path of paths){
    const source=read(path);
    assert.match(source,/AdminLexicalAppendButton/,path);
    assert.match(source,/onAppend=/,path);
  }
  assert.match(read("components/admin-event-markdown-editor.tsx"),/appendLexicalPlainTextToMarkdown/);
  for(const p of paths.slice(1))assert.match(read(p),/appendLexicalPlainText/,p);
});

test("canonical URL-only galleries and structured galleries share one Dropzone",()=>{
  const dropzone=read("components/admin-gallery-dropzone.tsx");
  assert.match(dropzone,/useDropzone/);
  assert.match(dropzone,/image\/jpeg/);
  assert.match(dropzone,/disabled:disabled\|\|busy/);
  for(const p of ["components/admin-photo-gallery.tsx","components/admin-breed-editor.tsx","components/admin-article-block-editor.tsx"]){
    assert.match(read(p),/AdminGalleryDropzone/,p);
  }
  assert.match(read("components/admin-breed-editor.tsx"),/if \(!Array\.isArray\(event\)\) event\.target\.value = ""/);
});

test("structured photo galleries support dnd-kit without altering alt/caption/credit",()=>{
  const sorter=read("components/admin-sortable-gallery.tsx");
  assert.match(sorter,/DndContext/);
  assert.match(sorter,/KeyboardSensor/);
  assert.match(sorter,/activationConstraint:\{distance:6\}/);
  const breed=read("components/admin-breed-editor.tsx");
  const article=read("components/admin-article-block-editor.tsx");
  for(const source of [breed,article]){
    assert.match(source,/AdminSortableGallery/);
    assert.match(source,/arrayMove/);
    assert.match(source,/alt/);
    assert.match(source,/caption/);
    assert.match(source,/credit/);
    assert.match(source,/Odstrániť/);
  }
  assert.match(breed,/gallery:arrayMove\(current\.gallery,from,to\)/);
  assert.match(article,/images:arrayMove\(item\.images,from,to\)/);
});
