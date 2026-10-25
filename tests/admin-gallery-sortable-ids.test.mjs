import assert from "node:assert/strict";
import test from "node:test";
import {gallerySortableIds} from "../lib/admin-gallery-sortable-ids.ts";
test("drag sortable ids remain stable across a reorder",()=>{
  const urls=["/media/one.webp","/media/two.webp","/media/three.webp"];
  const ids=gallerySortableIds(urls);
  const reordered=gallerySortableIds([urls[2],urls[0],urls[1]]);
  assert.deepEqual(reordered,[ids[2],ids[0],ids[1]]);
  assert.equal(new Set(ids).size,urls.length);
});
test("duplicate legacy URLs remain independently addressable",()=>{
  const urls=["/a.webp","/b.webp","/a.webp","/a.webp"];
  const ids=gallerySortableIds(urls);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(ids[0].endsWith(":0"),true);
  assert.equal(ids[2].endsWith(":1"),true);
  assert.equal(ids[3].endsWith(":2"),true);
});
