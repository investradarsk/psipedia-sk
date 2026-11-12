import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("profile introduction uses its own photographic-free Konva canvas",()=>{
  const canvas=read("components/facebook-profile-intro-canvas.tsx");
  assert.match(canvas,/PREDSTAVUJEME PROFIL/);
  assert.match(canvas,/LOGO PROFILU/);
  assert.match(canvas,/Profil nájdeš na/);
  assert.match(canvas,/Psipedia.sk/);
  assert.match(canvas,/W=1080,H=1350/);
  assert.match(canvas,/if\(!logo\)throw Error\("Najprv nahraj logo profilu."\)/);
  assert.doesNotMatch(canvas,/fotografia psa|dog photo/i);
});

test("sixth template preserves five existing photo templates",()=>{
  const editor=read("components/admin-facebook-graphic-editor.tsx");
  for(const template of ["gradient","panel","editorial","clean","split","profile"])
    assert.match(editor,new RegExp('id:"'+template+'"'));
  assert.match(editor,/selectedTemplate==="profile"/);
  assert.match(editor,/FacebookProfileIntroCanvas/);
  assert.match(editor,/initialProfileLogoUrl/);
  assert.match(editor,/selectedTemplate==="profile"\?!profileLogoBitmap:!bitmap/);
});

test("picker supplies separate logo, never substitutes the cover photo",()=>{
  const api=read("app/api/admin/facebook-images/profile-picker/route.ts");
  const parent=read("components/admin-facebook-images.tsx");
  assert.match(api,/function directoryLogoUrl/);
  assert.match(api,/logo=await copyFacebookProfileImage\(logoSource\)/);
  assert.match(api,/image, imageWarning, logo, logoWarning/);
  assert.match(parent,/initialProfileCategory=\{selectedProfile\?\.category\}/);
  assert.match(parent,/initialProfileLogoUrl=\{selectedProfile\?\.logoUrl\}/);
  assert.match(parent,/setSelectedProfile\(null\)/);
});
