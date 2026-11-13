import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("events filter navigation preserves native URL hash and aligns below the measured header after layout", () => {
  const header = read("components/site-header.tsx");
  const events = read("components/event-listing-results.tsx");
  assert.match(events, /action=\{\`\$\{pathname\}#events-list\`\}/);
  assert.match(events, /id="events-list"/);
  assert.match(header, /target\.scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(header, /id === "events-list" \? window\.setTimeout/);
  assert.match(header, /getComputedStyle\(target\)\.scrollMarginTop/);
  assert.match(header, /--psipedia-sticky-header-height/);
  assert.match(header, /preferredTop = Math\.max\(104, margin, header \+ 16\)/);
  assert.match(header, /currentTop < preferredTop - 8/);
  assert.match(header, /behavior: "instant"/);
  assert.match(header, /window\.clearTimeout\(eventsTimer\)/);
});

test("delayed alignment is specific to events and does not add global swipe or scroll listeners", () => {
  const header = read("components/site-header.tsx");
  assert.match(header, /id === "events-list" \? window\.setTimeout/);
  assert.doesNotMatch(header, /window\.addEventListener\("scrollend"/);
  assert.doesNotMatch(header, /document\.addEventListener\("touchstart"/);
});
