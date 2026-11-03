import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Facebook article picker uses publication status and authenticated requests", () => {
  const route = read("app/api/admin/facebook-images/article-picker/route.ts");
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /requireAdminMutation/);
  assert.match(route, /status:\s*"published"/);
  assert.match(route, /effectiveArticleStatus\(article\.status, article\.publishedAt\)/);
  assert.match(route, /articleHref\(article\)/);
  assert.match(route, /copyArticlePhoto/);
  assert.doesNotMatch(route, /saveFacebookImagePost\(/);
});

test("Facebook profile picker separates Services, Help and Events without legacy duplicate categories", () => {
  const route = read("app/api/admin/facebook-images/profile-picker/route.ts");
  assert.match(route, /directoryCategories\.map/);
  assert.doesNotMatch(route, /allDirectoryCategories\.map/);
  assert.match(route, /id: "directory", label: "Služby pre psov"/);
  assert.match(route, /id: "help", label: "Pomoc psom"/);
  assert.match(route, /id: "events", label: "Podujatia"/);
  assert.match(route, /category IN \('treneri', 'psie-skoly'\)/);
  assert.match(route, /"utulky"/);
  assert.match(route, /"adopcia"/);
  assert.match(route, /"stratene-psy"/);
  assert.match(route, /"najdene-psy"/);
  assert.match(route, /eventPortalCategory/);
  assert.match(route, /eventHref/);
  assert.match(route, /directoryProfileHref/);
  assert.match(route, /copyFacebookProfileImage/);
  assert.doesNotMatch(route, /saveFacebookImagePost\(/);
});

test("Facebook picker only reads publicly visible source records and revalidates on POST", () => {
  const route = read("app/api/admin/facebook-images/profile-picker/route.ts");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /status = 'published'/);
  assert.match(route, /status = 'PUBLISHED' AND published_at IS NOT NULL AND archived_at IS NULL/);
  assert.match(route, /status IN \('ACTIVE','RESERVED'\)/);
  assert.match(route, /status = 'ACTIVE' AND published_at IS NOT NULL AND duplicate_of_id IS NULL/);
  assert.match(route, /cancelled = 0/);
  assert.match(route, /COALESCE\(end_date,start_date\) >= \?/);
  assert.match(route, /AND id = \? LIMIT 1/);
  assert.match(route, /scopeFrom\(scopeParams\)/);
});

test("Editor supports hierarchical article/profile selection, link, photo and no auto publishing", () => {
  const editor = read("components/admin-facebook-images.tsx");
  const graphic = read("components/admin-facebook-graphic-editor.tsx");
  assert.match(editor, /setPickerKind\(pickerKind==="article"/);
  assert.match(editor, /setPickerKind\(pickerKind==="profile"/);
  assert.match(editor, /pickerGroups\.find\(group=>group\.id===pickerGroup\)/);
  assert.match(editor, /pickerCategory/);
  assert.match(editor, /Celý článok/);
  assert.match(editor, /Viac informácií/);
  assert.match(editor, /initialPhotoUrl=\{form\.imageUrl\}/);
  assert.match(graphic, /fetch\(initialPhotoUrl/);
  assert.match(graphic, /setPhoto\(new File/);
  assert.match(editor, /Uložiť koncept/);
});

test("Existing from-profile handoff reuses the media copy helper", () => {
  assert.match(read("app/api/admin/facebook-images/from-profile/route.ts"), /copyFacebookProfileImage/);
  assert.match(read("lib/facebook-profile-image.ts"), /facebook-images\//);
});

test("Graphic editor offers three brand styles, safe drag-and-drop and mobile controls", () => {
  const graphic = read("components/admin-facebook-graphic-editor.tsx");
  const styles = read("components/admin-facebook-graphic-editor.module.css");
  assert.match(graphic, /type LogoStyle = "pill" \| "wordmark" \| "mark"/);
  assert.match(graphic, /logoBounds/);
  assert.match(graphic, /setPointerCapture\(event\.pointerId\)/);
  assert.match(graphic, /onPointerDown=\{startLogoDrag\}/);
  assert.match(graphic, /onPointerMove=\{moveLogoDrag\}/);
  assert.match(graphic, /logoScale/);
  assert.match(graphic, /Vľavo hore/);
  assert.match(graphic, /Vpravo dole/);
  assert.match(styles, /touch-action:none/);
});

test("Category changes clear previous results and send the canonical group to the server", () => {
  const editor = read("components/admin-facebook-images.tsx");
  assert.match(editor, /params\.set\("group",pickerGroup\)/);
  assert.match(editor, /profileId:item\.id,group:pickerGroup,category:pickerCategory/);
  assert.match(editor, /setPickerGroup\(e\.target\.value\);setPickerCategory\(e\.target\.value==="breeds"\?"all":""\);setPickerItems\(\[\]\)/);
});

test("Breed picker offers all canonical published FCI winners and deep links", () => {
  const route = read("app/api/admin/facebook-images/profile-picker/route.ts");
  assert.match(route, /id: "breeds", label: "Plemená"/);
  assert.match(route, /"Všetky plemená"/);
  assert.match(route, /fciGroups\.map/);
  assert.match(route, /canonicalBreedIdsSql/);
  assert.match(route, /fci_group = \?/);
  assert.match(route, /breedProfileHref\(row\.slug\)/);
  assert.match(route, /ownedBreedImage\(profile\.image_url\)/);
  assert.match(route, /scope\.group === "breeds"/);
  const client = read("components/admin-facebook-images.tsx");
  assert.match(client, /pickerGroup==="breeds"\?"Skupina FCI":"Kategória"/);
});

test("Facebook photo copier supports local Psipedia breed images without public network fetches", () => {
  const helper = read("lib/facebook-profile-image.ts");
  assert.match(helper, /validPublicAsset/);
  assert.match(helper, /ASSETS\?:/);
  assert.match(helper, /bindings\.ASSETS\.fetch/);
  assert.match(helper, /bytes = data/);
  assert.match(helper, /MAX_BYTES/);
});
