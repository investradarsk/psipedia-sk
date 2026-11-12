import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read = path => readFileSync(new URL("../"+path, import.meta.url),"utf8");
test("profile-intro graphic remains photo-free",()=>{
  const canvas=read("components/facebook-profile-intro-canvas.tsx");
  assert.match(canvas,/PREDSTAVUJEME PROFIL/);
  assert.match(canvas,/LOGO PROFILU/);
  assert.doesNotMatch(canvas,/dog photo|fotografia psa/i);
});
