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

test("Facebook profile picker uses canonical categories and published records only", () => {
  const route = read("app/api/admin/facebook-images/profile-picker/route.ts");
  assert.match(route, /allDirectoryCategories/);
  assert.match(route, /isDirectoryCategory\(category\)/);
  assert.match(route, /status='published' AND category=\?/);
  assert.match(route, /profile\.status !== "published"/);
  assert.match(route, /directoryProfileHref\(profile\)/);
  assert.match(route, /copyFacebookProfileImage/);
  assert.doesNotMatch(route, /saveFacebookImagePost\(/);
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
