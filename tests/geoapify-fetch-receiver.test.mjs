import assert from "node:assert/strict";
import test from "node:test";
import { GeoapifyGeocoder } from "../lib/geoapify-geocoder.ts";

const methods = [
  ["exact", (client) => client.geocodeExact({ query: "Nitra", countryCode: "SK" })],
  ["approximate", (client) => client.geocodeApproximate({ query: "Nitra", countryCode: "SK" })],
  ["autocomplete", (client) => client.autocomplete({ query: "Hlavna", region: "NR", district: "Nitra", city: "Nitra" })],
  ["place details", (client) => client.lookupPlace("place-id")],
];

const fixture = () => Response.json({ results: [{ lat: 48.3, lon: 18.1, city: "Nitra", place_id: "place-id" }] });

test("default native-style Cloudflare fetch and injectable mock work for all four Geoapify paths", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = function nativeReceiverSensitive(url) {
    if (this !== undefined) throw new TypeError("Illegal invocation");
    calls.push(String(url));
    return Promise.resolve(fixture());
  };
  try {
    for (const [name, invoke] of methods) {
      const result = await invoke(new GeoapifyGeocoder({ apiKey: "fake" }));
      assert.equal(result.length, 1, name);
      assert.equal(result[0].city, "Nitra", name);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 4);

  const mockedCalls = [];
  const mockFetch = async (url) => {
    mockedCalls.push(String(url));
    return fixture();
  };
  for (const [name, invoke] of methods) {
    const result = await invoke(new GeoapifyGeocoder({ apiKey: "fake", fetchImpl: mockFetch }));
    assert.equal(result.length, 1, name);
    assert.equal(result[0].provider, "geoapify", name);
  }
  assert.equal(mockedCalls.length, 4);
});
