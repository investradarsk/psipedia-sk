import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Use the real production key extractor. This is intentionally independent of
// production R2/D1 and verifies that ambiguous metadata never becomes a delete.
const source=readFileSync(fileURLToPath(new URL("../lib/admin-record-lifecycle.ts",import.meta.url)),"utf8");
const start=source.indexOf("function mediaKeys(");
const end=source.indexOf("\n/** Exhaustive schema-driven reference check;",start);
assert.ok(start>=0&&end>start);
const code=ts.transpileModule(source.slice(start,end)+"\nexports.mediaKeys=mediaKeys;",{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const exported={};
runInNewContext(code,{exports:exported},{timeout:1200});
const extract=row=>Array.from(exported.mediaKeys(row));

test("canonical explicit image keys can be considered for post-delete reference checks",()=>{
  const row={
    image_key:"directory/2026/11111111-1111-4111-8111-111111111111.webp",
    og_image_key:"articles/og/22222222-2222-4222-8222-222222222222.jpg",
    gallery_json:JSON.stringify([{imageKey:"gallery/2026/a.webp"}]),
    blocks_json:JSON.stringify([{type:"image",imageKey:"articles/2026/c.webp"}]),
  };
  assert.deepEqual(extract(row),[
    row.image_key,row.og_image_key,"gallery/2026/a.webp","articles/2026/c.webp",
  ]);
});

test("arbitrary JSON key values never authorize R2 deletion",()=>{
  const row={
    gallery_json:JSON.stringify([{key:"directory/2026/not-owned.webp",alt:"Test"}]),
    blocks_json:JSON.stringify([{type:"relation",key:"shared/other-profile.webp"},
      {type:"article-link",payload:{key:"assets/shared.webp"}}]),
  };
  assert.deepEqual(extract(row),[]);
});

test("malformed, URL-backed and path-traversal entries never become R2 delete keys",()=>{
  const row={
    image_key:"https://example.com/photo.webp",
    og_image_key:"../shared/image.jpg",
    main_image_key:"assets/photo.webp?version=2",
    gallery_json:JSON.stringify([{imageKey:"../../other-user.png"},
      {imageKey:"https://example.org/c.jpg"},
      {mainImageKey:"./../../other"}]),
  };
  assert.deepEqual(extract(row),[]);
});

test("unknown JSON metadata keys do not suppress legitimate nested imageKey values",()=>{
  const row={
    blocks_json:JSON.stringify([{key:"foreign/photo.jpg",
      data:{imageKey:"images/2026/our-image.webp"}}]),
  };
  assert.deepEqual(extract(row),["images/2026/our-image.webp"]);
});
