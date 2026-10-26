import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const breed = read("components/admin-breed-editor.tsx");
const article = read("components/admin-article-editor.tsx");
const quality = read("components/admin-data-quality-dashboard.tsx");
const facebook = read("components/admin-facebook-images.tsx");

test("breed and article gallery/cover thumbnails defer offscreen downloads and decode asynchronously", () => {
  for (const [source,expr] of [
    [breed, /<img src=\{form\.image\}[^>]*loading="lazy" decoding="async"/],
    [breed, /<img src=\{item\.imageUrl\}[^>]*loading="lazy" decoding="async"/],
    [article, /<img src=\{ogImageUrl\}[^>]*loading="lazy" decoding="async"/],
    [article, /<img src=\{imageUrl\}[^>]*loading="lazy" decoding="async"/],
  ]) assert.match(source,expr);
  // No change to gallery order or upload/storage semantics.
  assert.match(breed,/onReorder=\{\(from,to\)=>setForm/);
  assert.match(breed,/uploadAdminImage\(file, "breeds"\)/);
  assert.match(article,/uploadAdminImage\(file, "articles"\)/);
  assert.match(breed,/imageKey/);
  assert.match(article,/setImageEditorOpen/);
});

test("quality image-review list thumbnails are lazy, visible confirmation images retain immediate loading", () => {
  for (const n of ["activeImageKey","candidateImageKey"]) {
    assert.match(quality,new RegExp("src=\\{\\x60/media/\\$\\{monitor\\."+n+"\\}\\x60\\}[^>]*loading=\"lazy\" decoding=\"async\""));
  }
  assert.match(quality,/singleDecisionItem\.monitor\.candidateImageKey[\s\S]*?decoding="async"/);
  for (const n of ["activeImageKey","candidateImageKey"])
    assert.match(quality,new RegExp("detailItem\\.monitor\\."+n+"[\\s\\S]*?decoding=\"async\""));
  assert.match(quality,/confirmMediaDecision/);
  assert.match(quality,/setDecision\(null\)/);
});

test("Facebook thumbnail lists are lazy with stable intrinsic sizes and details remain available", () => {
  assert.match(facebook,/<img src=\{post\.imageUrl\} width=\{48\} height=\{48\} alt="" loading="lazy" decoding="async"/);
  assert.match(facebook,/<img src=\{post\.imageUrl\} alt="" width=\{72\} height=\{72\} loading="lazy" decoding="async"/);
  assert.match(facebook,/className=\{styles\.preview\} src=\{form\.imageUrl\}[^>]*decoding="async"/);
  assert.match(facebook,/uploadAdminImage\(file,"facebook-images"\)/);
  assert.match(facebook,/\/api\/admin\/notion-facebook-images-sync/);
});

test("Facebook SSR calendar/list does not duplicate its initial read but still refreshes and remains abortable", () => {
  const page = read("app/admin/facebook-obrazky/page.tsx");
  assert.match(page,/listFacebookImagePosts\(month,"all"\)/);
  assert.match(facebook,/const initialQueryHandled=useRef\(false\)/);
  assert.match(facebook,/if\(!initialQueryHandled\.current\)\{initialQueryHandled\.current=true;return;\}/);
  assert.match(facebook,/fetch\(\x60\/api\/admin\/facebook-images\?month=\$\{month\}&status=\$\{status\}&source=\$\{source\}&page=\$\{page\}\x60/);
  assert.match(facebook,/const abort=new AbortController\(\)/);
  assert.match(facebook,/return\(\)=>abort\.abort\(\)/);
  assert.match(facebook,/setRefresh\(value=>value\+1\)/);
  assert.match(facebook,/12000/);
});
