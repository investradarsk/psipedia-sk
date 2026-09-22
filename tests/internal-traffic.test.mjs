import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  INTERNAL_TRAFFIC_EVENT,
  INTERNAL_TRAFFIC_QUERY_PARAM,
  INTERNAL_TRAFFIC_STORAGE_KEY,
  isStoredInternalTraffic,
  parseInternalTrafficOverride,
} from "../lib/internal-traffic.ts";

test("internal traffic query override accepts explicit on/off values only", () => {
  for (const value of ["1", "true", "TRUE", "on", " ON "]) {
    assert.equal(parseInternalTrafficOverride(value), true);
  }
  for (const value of ["0", "false", "FALSE", "off", " OFF "]) {
    assert.equal(parseInternalTrafficOverride(value), false);
  }
  assert.equal(parseInternalTrafficOverride(null), null);
  assert.equal(parseInternalTrafficOverride(""), null);
  assert.equal(parseInternalTrafficOverride("yes"), null);
});

test("internal traffic storage uses a single explicit marker", () => {
  assert.equal(INTERNAL_TRAFFIC_QUERY_PARAM, "internal");
  assert.equal(INTERNAL_TRAFFIC_STORAGE_KEY, "psipedia-internal-traffic");
  assert.equal(INTERNAL_TRAFFIC_EVENT, "psipedia:internal-traffic-changed");
  assert.equal(isStoredInternalTraffic("1"), true);
  assert.equal(isStoredInternalTraffic("0"), false);
  assert.equal(isStoredInternalTraffic(null), false);
});

test("analytics and programmatic ads both honor the internal traffic marker", async () => {
  const [consent, ads] = await Promise.all([
    readFile(new URL("../components/cookie-consent.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/programmatic-ad-loader.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(consent, /INTERNAL_TRAFFIC_STORAGE_KEY/);
  assert.match(consent, /parseInternalTrafficOverride/);
  assert.match(consent, /disableAnalytics\(\)/);
  assert.match(consent, /history\.replaceState/);
  assert.match(ads, /INTERNAL_TRAFFIC_STORAGE_KEY/);
  assert.match(ads, /INTERNAL_TRAFFIC_EVENT/);
});
