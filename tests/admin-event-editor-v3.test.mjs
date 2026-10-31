import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const editor = read("components/admin-event-editor.tsx");
const shell = read("components/admin-editor-workspace.tsx");
const eventPage = read("app/admin/podujatia/[id]/page.tsx");
const css = read("components/admin-event-editor.module.css");
const markdownBridge = read("components/admin-event-markdown-editor.tsx");
const markdownAdapter = read("lib/event-lexical-markdown.ts");

test("events V3 integrates the existing canonical editor, not a new form engine", () => {
  assert.match(editor, /<EditorWorkspace[\s\S]*mode="page"/);
  assert.match(editor, /<EditorStatus/);
  assert.match(editor, /<EditorActionBar/);
  assert.match(editor, /<EditorSection/);
  assert.match(editor, /preview=\{liveSummary\}/);
  assert.match(editor, /<form id="event-editor-v3-form" noValidate/);
  assert.equal((editor.match(/<EditorSection id=/g) ?? []).length, 6);
  assert.equal((editor.match(/<\/EditorSection>/g) ?? []).length, 6);
  assert.equal((editor.match(/<AdminAutomationUpdateSuggestions\b/g) ?? []).length, 1, "automation suggestions render once");
  for (const id of ["event-basics", "event-schedule", "event-location", "event-details", "event-media", "event-seo"]) {
    assert.match(editor, new RegExp('id="' + id + '"'));
  }
});

test("action bar keeps one guarded back navigation and full meaning of buttons", () => {
  assert.match(editor, /closeLabel="Späť na podujatia"/);
  assert.match(editor, /onClose=\{\(\) => router\.push\("\/admin\/podujatia"\)\}/);
  assert.match(shell, /closeLabel\?: string/);
  assert.match(shell, /if \(dirty\) setConfirmClose\(true\)/);
  assert.match(eventPage, /<AdminReviewCheckbox/);
  assert.match(eventPage, /<AdminCanonicalDraftWarning/);
  assert.match(eventPage, /<AdminCanonicalDraftDelete/);
  assert.match(eventPage, /eventHref\(event\)/);
  assert.doesNotMatch(eventPage, /<Link href="\/admin\/podujatia">← Späť na podujatia/);
  assert.match(editor, /status === "draft" \? <AdminActionButton type="submit" form="event-editor-v3-form"/);
  assert.match(editor, /onSubmit=\{\(submitEvent\)[\s\S]*save\(status\)/);
  assert.match(editor, /onClick=\{\(\) => setConfirmUnpublish\(true\)\}/);
  assert.match(editor, /onConfirm=\{\(\) => \{ setConfirmUnpublish\(false\); void save\("draft"\); \}\}/);
  for (const label of ["Uložiť koncept", "Publikovať podujatie", "Uložiť zmeny", "Stiahnuť z kalendára"]) {
    assert.ok(editor.includes(label), label);
  }
});

test("event payload, markdown, maps, SEO, uploads and media behavior remain canonical", () => {
  assert.match(editor, /function save\(nextStatus: EventStatus\)/);
  assert.match(editor, /method: event \? "PUT" : "POST"/);
  assert.match(editor, /\/api\/admin\/events/);
  assert.match(editor, /status: nextStatus/);
  assert.match(editor, /router\.replace\(\x60\/admin\/podujatia\/\$\{data\.event\.id\}\?vytvorene=1\x60\)/);
  for (const component of ["AdminEventMarkdownEditor", "AdminSeoFields", "AdminProfileGoogleMaps", "AdminGeoLocation", "AdminAutomationUpdateSuggestions", "ImageDisplayEditor"]) {
    assert.ok(editor.includes("<" + component), component);
  }
  for (const field of ["description", "practicalInfo", "seo", "imageUrl", "imageKey", "thumbnailImageDisplay", "detailImageDisplay", "cancelled", "registrationUrl", "websiteUrl"]) {
    assert.ok(editor.includes(field), field);
  }
  assert.match(editor, /const editorSnapshot = JSON\.stringify/);
  assert.match(editor, /setSavedSnapshot\(editorSnapshot\)/);
  assert.match(editor, /allowNavigationRef\.current = true/);
  assert.match(editor, /<EditorUnsavedChangesGuard[\s\S]*open=\{confirmNavigation\}/);
  assert.match(editor, /document\.addEventListener\("click", onDocumentClick, true\)/);
  assert.match(editor, /navigationApi\?\.addEventListener\("navigate", onNativeNavigate\)/);
  assert.match(editor, /<AdminDestructiveConfirmDialog[\s\S]*title="Stiahnuť podujatie z kalendára\?"/);
  assert.match(editor, /dirty=\{dirty\}/);
});

test("pilot confines responsive styling and provides development-only preview fixture", () => {
  assert.match(css, /\.eventPilot/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /\[data-editor-actionbar\]/);
  assert.match(css, /min-height: 44px/);
  const preview = read("app/admin/event-editor-v3-preview/page.tsx");
  assert.match(preview, /process\.env\.NODE_ENV !== "development"/);
  assert.match(preview, /notFound\(\)/);
  assert.doesNotMatch(preview, /fetch\(|db\.prepare|D1|notion\.pages|migrations/i);
});


test("event description and practical info use Lexical with lossless Markdown source fallback", () => {
  assert.equal((editor.match(/<AdminEventMarkdownEditor\b/g) ?? []).length, 2);
  assert.match(markdownBridge, /<AdminLexicalRichTextEditor/);
  assert.match(markdownBridge, /eventMarkdownToEditorial\(value\)/);
  assert.match(markdownBridge, /editorialToEventMarkdown\(next\)/);
  assert.match(markdownBridge, /documentValue === null/);
  assert.match(markdownBridge, /<textarea/);
  assert.match(markdownAdapter, /editorialToEventMarkdown\(doc\) !== source/);
});
