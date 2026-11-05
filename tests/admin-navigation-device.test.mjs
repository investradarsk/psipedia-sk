import assert from "node:assert/strict";
import test from "node:test";
import { isIosWebKitDevice } from "../lib/admin-navigation-device.ts";

test("iPhone/iPad WebKit retain the safe full-document navigation fallback", () => {
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    "iPhone",
    5,
  ), true);
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    "iPad",
    5,
  ), true);
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
    "MacIntel",
    5,
  ), true, "iPadOS desktop user-agent must also be covered");
});

test("Android and desktop browsers use client-side admin transitions", () => {
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0",
    "Linux armv8l",
    5,
  ), false);
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0",
    "Win32",
    0,
  ), false);
  assert.equal(isIosWebKitDevice(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15",
    "MacIntel",
    0,
  ), false);
});
