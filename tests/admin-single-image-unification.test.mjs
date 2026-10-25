import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {adminSelectedImage} from "../lib/admin-selected-image.ts";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("shared image adapter accepts File and native event, and clears selection",()=>{
  const photo={name:"dog.webp",type:"image/webp"};
  assert.equal(adminSelectedImage(photo),photo);
  const event={target:{files:[photo],value:"selected"}};
  assert.equal(adminSelectedImage(event),photo);
  assert.equal(event.target.value,"");
  const empty={target:{files:[],value:"selected"}};
  assert.equal(adminSelectedImage(empty),null);
  assert.equal(empty.target.value,"");
});

test("single-image picker reuses accessible dropzone, no new API/storage",()=>{
  const single=read("components/admin-single-image-upload.tsx");
  const shared=read("components/admin-gallery-dropzone.tsx");
  assert.match(single,/AdminGalleryDropzone/);
  assert.match(single,/multiple=\{false\}/);
  assert.match(single,/onFiles=\{files=>/);
  assert.match(shared,/noClick:true/);
  assert.match(shared,/noKeyboard:true/);
  assert.match(shared,/input \{\.\.\.getInputProps\(\{"aria-label":label/);
  assert.match(shared,/multiple,/);
  assert.match(shared,/onKeyDown:event=>/);
  assert.doesNotMatch(single,/uploadAdminImage|\/api\/admin\/uploads/);
});

test("canonical owners use one single-image component while keeping their upload destinations",()=>{
  const owners=[
    ["components/admin-event-editor.tsx","events"],
    ["components/admin-help-editor.tsx","help"],
    ["components/admin-directory-editor.tsx","directory"],
    ["components/admin-organization-editor.tsx","help"],
    ["components/admin-lost-found-editor.tsx","lost-found"],
    ["components/admin-adoption-editor.tsx","help"],
    ["components/admin-article-editor.tsx","articles"],
    ["components/admin-breed-editor.tsx","breeds"],
  ];
  for(const [p,folder] of owners){
    const source=read(p);
    assert.match(source,/AdminSingleImageUpload/,p);
    assert.match(source,/adminSelectedImage\(/,p);
    assert.ok(source.includes('uploadAdminImage(file,"'+folder+'")') || source.includes('uploadAdminImage(file, "'+folder+'")') || source.includes('uploadAdminImage(file, "'+folder+'")'),p+" unchanged R2 folder");
  }
  const adopt=read("components/admin-adoption-editor-details.tsx");
  assert.match(adopt,/AdminSingleImageUpload/);
  assert.match(adopt,/onUpload: \(event: File \| ChangeEvent<HTMLInputElement>\)/);
  const article=read("components/admin-article-editor.tsx");
  assert.match(article,/onFile=\{uploadOgImage\}/);
  assert.match(article,/onFile=\{uploadImage\}/);
});
