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
    "components/admin-adoption-editor-profile.tsx",
  ];
  for(const path of paths){
    const source=read(path);
    assert.match(source,/AdminLexicalAppendButton/,path);
    assert.match(source,/onAppend=/,path);
  }
  assert.match(read("components/admin-event-markdown-editor.tsx"),/appendLexicalPlainTextToMarkdown/);
  for(const p of paths.slice(1))assert.match(read(p),/appendLexicalPlainText/,p);
  const adoption=read("components/admin-adoption-editor-profile.tsx");
  assert.match(adoption,/name="description"/);
  assert.match(adoption,/value=\{description\}/);
  assert.match(adoption,/setDescription\(current=>appendLexicalPlainText\(current,text\)\)/);
  assert.doesNotMatch(adoption,/id="adoption-description"[^>]*defaultValue=/);
});

test("canonical URL-only galleries use Uppy while structured galleries retain the original Dropzone",()=>{
  const dropzone=read("components/admin-gallery-dropzone.tsx");
  assert.match(dropzone,/useDropzone/);
  assert.match(dropzone,/image\/jpeg/);
  assert.match(dropzone,/disabled:disabled\|\|busy/);
  // The URL-only profile gallery now uses Uppy Dashboard as the new shared
  // uploader while the breed and structured editorial galleries retain Dropzone.
  assert.match(read("components/admin-photo-gallery.tsx"),/AdminUppyGalleryUpload/);
  assert.match(read("components/admin-uppy-gallery-upload.tsx"),/uploadAdminImage/);
  for(const p of ["components/admin-breed-editor.tsx","components/admin-article-block-editor.tsx"]){
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

test("shared Dropzone meets axe: file input labeled and not nested in interactive root",()=>{
  const source=read("components/admin-gallery-dropzone.tsx");
  assert.match(source,/noClick:true/);
  assert.match(source,/noKeyboard:true/);
  assert.match(source,/getInputProps\(\{"aria-label":label/);
  assert.match(source,/onKeyDown:event=>/);
  assert.match(source,/event\.key==="Enter"\|\|event\.key===" "/);
  const rootEnd=source.indexOf("</div>");
  const fileInput=source.indexOf("<input {...getInputProps");
  assert.ok(rootEnd > -1 && fileInput > rootEnd,"file input must be a sibling of role=button");
});

test("sortable IDs do not change on reordering a unique image URL",()=>{
  const photo=read("components/admin-photo-gallery.tsx");
  assert.match(photo,/<AdminSortableGallery/);
  assert.match(photo,/containerAs="ol"/);
  assert.match(photo,/as="li"/);
  assert.match(photo,/onReorder=\{\(from,to\)=>onChange\(arrayMove\(value,from,to\)\)\}/);
  assert.match(read("components/admin-sortable-gallery.tsx"),/gallerySortableIds\(urls\)/);
  assert.doesNotMatch(read("components/admin-sortable-gallery.tsx"),/index\+":"\+url/);
});

test("all unpublish editors share accessible destructive confirmation instead of browser window.confirm",()=>{
  const shared=read("components/admin-interaction-system.tsx");
  assert.match(shared,/export function AdminDestructiveConfirmDialog/);
  assert.match(shared,/cancelLabel = "Zrušiť"/);
  const article=read("components/admin-article-editor.tsx");
  const event=read("components/admin-event-editor.tsx");
  for(const s of [article,event]){
    assert.match(s,/<AdminDestructiveConfirmDialog/);
    assert.match(s,/confirmLabel="Potvrdiť stiahnutie"/);
    assert.match(s,/cancelLabel="Ponechať publikované"/);
    assert.match(s,/void save\("draft"\)/);
  }
  assert.doesNotMatch(article,/window\.confirm\("Stiahnuť tento článok/);
});

test("e-shop and puppy area reuse one safe content drafting and single-image picker",()=>{
  const eshop=read("components/admin-eshop-editor.tsx");
  const puppy=read("components/admin-puppy-area-editor.tsx");
  for(const src of [eshop,puppy]){
    assert.match(src,/AdminLexicalAppendButton/);
    assert.match(src,/appendLexicalPlainText/);
    assert.match(src,/AdminSingleImageUpload/);
    assert.match(src,/adminSelectedImage/);
  }
  assert.match(eshop,/uploadAdminImage\(file, "eshops"\)/);
  assert.match(puppy,/uploadAdminImage\(file, "articles"\)/);
  assert.match(puppy,/update\(index, \{ intro: appendLexicalPlainText/);
});

test("navigation and section edits use shared staged destructive dialogs",()=>{
  const navigation=read("components/admin-navigation-editor.tsx");
  const sections=read("components/admin-section-editor.tsx");
  for(const source of [navigation,sections]){
    assert.match(source,/AdminDestructiveConfirmDialog/);
    assert.doesNotMatch(source,/window\.confirm/);
  }
  assert.match(navigation,/pendingRemovalId/);
  assert.match(navigation,/confirmRemoveItem/);
  assert.match(navigation,/item\.parentId!==id/);
  assert.match(sections,/confirmRemoveSubpage/);
  assert.match(sections,/updateSections\(current=>current\.map/);
  assert.match(sections,/Uložiť sekcie/);
});
