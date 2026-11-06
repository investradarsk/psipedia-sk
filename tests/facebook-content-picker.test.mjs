import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
  assert.match(graphic, /fetch\(localUrl\.pathname \+ localUrl\.search/);
  assert.match(graphic, /setPhoto\(new File/);
  assert.match(editor, /Uložiť koncept/);
});

test("Selecting an article also stages its own photo for the Facebook graphic editor", () => {
  const picker = read("components/admin-facebook-images.tsx");
  const graphic = read("components/admin-facebook-graphic-editor.tsx");
  const api = read("app/api/admin/facebook-images/article-picker/route.ts");

  // The authenticated API normally copies the article hero to FB media.
  assert.match(api, /copyArticlePhoto\(article, null\)/);
  // For an older image with a missing/stale R2 key, the visible same-origin
  // article photo gets copied through the same authenticated upload flow.
  assert.match(picker, /if\(!selectedImage\?\.imageKey&&item\.imageUrl\)/);
  assert.match(picker, /source\.origin===window\.location\.origin/);
  assert.match(picker, /mime==="image\/avif"/);
  assert.match(picker, /uploadAdminImage\(file,"facebook-images"\)/);
  assert.match(picker, /"facebook-images"\)/);
  assert.match(picker, /imageUrl:selectedImage\?\.imageUrl\|\|""/);
  assert.match(picker, /imageKey:selectedImage\?\.imageKey\|\|""/);
  assert.match(picker, /initialPhotoUrl=\{form\.imageUrl\}/);
  // The editor must actually load the selected local photo, not silently
  // return to the empty green template because of an overly narrow URL guard.
  assert.match(graphic, /new URL\(photoUrl, window\.location\.origin\)/);
  assert.match(graphic, /fetch\(localUrl\.pathname \+ localUrl\.search/);
  assert.match(graphic, /setPhoto\(new File\(\[blob\]/);
  assert.match(graphic, /throw Error\("Fotografia musí byť dostupná/);
  // Selecting content never grants publication consent.
  assert.doesNotMatch(picker.slice(picker.indexOf("async function selectContent("),
    picker.indexOf("const queryKey=", picker.indexOf("async function selectContent("))),
    /save\("scheduled"\)|setApproval\(/);
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

test("All Facebook picker lists include durable manual already-posted markers", () => {
  const articles = read("app/api/admin/facebook-images/article-picker/route.ts");
  const profiles = read("app/api/admin/facebook-images/profile-picker/route.ts");
  for (const route of [articles, profiles]) {
    assert.match(route, /readFacebookShareMarkers/);
    assert.match(route, /sharedToFacebook: markers\.marked\.has/);
    assert.match(route, /markingAvailable: markers\.available/);
  }
  assert.match(profiles, /facebookShareMarkerType\(scope\.group, scope\.category\)/);
});

test("Facebook shared checkboxes remain separate from content selection and do not auto publish", () => {
  const ui = read("components/admin-facebook-images.tsx");
  assert.match(ui, /<div key=\{item\.id\} className=\{styles\.pickerResultRow\}>/);
  assert.match(ui, /type="checkbox" checked=\{Boolean\(item\.sharedToFacebook\)\}/);
  assert.match(ui, /onChange=\{e=>void markAlreadyShared\(item,e\.target\.checked\)\}/);
  assert.match(ui, /\/api\/admin\/facebook-images\/content-share-marker/);
  assert.match(ui, /setPickerItems\(old=>old\.map\(row=>row\.id===item\.id\?\{\.\.\.row,sharedToFacebook\}:row\)\)/);
  assert.doesNotMatch(read("app/api/admin/facebook-images/content-share-marker/route.ts"), /saveFacebookImagePost|facebookImagePublish|publishToFacebook|directPublishConsent/);
});

test("Manual FB ledger is scoped, authenticated and independent of Notion", () => {
  const route = read("app/api/admin/facebook-images/content-share-marker/route.ts");
  const storage = read("lib/facebook-content-share-marker.ts");
  const migration = read("drizzle/0154_facebook_content_share_markers.sql");
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /setFacebookShareMarker\(type, Number\(body\.entityId\), body\.sharedToFacebook, auth\.user\.email\)/);
  assert.match(storage, /if \(group === "article"\) return "article"/);
  assert.match(storage, /if \(group === "breeds"\) return "breeds"/);
  assert.match(storage, /if \(category === "utulky"\) return "organization"/);
  assert.match(storage, /if \(category === "adopcia"\) return "adoption"/);
  assert.match(storage, /return "lost_found"/);
  assert.match(migration, /PRIMARY KEY\(content_type, entity_id\)/);
  assert.match(storage, /DELETE FROM facebook_content_share_markers/);
  assert.match(storage, /ON CONFLICT\(content_type,entity_id\) DO UPDATE/);
  assert.match(storage, /no such table:/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS facebook_content_share_markers/);
  assert.doesNotMatch(route+storage, /notion/i);
});

test("Manual Facebook ledger migration accepts same-id records across different sources", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(read("drizzle/0154_facebook_content_share_markers.sql"));
    db.prepare("INSERT INTO facebook_content_share_markers(content_type,entity_id,marked_at,marked_by) VALUES(?,?,?,?)")
      .run("article",7,"2026-11-03T12:00:00Z","admin@example.test");
    db.prepare("INSERT INTO facebook_content_share_markers(content_type,entity_id,marked_at,marked_by) VALUES(?,?,?,?)")
      .run("breeds",7,"2026-11-03T12:01:00Z","admin@example.test");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM facebook_content_share_markers").get().total,2);
    db.prepare("DELETE FROM facebook_content_share_markers WHERE content_type=? AND entity_id=?").run("article",7);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM facebook_content_share_markers").get().total,1);
  } finally { db.close(); }
});

