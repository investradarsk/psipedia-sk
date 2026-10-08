import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatArticleLocalDateTime, parseArticleLocalDateTime } from "../lib/article-schedule-time.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const calendar = read("components/admin-editorial-calendar.tsx");
const css = read("components/admin-editorial-calendar.module.css");
const store = read("lib/article-store.ts");
const api = read("app/api/admin/articles/[id]/route.ts");
const editor = read("components/admin-article-editor.tsx");

test("article items open a distinct inline detail while calendar day navigation stays intact", () => {
  assert.match(calendar, /onClick=\{\(event\) => onOpen\(article.id, event.currentTarget\)\}/);
  assert.match(calendar, /origin.current = element/);
  assert.match(calendar, /void openArticle\(id\)/);
  assert.match(calendar, /setSelectedDay\(selectedDay === key \? null : key\)/);
  assert.match(calendar, /selectedDay && \(/);
  assert.match(calendar, /aria-labelledby="calendar-article-detail"/);
  assert.match(calendar, /Otvoriť v editore/);
  assert.match(calendar, /\/admin\/clanky\/\$\{selectedArticle.id\}/);
});

test("calendar reschedules only scheduled articles via canonical guarded update, no new backend", () => {
  assert.match(calendar, /selectedArticle.status === "scheduled"/);
  assert.match(calendar, /method: "PATCH"/);
  assert.match(calendar, /expectedUpdatedAt: selectedArticle.updatedAt/);
  assert.match(api, /requireAdminMutation\(request\)/);
  assert.match(api, /rescheduleManagedArticle/);
  assert.match(store, /return updateManagedArticle\(id, payload, editorEmail, existing, \{ updatedAt: expectedUpdatedAt \}\)/);
  assert.match(store, /AND status = 'scheduled' AND updated_at = \?/);
  assert.match(store, /ArticleRescheduleConflictError/);
  assert.match(calendar, /selectedArticle.status !== "scheduled"/);
  assert.match(calendar, /iba na čítanie/);
  assert.doesNotMatch(api, /UPDATE managed_articles/);
});

test("save is server-authoritative, shows errors and supports month transfer", () => {
  assert.match(calendar, /saveLock.current/);
  assert.match(calendar, /setSaving\(true\)/);
  assert.match(calendar, /startRefresh\(\(\) => router.refresh\(\)\)/);
  assert.match(calendar, /setSelectedArticle\(result.article\)/);
  assert.match(calendar, /role="alert"/);
  assert.match(calendar, /role="status" aria-live="polite"/);
  assert.match(calendar, /outsideMonth/);
  assert.match(calendar, /Prejsť na nový mesiac/);
  assert.doesNotMatch(calendar, /items\.push\(/);
});

test("keyboard, focus return, desktop and mobile interaction contract", () => {
  assert.match(calendar, /ref=\{calendarRoot\}/);
  assert.match(calendar, /data-interactive/);
  assert.match(calendar, /ref=\{detailHeading\}/);
  assert.match(calendar, /origin.current\?\.isConnected/);
  assert.match(calendar, /event.key === "Escape"/);
  assert.match(calendar, /requestAnimationFrame/);
  assert.match(calendar, /aria-expanded=/);
  assert.match(calendar, /type="date"/);
  assert.match(calendar, /type="time"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /max-width: 100%/);
});

test("editor uses the same true browser-local time format as the calendar", () => {
  assert.match(editor, /formatArticleLocalDateTime\(value\)/);
  assert.match(calendar, /formatArticleLocalDateTime\(result.article.publishedAt\)/);
});

test("validates leap days, invalid values and DST with Europe\/Bratislava local time", () => {
  const oldTimezone = process.env.TZ;
  try {
    process.env.TZ = "Europe/Bratislava";
    assert.equal(parseArticleLocalDateTime("2026-02-29", "11:30"), null);
    assert.equal(parseArticleLocalDateTime("2028-02-29", "11:30"), "2028-02-29T10:30:00.000Z");
    assert.equal(parseArticleLocalDateTime("", "13:00"), null);
    assert.equal(parseArticleLocalDateTime("2026-10-08", ""), null);
    assert.equal(parseArticleLocalDateTime("2026-10-08", "25:00"), null);
    assert.equal(parseArticleLocalDateTime("2026-03-29", "02:30"), null);
    assert.equal(parseArticleLocalDateTime("2026-03-29", "03:30"), "2026-03-29T01:30:00.000Z");
    // Native datetime-local semantics choose the first instant in the repeated hour.
    assert.equal(parseArticleLocalDateTime("2026-10-25", "02:30"), "2026-10-25T00:30:00.000Z");
    assert.equal(formatArticleLocalDateTime("2026-10-25T00:30:00.000Z"), "2026-10-25T02:30");
    assert.equal(formatArticleLocalDateTime("2026-06-01T10:20:00.000Z"), "2026-06-01T12:20");
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
  }
});
