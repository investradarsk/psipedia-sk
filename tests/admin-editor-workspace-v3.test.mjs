import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("workspace composes canonical admin primitives without another modal implementation", () => {
  const source = read("components/admin-editor-workspace.tsx");
  assert.match(source, /AdminModalDialog/);
  assert.match(source, /AdminActionButton/);
  assert.match(source, /AdminEditorSection as EditorSection/);
  for (const name of ["EditorWorkspace","EditorHeader","EditorSectionNavigation","EditorContent","EditorPreview","EditorActionBar","EditorStatus","EditorUnsavedChangesGuard"])
    assert.match(source, new RegExp("export function " + name));
  assert.doesNotMatch(source, /fetch\s*\(|DATABASE_URL|notion\.pages|db\.prepare|publishArticle/i);
});
test("caller owns save and publish while dirty close remains guarded", () => {
  const source = read("components/admin-editor-workspace.tsx");
  assert.match(source, /actions\?: ReactNode/);
  assert.match(source, /dirty\?: boolean/);
  assert.match(source, /beforeunload/);
  assert.match(source, /Neuložené zmeny/);
  assert.match(source, /Zahodiť zmeny a zavrieť/);
  assert.match(source, /type="button"/);
  assert.match(source, /querySelectorAll<HTMLElement>/);
});
test("responsive CSS supports desktop preview, mobile section switch and visible actions", () => {
  const css = read("components/admin-editor-workspace.module.css");
  assert.match(css, /dialog\.workspaceModal\[open\]/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.1fr\) minmax\(0, 0\.9fr\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /data-mobile-panel="preview"/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /:focus-visible/);
});
test("fixture stays development-only and requires confirmation before local publish", () => {
  const demo = read("components/admin-editor-workspace-demo.tsx");
  const route = read("app/admin/editor-workspace-preview/page.tsx");
  assert.match(route, /process\.env\.NODE_ENV !== "development"/);
  assert.match(route, /notFound\(\)/);
  assert.doesNotMatch(demo, /fetch\s*\(|\/api\/|indexedDB|localStorage/i);
  assert.match(demo, /setPublishConfirm\(true\)/);
  assert.match(demo, /Potvrdiť lokálne publikovanie/);
  assert.match(demo, /setSaved\(\{ \.\.\.draft \}\)/);
  assert.match(demo, /disabled=\{!hydrated\}/);
  assert.match(demo, /data-demo-hydrated=\{hydrated/);
});

test("ADMIN V3 content editors reuse workspace without copying canonical data forms", () => {
  const article = read("components/admin-article-editor.tsx");
  const breed = read("components/admin-breed-editor.tsx");
  for (const source of [article, breed]) {
    assert.match(source, /<EditorWorkspace/);
    assert.match(source, /<EditorActionBar/);
    assert.match(source, /<EditorStatus/);
    assert.match(source, /mode="page"/);
    assert.match(source, /dirty={dirty}/);
    assert.match(source, /onClose=/);
    assert.doesNotMatch(source, /AdminStickyEditorNavigation/);
  }
  for (const section of ["article-basics", "article-publish", "article-seo", "article-settings", "article-authors", "article-media", "article-content", "article-blocks", "article-relations"])
    assert.match(article, new RegExp('id="' + section + '"[^>]*data-admin-editor-section'));
  for (const section of ["breed-basic", "breed-overview", "breed-character", "breed-practical", "breed-health", "breed-sports", "breed-relations", "breed-media"])
    assert.match(breed, new RegExp('AdminEditorSection id="' + section + '"'));
  assert.match(article, /<AdminArticleBlockEditor/);
  assert.match(article, /<RichTextInput/);
  assert.match(article, /<ArticleEditorCalendar/);
  assert.match(article, /<AdminEditorialAuthorField/);
  assert.match(article, /preservedEditorArticleMetadata/);
  assert.match(breed, /<AdminSeoFields/);
  assert.match(breed, /fciStandard/);
  assert.match(breed, /relatedArticleIds/);
  assert.match(breed, /<AdminDrawer/);
});
test("ADMIN V3 content save and exit actions preserve publication and dirty state", () => {
  const article = read("components/admin-article-editor.tsx");
  const breed = read("components/admin-breed-editor.tsx");
  assert.match(article, /form="article-canonical-editor-form"/);
  assert.match(article, /type="submit"/);
  assert.match(article, /onSubmit=\{\(event\) => \{ event.preventDefault\(\); void save\(displayedStatus\); \}\}/);
  assert.match(article, /setEditorDirty\(false\)/);
  assert.match(article, /backToEditor\?\.click\(\)/);
  assert.match(breed, /form="breed-canonical-editor-form"/);
  assert.equal((breed.match(/Nastavenia, FCI a SEO/g) ?? []).length, 1, "settings drawer has only one trigger");
  assert.match(breed, /save\(form.status==="published"\?"published":"draft"\)/);
  assert.match(breed, /setCanonicalForm\(\(current\)=>\(\{\.\.\.current,status:data.breed!\.status\}\)\)/);
  assert.match(breed, /setExpectedUpdatedAt\(data.breed.updatedAt\)/);
  assert.match(breed, /setDirty\(false\)/);
  const articleCss = read("components/admin-content-editor-v3.module.css");
  const breedCss = read("components/admin-breed-editor.module.css");
  for (const css of [articleCss, breedCss]) {
    assert.match(css, /max-width: 420px/);
    assert.match(css, /max-width: 360px/);
    assert.match(css, /min-width: 0/);
  }
});

test("ADMIN V3 article hidden file inputs cannot escape their labels", () => {
  const css = read("components/admin-content-editor-v3.module.css");
  assert.match(css, /label\.admin-upload-button > input\[type="file"\]/);
  assert.match(css, /max-width:\s*1px/);
  assert.match(css, /max-height:\s*1px/);
  assert.match(css, /min-height:\s*0/);
  assert.match(css, /clip-path:\s*inset\(50%\)/);
});
