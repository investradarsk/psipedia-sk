import assert from "node:assert/strict";
import test from "node:test";
import { readFavorites, subscribeFavorites, writeFavorites } from "../lib/public-favorites.ts";

function withStorage(t, initial) {
  let value = initial;
  const browser = new EventTarget();
  browser.localStorage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  const previous = globalThis.window;
  globalThis.window = browser;
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  return browser;
}

test("favorites tolerate unexpected saved values and discard duplicate or invalid entries", (t) => {
  const browser = withStorage(t, "null");
  assert.deepEqual(readFavorites(), []);
  browser.localStorage.setItem("psipedia-favorites", '["pes","pes",3,null,"","druhy"]');
  assert.deepEqual(readFavorites(), ["pes", "druhy"]);
});

test("failed persistence returns a failure and does not notify observers", (t) => {
  const browser = withStorage(t, '["pes"]');
  browser.localStorage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  let updates = 0;
  const unsubscribe = subscribeFavorites(() => updates++);
  assert.equal(writeFavorites(["druhy"]), false);
  assert.deepEqual(readFavorites(), ["pes"]);
  assert.equal(updates, 0);
  unsubscribe();
});

test("same-tab writes and cross-tab changes notify subscribers until cleanup", (t) => {
  const browser = withStorage(t, "[]");
  const snapshots = [];
  const unsubscribe = subscribeFavorites(() => snapshots.push(readFavorites()));
  assert.equal(writeFavorites(["pes"]), true);
  browser.localStorage.setItem("psipedia-favorites", '["druhy"]');
  function storage(key) {
    browser.dispatchEvent(Object.assign(new Event("storage"), { key }));
  }
  storage("another-key");
  storage("psipedia-favorites");
  browser.localStorage.setItem("psipedia-favorites", null);
  storage(null);
  unsubscribe();
  storage("psipedia-favorites");
  assert.deepEqual(snapshots, [["pes"], ["druhy"], []]);
});
