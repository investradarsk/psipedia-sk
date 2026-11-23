import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchAdminOverviewNavigation,
} from "../lib/admin-overview-navigation.ts";
import { ADMIN_NAVIGATION_INTENT_EVENT } from "../lib/admin-editor-navigation.ts";

test("unguarded click makes exactly one client router navigation", () => {
  const events = new EventTarget();
  let pushes = 0;
  events.addEventListener(ADMIN_NAVIGATION_INTENT_EVENT, (event) => {
    assert.equal(event.cancelable, true);
    assert.equal(event.detail.href, "/admin");
  });
  dispatchAdminOverviewNavigation(() => { pushes++; }, event => events.dispatchEvent(event));
  assert.equal(pushes, 1);
});

test("dirty editor cancels immediate route change and replays only after discard", () => {
  const events = new EventTarget();
  let pushes = 0;
  let confirmation = null;
  events.addEventListener(ADMIN_NAVIGATION_INTENT_EVENT, (event) => {
    event.preventDefault();
    confirmation = event.detail.navigate;
  });
  dispatchAdminOverviewNavigation(() => { pushes++; }, event => events.dispatchEvent(event));
  assert.equal(pushes, 0, "preventDefault must suppress the initial push");
  assert.equal(typeof confirmation, "function");
  confirmation();
  assert.equal(pushes, 1, "one confirmed discard must invoke exactly one push");
});

test("a cancelled navigation without confirmation leaves the editor on its route", () => {
  const events = new EventTarget();
  let pushes = 0;
  events.addEventListener(ADMIN_NAVIGATION_INTENT_EVENT, event => event.preventDefault());
  dispatchAdminOverviewNavigation(() => { pushes++; }, event => events.dispatchEvent(event));
  assert.equal(pushes, 0);
});

test("multiple dirty guards do not cause an automatic second push", () => {
  const events = new EventTarget();
  let pushes = 0;
  for (let index = 0; index < 2; index++) {
    events.addEventListener(ADMIN_NAVIGATION_INTENT_EVENT, event => event.preventDefault());
  }
  dispatchAdminOverviewNavigation(() => { pushes++; }, event => events.dispatchEvent(event));
  assert.equal(pushes, 0);
});
