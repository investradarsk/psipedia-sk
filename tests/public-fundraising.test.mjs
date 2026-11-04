import assert from "node:assert/strict";
import test from "node:test";
import { helpFinancials, helpProgress } from "../lib/help.ts";
import { mapClusterTextViewport, buildMapApiUrl, EMPTY_MAP_FILTERS } from "../lib/map-public-ui.ts";

test("non-financial help and legacy zero defaults never display monetary progress", () => {
  for (const category of ["dobrovolnictvo", "docasna-opatera", "utulky", "adopcia"]) {
    assert.equal(helpFinancials({ category, goalAmount: 1000, raisedAmount: 0 }), null);
  }
  assert.equal(helpFinancials({ category: "zbierky", goalAmount: 0, raisedAmount: 0 }), null);
  assert.equal(helpFinancials({ category: "zbierky", goalAmount: null, raisedAmount: null }), null);
});
test("a genuine zero raised amount survives; invalid amounts and zero targets do not", () => {
  const amounts = helpFinancials({ category: "zbierky", goalAmount: 1000, raisedAmount: 0 });
  assert.deepEqual(amounts, { goalAmount: 1000, raisedAmount: 0 });
  assert.equal(helpProgress(amounts), 0);
  assert.deepEqual(helpFinancials({ category: "zbierky", goalAmount: 0, raisedAmount: 125 }), {
    goalAmount: null,
    raisedAmount: 125,
  });
  assert.equal(
    helpFinancials({ category: "zbierky", goalAmount: NaN, raisedAmount: Infinity }),
    null,
  );
  assert.equal(helpProgress({ goalAmount: 100, raisedAmount: 125 }), 100);
});
test("text selection covers the full server cell and issues a local item query without Google", () => {
  for (const zoom of [6, 7, 9, 11, 20]) {
    const viewport = mapClusterTextViewport({ latitude: 48.31, longitude: 18.08 }, zoom);
    const url = new URL(buildMapApiUrl(viewport, EMPTY_MAP_FILTERS), "https://psipedia.sk");
    assert.equal(url.pathname, "/api/map");
    assert.ok(Number(url.searchParams.get("zoom")) > 10);
    assert.ok(viewport.bbox.north > 48.31 && viewport.bbox.south <= 48.31);
    assert.ok(viewport.bbox.east > 18.08 && viewport.bbox.west <= 18.08);
    assert.ok(!url.searchParams.has("key"));
  }
});
