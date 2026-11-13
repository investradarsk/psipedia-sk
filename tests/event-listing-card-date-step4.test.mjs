import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compactEventCardDate } from "../lib/event-card-date.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("compact dates cover single-day and month/year boundary events", () => {
  assert.equal(compactEventCardDate({ startDate: "2026-12-17", endDate: null }), "17. DEC 2026");
  assert.equal(compactEventCardDate({ startDate: "2026-12-17", endDate: "2026-12-20" }), "17. – 20. DEC 2026");
  assert.equal(compactEventCardDate({ startDate: "2026-11-30", endDate: "2026-12-02" }), "30. NOV – 2. DEC 2026");
  assert.equal(compactEventCardDate({ startDate: "2026-12-31", endDate: "2027-01-02" }), "31. DEC 2026 – 2. JAN 2027");
  assert.equal(compactEventCardDate({ startDate: "2026-12-17", endDate: "2026-12-17" }), "17. DEC 2026");
  assert.equal(compactEventCardDate({ startDate: "2026-12-17", endDate: "2026-12-16" }), "17. DEC 2026");
});

test("event listing cards place a semantic highlighted date between category and name", () => {
  const event = read("components/event-card.tsx");
  const shared = read("components/public-listing-row-card.tsx");
  const css = read("components/directory-public.module.css");
  const begin = shared.indexOf("className={styles.cardTopline}");
  const date = shared.indexOf("data-event-date-line", begin);
  const title = shared.indexOf("data-public-card-title", begin);
  const city = shared.indexOf("className={styles.cardLocation}", begin);
  assert.ok(begin >= 0 && date > begin && title > date && city > title);
  assert.match(shared, /kind === "event" && meta/);
  assert.match(shared, /kind !== "event" && meta/);
  assert.match(event, /compactEventCardDate\(event\)/);
  assert.match(event, /<time[\s\S]*?dateTime=\{event\.startDate\}[\s\S]*?data-event-date/);
  assert.match(event, /timeLabel \? " · " \+ timeLabel : ""/);
  assert.match(event, /location=\{location \|\| "Miesto nie je uvedené"\}/);
  assert.match(css, /\.card\[data-public-card="event-grid"\] \.eventDateMeta/);
  assert.match(css, /var\(--coral-dark/);
});

test("status, shared image and link behavior remain intact in both event variants", () => {
  const event = read("components/event-card.tsx");
  const shared = read("components/public-listing-row-card.tsx");
  assert.match(event, /data-event-status=\{event\.cancelled \? "cancelled" : dateStatus\}/);
  assert.match(event, /badge=\{statusLabel \?/);
  assert.match(event, /<time className=\{styles\.dateBlock\}/);
  assert.match(event, /styles\.eventCardWithImage/);
  assert.match(event, /eventTypePresentation\[event\.eventType\]\.label/);
  assert.match(shared, /<Link className=\{styles\.cardLink\} href=\{href\}>\{contents\}<\/Link>/);
  assert.match(shared, /data-public-card="directory"/);
});
