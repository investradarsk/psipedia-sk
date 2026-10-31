import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("PhotoSwipe enhances only canonical linked galleries and preserves SSR image links", () => {
  const gallery = read("components/public-visual-system/public-photo-gallery.tsx");
  const enhance = read("components/public-visual-system/public-photoswipe-enhancer.tsx");
  assert.match(gallery, /return variant === "linked" \? <PublicPhotoSwipeEnhancer>/);
  assert.match(gallery, /data-pswp-gallery-item/);
  assert.match(gallery, /href=\{href\}/);
  assert.match(gallery, /rel="noopener noreferrer"/);
  assert.match(gallery, /variant !== "linked"/);
  assert.match(enhance, /PhotoSwipeLightbox/);
  assert.match(enhance, /pswpModule: \(\) => import\("photoswipe"\)/);
  assert.match(enhance, /lightbox\.destroy\(\)/);
});

test("FullCalendar replaces the desktop month grid, not mobile or canonical filters/URLs", () => {
  const desktop = read("components/desktop-event-fullcalendar.tsx");
  const page = read("components/event-calendar.tsx");
  const css = read("components/events-public.module.css");
  assert.match(desktop, /from "@fullcalendar\/react"/);
  assert.match(desktop, /from "@fullcalendar\/daygrid"/);
  assert.match(desktop, /initialView="dayGridMonth"/);
  assert.match(desktop, /locale=\{skLocale\}/);
  assert.match(desktop, /hrefForDay\(day\)/);
  assert.match(desktop, /a\.fc-daygrid-day-number/);
  assert.match(desktop, /onSelectDay\(anchor\.dataset\.calendarDate\)/);
  assert.doesNotMatch(desktop, /return <a\b/);
  assert.match(page, /<DesktopEventFullCalendar/);
  assert.match(page, /<div className=\{styles\.monthGrid\}/);
  assert.match(page, /\/api\/public\/events\/calendar/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /window\.addEventListener\("popstate"/);
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.calendarLayout \.monthGrid \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.desktopFullCalendar \{ display: none; \}/);
});
