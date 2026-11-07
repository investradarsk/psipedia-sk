import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const nav = read("components/admin-shared-editor-navigation.tsx");
const navCss = read("components/admin-shared-editor-navigation.module.css");
const sectionCss = read("components/admin-interaction-system.module.css");
const workspaceCss = read("components/admin-editor-workspace.module.css");
const footer = read("components/admin-editor-footer.tsx");
const footerCss = read("components/admin-editor-footer.module.css");
const e2e = read("tests/e2e/admin-ux-unification.spec.ts");
const adoptionE2e = read("tests/e2e/adoption.spec.ts");
const lostFoundE2e = read("tests/e2e/lost-found-dogs.spec.ts");
const organizationE2e = read("tests/e2e/admin-organization-publication.spec.ts");

test("EDITOR-17: shared switch navigation is labeled, hydrate-safe and focuses revealed panels", () => {
  assert.match(nav, /useSyncExternalStore/);
  assert.match(nav, /const readyOnServer = \(\) => false/);
  assert.match(nav, /const navigationReady = ready && hydrated/);
  assert.match(nav, /data-admin-editor-nav-ready=\{navigationReady \? "true" : "false"\}/);
  assert.match(nav, /disabled=\{!navigationReady\}/);
  assert.match(nav, /aria-label=\{ariaLabel\}/);
  assert.match(nav, /aria-controls=\{item\.id\}/);
  assert.match(nav, /aria-controls=\{mode === "switch" \? currentId : undefined\}/);
  assert.match(nav, /<label className=\{styles\.mobile\} htmlFor=\{selectId\}>/);
  assert.match(nav, /<select id=\{selectId\} aria-label="Sekcia editora"/);
  assert.match(nav, /if \(mode !== "switch"\) return/);
  assert.match(nav, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(nav, /target\.matches\("\[data-admin-editor-section\]"\)/);
  assert.match(nav, /target\.hidden/);
  assert.match(nav, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(nav, /target\.scrollIntoView\(\{/);
  assert.match(nav, /prefers-reduced-motion: reduce/);
  // Scroll mode must retain usable native anchors in the absence of JavaScript.
  assert.match(nav, /<a key=\{item\.id\} href=\{\`#\$\{encodeURIComponent\(item\.id\)\}\`\}/);
});

test("EDITOR-17: 320px navigation, section focus, motion and shared action bar are safe", () => {
  assert.match(navCss, /min-height: 44px/);
  assert.match(navCss, /:focus-visible/);
  assert.match(navCss, /@media \(max-width: 380px\)/);
  assert.match(navCss, /font-size: 16px/);
  assert.match(navCss, /overflow-wrap: anywhere/);
  assert.match(navCss, /prefers-reduced-motion: reduce/);
  assert.match(sectionCss, /\.editorSection:focus-visible/);
  assert.match(sectionCss, /outline: 3px solid var\(--admin-v3-focus/);
  assert.match(workspaceCss, /\.pageWorkspace\[data-editor-section-mode="switch"\][^]*:focus-visible/);
  assert.match(workspaceCss, /@media \(max-width: 380px\)/);
  assert.match(footerCss, /env\(safe-area-inset-bottom\)/);
  assert.match(footerCss, /min-height: 44px/);
  assert.match(footerCss, /max-width: 100%/);
  assert.match(footerCss, /overflow-wrap: anywhere/);
  assert.match(footer, /aria-busy=\{pending\}/);
  assert.match(footer, /role="status" aria-live="polite"/);
});

test("EDITOR-17: article opts into single-section navigation while other canonical editors remain unchanged", () => {
  const article = read("components/admin-article-editor.tsx");
  assert.match(article, /sectionMode="switch"/);
  assert.match(article, /articleLayout/);
  const workspace = ["components/admin-breed-editor.tsx", "components/admin-event-editor.tsx"];
  const standalone = [
    "components/admin-directory-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-adoption-editor.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-organization-editor.tsx",
  ];
  for (const file of workspace) {
    const src = read(file);
    assert.match(src, /<EditorWorkspace/, file);
    assert.match(src, /sectionMode="switch"/, file);
  }
  for (const file of standalone) {
    const src = read(file);
    assert.match(src, /<AdminSharedEditorNavigation/, file);
    assert.match(src, /mode="switch"/, file);
    assert.match(src, /AdminEditorSectionVisibility.Provider/, file);
  }
});

test("EDITOR-17: existing browser tests check focus, no data loss and small screens", () => {
  assert.match(e2e, /#\$\{target\}\`\)\)\.toBeFocused\(\)/);
  assert.match(e2e, /await expect\(field\)\.toHaveValue\(value\)/);
  assert.match(e2e, /await noOverflow\(page\)/);
  assert.match(e2e, /await accessible\(page\)/);
  assert.doesNotMatch(e2e, /a\[href\$="#\$\{target\}"\]/);
  for (const src of [adoptionE2e, lostFoundE2e, organizationE2e]) {
    assert.match(src, /toBeFocused\(\)/);
    assert.match(src, /1440, 390, 320/);
  }
  assert.doesNotMatch(nav, /fetch\(|DATABASE_URL|notion\.pages|localStorage/);
});


test("EDITOR-STEP2: all seven profile families share cards, pager and actions without overriding article layout", () => {
  const css = read("app/admin/admin-unified-forms.css");
  assert.match(css, /EDITOR-STEP2: canonical profile-editor appearance/);
  assert.match(css, /:not\(\[data-editor-layout="article"\]\)/);
  assert.match(css, /\[data-admin-editor-section\] > \.admin-form-card/);
  assert.match(css, /\[data-admin-editor-pager\]/);
  assert.match(css, /\[data-admin-lost-found-editor\]\[data-admin-form-system="v4"\]/);
  assert.match(css, /:not\(\[type="file"\]\)/);
  for (const path of [
    "components/admin-breed-editor.tsx",
    "components/admin-directory-editor.tsx",
    "components/admin-event-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-adoption-editor.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-organization-editor.tsx",
  ]) {
    const source = read(path);
    assert.equal((source.match(/data-admin-editor-pager/g) ?? []).length, 1, path);
    assert.match(source, /AdminEditorSection|EditorWorkspace/, path);
  }
  const article = read("components/admin-article-editor.tsx");
  assert.doesNotMatch(article, /data-admin-editor-pager/);
  assert.match(article, /articleLayout/);
  const eventCss = read("components/admin-event-editor.module.css");
  assert.match(eventCss, /\.publishButton[\s\S]*?background: var\(--admin-v3-green/);
});


test("EDITOR-STEP3: seven profile pagers focus the revealed mounted section; Help gates SSR typing", () => {
  const pager = read("components/admin-profile-editor-section-pager.ts");
  assert.match(pager, /useProfileEditorSectionPager/);
  assert.match(pager, /requestedFocusRef/);
  assert.match(pager, /panel\.hidden/);
  assert.match(pager, /panel\.focus\(\{ preventScroll: true \}\)/);
  assert.match(pager, /prefers-reduced-motion: reduce/);
  assert.match(pager, /useProfileEditorHydrated/);
  assert.match(pager, /useSyncExternalStore/);
  for (const file of [
    "components/admin-breed-editor.tsx",
    "components/admin-directory-editor.tsx",
    "components/admin-event-editor.tsx",
    "components/admin-help-editor.tsx",
    "components/admin-adoption-editor.tsx",
    "components/admin-lost-found-editor.tsx",
    "components/admin-organization-editor.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /useProfileEditorSectionPager\(/, file);
  }
  const help = read("components/admin-help-editor.tsx");
  assert.match(help, /data-hydrated=\{hydrated \? "true" : "false"\}/);
  assert.match(help, /<fieldset className="admin-profile-hydration-gate" disabled=\{!hydrated\}>/);
  const css = read("app/admin/admin-unified-forms.css");
  assert.match(css, /form\[data-admin-help-editor\] > fieldset\.admin-profile-hydration-gate/);
  const browserTest = read("tests/e2e/admin-ux-unification.spec.ts");
  assert.match(browserTest, /form\[data-admin-help-editor\]/);
  assert.match(browserTest, /getByRole\("button", \{ name: "Ďalšia" \}\)/);
  assert.match(browserTest, /await expect\(page\.locator\("#help-place"\)\)\.toBeFocused\(\)/);
  assert.match(browserTest, /await expect\(title\)\.toHaveValue\("Pomoc psom – skúšobná výzva"\)/);
});


test("EDITOR-STEP4: save acknowledgements never erase later edits or ongoing uploads", () => {
  const guard = read("components/admin-unsaved-form-links.tsx");
  assert.match(guard, /const editRevisionRef=useRef\(0\)/);
  assert.match(guard, /editRevisionRef\.current\+=1/);
  assert.match(guard, /if\(editRevisionRef\.current!==submittedRevision\)return false/);
  assert.match(guard, /markSavedIfUnchanged,getRevision/);

  const breed = read("components/admin-breed-editor.tsx");
  assert.match(breed, /formEditRevisionRef\.current \+= 1/);
  assert.match(breed, /if \(formEditRevisionRef\.current === submittedRevision\) setDirty\(false\)/);
  assert.match(breed, /inert=\{saving\}/);
  assert.match(breed, /uploadPending\.current/);
  assert.match(breed, /savePendingRef\.current/);

  const directory = read("components/admin-directory-editor.tsx");
  assert.match(directory, /if \(saving \|\| uploading \|\| galleryBusy \|\| savePendingRef\.current \|\| notionReadOnly\) return/);
  assert.match(directory, /if \(!file \|\| saving \|\| uploading \|\| savePendingRef\.current\) return/);
  assert.match(directory, /const hasNewerEdits = formEditRevisionRef\.current !== submittedRevision/);
  assert.match(directory, /if \(!hasNewerEdits\) \{\s*setGalleryUrls/);
  assert.match(directory, /if \(formEditRevisionRef\.current === submittedRevision\) setBreederRelationsDirty\(false\)/);
  assert.match(directory, /inert=\{saving\}/);

  const help = read("components/admin-help-editor.tsx");
  const adoption = read("components/admin-adoption-editor.tsx");
  for (const source of [help, adoption]) {
    assert.match(source, /const submittedRevision = navigation\.getRevision\(\)/);
    assert.match(source, /navigation\.markSavedIfUnchanged\(submittedRevision\)/);
    assert.match(source, /inert=\{saving\}/);
  }

  const lostFound = read("components/admin-lost-found-editor.tsx");
  assert.match(lostFound, /const submittedRevision = navigation\.getRevision\(\)/);
  assert.match(lostFound, /const hasNewerEdits = navigation\.getRevision\(\) !== submittedRevision/);
  assert.match(lostFound, /if \(!hasNewerEdits\) setState/);
  assert.match(lostFound, /duplicateOfId: current\.duplicateOfId/);
  assert.match(lostFound, /duplicateReason: current\.duplicateReason/);
  assert.match(lostFound, /if \(pendingProfileChanges\) \{/);
  assert.match(lostFound, /mutationPendingRef\.current=true/);
  assert.match(lostFound, /inert=\{saving\}/);

  // These two editors already use immutable submitted JSON snapshots, so late
  // changes remain dirty and must not be replaced by a server response.
  const event = read("components/admin-event-editor.tsx");
  const organization = read("components/admin-organization-editor.tsx");
  assert.match(event, /setSavedSnapshot\(editorSnapshot\)/);
  assert.match(organization, /const submittedSnapshot = JSON\.stringify\(draft\)/);
  assert.match(organization, /JSON\.stringify\(current\) === submittedSnapshot \? persistedDraft : current/);
  const lostFoundE2e = read("tests/e2e/lost-found-dogs.spec.ts");
  assert.match(lostFoundE2e, /duplicate action refuses to discard unrelated unsaved fields/);
  assert.match(lostFoundE2e, /Najprv ulož ostatné úpravy hlásenia/);
});


test("EDITOR-STEP5: mobile fields avoid iOS zoom, touch targets meet 44px and section scrolling clears sticky controls", () => {
  const unified = read("app/admin/admin-unified-forms.css");
  assert.match(unified, /EDITOR-STEP5: iOS Safari/);
  assert.match(unified, /@media \(max-width: 820px\)/);
  assert.match(unified, /font-size: 16px/);
  assert.match(unified, /\[data-admin-lost-found-editor\]/);
  assert.match(unified, /:not\(\[type="file"\]\)/);

  const sharedNavigation = read("components/admin-shared-editor-navigation.module.css");
  assert.match(sharedNavigation, /\.mobile select \{[^}]*font-size: 16px/s);
  assert.match(nav, /target\.scrollIntoView\(\{/);

  const sharedWorkspace = read("components/admin-editor-workspace.tsx");
  assert.match(sharedWorkspace, /AdminSharedEditorNavigation already focuses and reveals this panel/);
  assert.match(sharedWorkspace, /Do not launch a second smooth scroll/);
  assert.match(nav, /target\.scrollIntoView\(\{/);
  assert.match(nav, /prefers-reduced-motion: reduce/);
  const workspace = read("components/admin-editor-workspace.module.css");
  assert.match(workspace, /Account for both the admin top bar and the sticky section selector/);
  assert.match(workspace, /scroll-margin-top: calc\(var\(--admin-sticky-stack, 96px\) \+ 84px\)/);

  const breeds = read("components/admin-breed-editor.module.css");
  assert.match(breeds, /\.sportActions :global\(button\) \{ min-height: 44px/);
  const lostFound = read("components/admin-lost-found.module.css");
  assert.match(lostFound, /\.actions button,\s*\.actions a \{\s*min-height: 44px/);
  const browser = read("tests/e2e/admin-ux-unification.spec.ts");
  assert.match(browser, /mobile editor controls avoid input zoom and preserve keyboard flow/);
  assert.match(browser, /getComputedStyle\(element\)\.fontSize/);
});
