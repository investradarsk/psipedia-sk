import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const api = read("app/api/admin/articles/calendar/route.ts");
const widget = read("components/article-editor-calendar.tsx");
const editor = read("components/admin-article-editor.tsx");
const css = read("components/article-editor-calendar.module.css");

test("editor calendar uses the authenticated canonical read-only calendar query", () => {
  assert.match(api, /getAdminApiUser/);
  assert.match(api, /unauthorizedAdminResponse/);
  assert.match(api, /listEditorialCalendarItems\(year, month\)/);
  assert.match(api, /parseEditorialCalendarMonth/);
  assert.match(api, /private, no-store/);
  assert.doesNotMatch(api, /UPDATE managed_articles|INSERT INTO managed_articles/);
});

test("article editor uses the same publication field and never automatically saves on opening the calendar", () => {
  assert.match(editor, /ArticleEditorCalendar/);
  assert.match(editor, /value=\{publishedAt\}/);
  assert.match(editor, /articleId=\{article\?\.id\}/);
  assert.match(editor, /setPublishedAt\(nextDate\)/);
  assert.match(widget, /onChoose\(selectedValue\)/);
  assert.match(widget, /setOpen\(false\)/);
  assert.match(widget, /formatArticleLocalDateTime\(item\.publishedAt\) === value/);
  assert.match(widget, /item\.id !== articleId/);
  assert.match(widget, /"T" \+ candidateTime/);
  assert.match(widget, /readOnly/);
  assert.match(widget, /role="dialog"/);
  assert.match(widget, /aria-modal="true"/);
  assert.match(widget, /event\.key === "Escape"/);
  assert.doesNotMatch(widget, /\/api\/admin\/articles\/[^c]/);
});

test("calendar overlay is responsive with explicit keyboard focus and no hidden-submit button", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /focus-visible/);
  assert.match(widget, /opener\.current\?\.focus\(\)/);
  assert.match(widget, /type="button"/);
  assert.match(widget, /Čas/);
});
