import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationProgress, eligibleNavigationClick, routeKey, NAVIGATION_MAX_WAIT_MS, NAVIGATION_MIN_VISIBLE_MS } from "../lib/navigation-progress.ts";

const current = "https://psipedia.sk/clanky?tema=vycvik";
const click = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const link = { href: "/plemena", target: "", download: false };

test("accepts internal page and query transitions", () => {
  assert.equal(eligibleNavigationClick(click, link, current), true);
  assert.equal(eligibleNavigationClick(click, { ...link, href: "/clanky?tema=zdravie" }, current), true);
  assert.equal(routeKey("/plemena#obsah", current), "/plemena");
});
for (const href of [current, "#obsah", "/clanky?tema=vycvik#obsah", "https://example.com", "mailto:redakcia@example.com", "tel:+421900123456", "javascript:void(0)", "data:text/plain,test"]) {
  test(`ignores non-transition link ${href}`, () => assert.equal(eligibleNavigationClick(click, { ...link, href }, current), false));
}
for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey", "defaultPrevented"]) {
  test(`ignores ${modifier}`, () => assert.equal(eligibleNavigationClick({ ...click, [modifier]: true }, link, current), false));
}
test("ignores middle click, downloads and other browsing contexts", () => {
  assert.equal(eligibleNavigationClick({ ...click, button: 1 }, link, current), false);
  assert.equal(eligibleNavigationClick(click, { ...link, download: true }, current), false);
  for (const target of ["_blank", "_parent", "preview"]) assert.equal(eligibleNavigationClick(click, { ...link, target }, current), false);
});

test("starts synchronously and holds quick commits briefly without delaying initial feedback", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const progress = createNavigationProgress();
  const changes = [];
  const unsubscribe = progress.subscribe(() => changes.push(progress.snapshot()));
  progress.begin();
  assert.equal(progress.snapshot(), true);
  progress.complete();
  t.mock.timers.tick(NAVIGATION_MIN_VISIBLE_MS - 1);
  assert.equal(progress.snapshot(), true);
  t.mock.timers.tick(1);
  assert.equal(progress.snapshot(), false);
  assert.deepEqual(changes, [true, false]);
  unsubscribe();
});

test("old completion and timeout cannot hide a newer navigation", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const progress = createNavigationProgress();
  const old = progress.begin();
  t.mock.timers.tick(100);
  progress.complete(old);
  const latest = progress.begin();
  progress.complete(old);
  t.mock.timers.tick(200);
  assert.equal(progress.snapshot(), true);
  progress.complete(latest);
  t.mock.timers.tick(1);
  assert.equal(progress.snapshot(), false);
});

test("cancelled/error navigation expires even without a route commit", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const progress = createNavigationProgress();
  progress.begin();
  t.mock.timers.tick(NAVIGATION_MAX_WAIT_MS);
  assert.equal(progress.snapshot(), false);
  progress.begin();
  progress.reset();
  assert.equal(progress.snapshot(), false);
});
