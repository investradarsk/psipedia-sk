import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const store = read("lib/editorial-calendar.ts");
const calendar = read("components/admin-editorial-calendar.tsx");
const route = read("app/admin/clanky/kalendar/page.tsx");
const css = read("components/admin-editorial-calendar.module.css");
const listing = read("app/admin/clanky/page.tsx");

test("calendar uses the canonical lifecycle status and publication timestamp", () => {
  assert.match(store, /status IN \('published', 'scheduled'\)/);
  assert.match(store, /published_at IS NOT NULL/);
  assert.match(store, /published_at >= \?/);
  assert.match(store, /published_at < \?/);
  assert.doesNotMatch(store, /created_at|updated_at/);
});

test("calendar supports authenticated, bounded month navigation and editor deep links from the article detail", () => {
  assert.match(route, /requireAdminPageUser/);
  assert.match(route, /listEditorialCalendarItems\(year, month\)/);
  assert.match(calendar, /monthUrl\(year, month - 1\)/);
  assert.match(calendar, /monthUrl\(year, month \+ 1\)/);
  assert.match(calendar, /\/admin\/clanky\/\$\{selectedArticle\.id\}/);
  assert.match(listing, /href="\/admin\/clanky\/kalendar"/);
});

test("calendar supports filtering, overflow, day detail and keyboard-accessible controls", () => {
  assert.match(calendar, /articles\.slice\(0, selectedDay === key \? articles\.length : 2\)/);
  assert.match(calendar, /articles\.length - 2/);
  assert.match(calendar, /dayArticles/);
  assert.match(calendar, /aria-label=/);
  assert.match(calendar, /aria-pressed=/);
  assert.match(calendar, /aria-expanded=/);
  assert.match(calendar, /type="button"/);
  assert.match(calendar, /V tomto mesiaci nie sú publikované ani naplánované články/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(css, /\.grid \{ display: none/);
});

test("rendering uses browser-local Date for same timezone semantics as editor", () => {
  assert.match(calendar, /new Date\(article\.publishedAt\)/);
  assert.match(calendar, /getFullYear\(\)/);
  assert.match(calendar, /getMonth\(\)/);
  assert.match(calendar, /timeFormat\.format/);
  // UTC boundaries are widened so local DST month-edge dates are covered.
  assert.match(store, /Date\.UTC\(year, month - 1, -2\)/);
  assert.match(store, /Date\.UTC\(year, month, 3\)/);
});

test("calendar maps elapsed scheduled posts to effective published and offers review-first draft scheduling", () => {
  const planner = read("components/calendar-draft-planner.tsx");
  const store = read("lib/article-store.ts");
  const api = read("app/api/admin/articles/route.ts");
  const editor = read("components/admin-article-editor.tsx");
  const editPage = read("app/admin/clanky/[id]/page.tsx");
  assert.match(read("lib/editorial-calendar.ts"), /CASE WHEN status = 'scheduled' AND published_at <= \? THEN 'published'/);
  assert.match(calendar, /effectiveArticleStatus/);
  assert.match(calendar, /CalendarDraftPlanner/);
  assert.match(calendar, /openDraftPicker/);
  assert.match(calendar, /selectedDay === key \? articles\.length : 2/);
  assert.match(planner, /status=draft/);
  assert.match(planner, /ArticleBlocks/);
  assert.match(planner, /EditorialRichText/);
  assert.match(planner, /Potvrdiť plánovanie/);
  assert.match(planner, /expectedUpdatedAt: selectedArticle\.updatedAt/);
  assert.match(store, /existing\.status !== "draft"/);
  assert.match(store, /schedulingPrecondition\.status === "draft"/);
  assert.match(api, /status: url\.searchParams\.get\("status"\) === "draft"/);
  assert.match(editPage, /calendarDay/);
  assert.match(editor, /returnToCalendar && nextStatus === "draft"/);
});
