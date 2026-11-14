import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 14: Gemini STOP, D1 queue and category scheduler handlers are preserved", () => {
  const page = read("app/admin/automatizacie-gemini/page.tsx");
  const editor = read("components/admin-gemini-automation-settings.tsx");
  const css = read("components/admin-gemini-automation.module.css");
  assert.match(page, /title="Automatizácie Gemini"/);
  assert.match(page, /<AdminGeminiAutomationSettings/);
  assert.match(editor, /data-admin-content-module="gemini-automation"/);
  assert.match(editor, /data-admin-gemini-global-stop/);
  assert.match(editor, /data-admin-automation-metrics/);
  assert.match(editor, /data-admin-automation-workspace/);
  assert.match(editor, /onClick=\{\(\) => void changeGlobalStop\(globalRunning\)\}/);
  assert.match(editor, /disabled=\{!available \|\| !liveControl \|\| controlPending\}/);
  assert.match(editor, /<AdminGeminiQuickSettings/);
  assert.match(editor, /<GeminiSettingsCard/);
  assert.match(editor, /<GeminiHistory/);
  assert.match(editor, /<GeminiQueue/);
  assert.match(editor, /<AdminGeminiNotionDrafts/);
  assert.match(css, /ADMIN VISUAL 14\/18/);
  assert.match(css, /\[data-admin-gemini-global-stop\]/);
});

test("step 14: Gemini concept table retains local scroll, actions and explicit import", () => {
  const src = read("components/admin-gemini-all-concepts.tsx");
  const css = read("components/admin-gemini-all-concepts.module.css");
  assert.match(src, /data-admin-content-module="gemini-concepts"/);
  assert.match(src, /role="search" aria-label="Filtre Gemini konceptov" data-admin-list-filters/);
  assert.match(src, /role="region" aria-label="Tabuľka Gemini konceptov" tabIndex=\{0\}/);
  assert.match(src, /data-admin-list-pagination/);
  assert.match(src, /onClick=\{\(\) => void importPending\(\)\}/);
  assert.match(src, /onClick=\{reload\}/);
  assert.match(src, /onClick=\{\(\) => void trashConcept\(\)\}/);
  assert.match(src, /role="dialog" aria-modal="true"/);
  assert.match(css, /ADMIN VISUAL 14\/18/);
  assert.match(css, /\.table tbody td:last-child\s*\{[^}]*position: sticky;/);
  assert.match(css, /\.tableScroll\s*\{[^}]*overscroll-behavior-inline: contain;/);
  assert.match(css, /min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 14: Gemini quick table and prompt editor inherit shared admin controls", () => {
  const quick = read("components/admin-gemini-quick-settings.tsx");
  const prompts = read("components/admin-gemini-category-prompt-editor.tsx");
  const quickCss = read("components/admin-gemini-quick-settings.module.css");
  const promptsCss = read("components/admin-gemini-category-prompt-editor.module.css");
  assert.match(quick, /<table className=\{styles\.table\}>/);
  assert.match(quick, /disabled=\{saving \|\| hasUnsavedCategory\}/);
  assert.match(prompts, /<form|onClick=|onSubmit=/);
  assert.match(quickCss, /ADMIN VISUAL 14\/18/);
  assert.match(promptsCss, /ADMIN VISUAL 14\/18/);
  assert.match(promptsCss, /\.categories \{ position: static; max-height: none; overflow: visible; \}/);
});

test("step 14: Facebook planner keeps existing month/week, sync and consent gates", () => {
  const page = read("app/admin/facebook-obrazky/page.tsx");
  const src = read("components/admin-facebook-images.tsx");
  const css = read("components/admin-facebook-images.module.css");
  assert.match(page, /title="Facebook obrázky"/);
  assert.match(page, /<FacebookContent promise=\{dataPromise\}/);
  assert.match(src, /data-admin-content-module="facebook-posts"/);
  assert.match(src, /data-admin-social-metrics/);
  assert.match(src, /data-admin-social-calendar/);
  assert.match(src, /data-admin-social-list/);
  assert.match(src, /data-admin-list-pagination/);
  assert.match(src, /<AdminFacebookWeeklyPlanner refresh=\{refresh\}/);
  assert.match(src, /onClick=\{\(\)\s*=>\s*setCalendarView\("week"\)\}/);
  assert.match(src, /onClick=\{\(\)\s*=>\s*setCalendarView\("month"\)\}/);
  assert.match(src, /onClick=\{\(\)\s*=>\s*void syncNotion\(\)\}/);
  assert.match(src, /onChange=\{e=>void setAutomatic\(e\.target\.checked\)\}/);
  assert.match(src, /onClick=\{\(\)\s*=>\s*void setApproval\(/);
  assert.match(src, /<AdminInlineRowActions/);
  assert.match(src, /<AdminModalDialog/);
  assert.match(css, /ADMIN VISUAL 14\/18/);
  assert.match(css, /\.listPanel \.itemActions button\s*\{[^}]*min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 14: Facebook graphic editor retains draggable canvas and save/export", () => {
  const graphic = read("components/admin-facebook-graphic-editor.tsx");
  const css = read("components/admin-facebook-graphic-editor.module.css");
  const weekly = read("components/admin-facebook-weekly-planner.module.css");
  assert.match(graphic, /data-admin-content-module="facebook-graphic-editor"/);
  assert.match(graphic, /data-admin-graphic-layout/);
  assert.match(graphic, /data-admin-graphic-controls/);
  assert.match(graphic, /data-admin-graphic-preview/);
  assert.match(graphic, /<FacebookKonvaCanvas/);
  assert.match(graphic, /<FacebookProfileIntroCanvas/);
  assert.match(graphic, /onClick=\{\(\) => void download\(\)\}/);
  assert.match(graphic, /onClick=\{\(\) => void applyGraphic\(\)\}/);
  assert.match(css, /ADMIN VISUAL 14\/18/);
  assert.match(css, /\.previewSide \{ min-width: 0; top: calc\(var\(--admin-sticky-stack, 96px\) \+ 12px\); \}/);
  assert.match(weekly, /ADMIN VISUAL 14\/18/);
  assert.match(weekly, /\.editorDays button\s*\{[\s\S]*?min-height: var\(--admin-ui-control-height, 44px\)/);
});

test("step 14: changes do not globally mask overflow or affect public UI", () => {
  for (const path of [
    "components/admin-gemini-automation.module.css",
    "components/admin-gemini-all-concepts.module.css",
    "components/admin-gemini-quick-settings.module.css",
    "components/admin-gemini-category-prompt-editor.module.css",
    "components/admin-facebook-images.module.css",
    "components/admin-facebook-graphic-editor.module.css",
    "components/admin-facebook-weekly-planner.module.css",
  ]) {
    const css = read(path);
    const additions = css.slice(css.indexOf("ADMIN VISUAL 14/18"));
    assert.ok(additions.length > 100, path);
    assert.doesNotMatch(additions, /overflow-x:\s*hidden/, path);
    assert.doesNotMatch(additions, /(?:html|body)\s*\{/, path);
  }
});
