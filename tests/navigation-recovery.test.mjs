import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationRecovery, safeNavigationRecoveryTarget } from "../lib/navigation-recovery.ts";
import { NAVIGATION_MAX_WAIT_MS } from "../lib/navigation-progress.ts";

const current = "https://psipedia.sk/adresar";
test("recovery accepts same-area page transitions only", () => {
  assert.equal(safeNavigationRecoveryTarget("/plemena?q=pes#obsah", current), "/plemena?q=pes#obsah");
  assert.equal(safeNavigationRecoveryTarget("/partner/profily", "https://psipedia.sk/partner"), "/partner/profily");
  for (const href of ["/api/public", "/admin", "/partner", "https://evil.test/a",
    "javascript:alert(1)", "/adresar#obsah", "/plemena.rsc", "https://psipedia.sk//evil.test",
    "/%2fadmin", "https://user@psipedia.sk/plemena"]) {
    assert.equal(safeNavigationRecoveryTarget(href, current), null, href);
  }
  assert.equal(safeNavigationRecoveryTarget("/partner/profily", "https://psipedia.sk/admin"), null);
  assert.equal(safeNavigationRecoveryTarget("/adresar", "https://psipedia.sk/partner"), null);
});

test("watchdog offers recovery only after a bounded wait", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const state = createNavigationRecovery();
  const updates = [];
  const unsubscribe = state.subscribe(() => updates.push(state.snapshot()));
  state.begin("/plemena", current);
  t.mock.timers.tick(NAVIGATION_MAX_WAIT_MS - 1);
  assert.equal(state.snapshot(), null);
  t.mock.timers.tick(1);
  assert.equal(state.snapshot(), "/plemena");
  state.clear();
  assert.deepEqual(updates, ["/plemena", null]);
  unsubscribe();
});

test("a successful commit, dismiss or page exit cancels the watchdog", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const state = createNavigationRecovery();
  state.begin("/plemena", current);
  state.clear();
  t.mock.timers.tick(NAVIGATION_MAX_WAIT_MS * 2);
  assert.equal(state.snapshot(), null);
});

test("a newer transition replaces stale recovery and rejects private destinations", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const state = createNavigationRecovery();
  state.begin("/plemena", current);
  t.mock.timers.tick(1000);
  state.begin("/podujatia", current);
  t.mock.timers.tick(NAVIGATION_MAX_WAIT_MS - 1000);
  assert.equal(state.snapshot(), null);
  t.mock.timers.tick(1000);
  assert.equal(state.snapshot(), "/podujatia");
  state.begin("/admin", current);
  t.mock.timers.tick(NAVIGATION_MAX_WAIT_MS);
  assert.equal(state.snapshot(), null);
});
