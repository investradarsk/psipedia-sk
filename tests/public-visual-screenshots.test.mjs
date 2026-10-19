import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PUBLIC_PAGES, VIEWPORTS, classifyImages, isProductionUrl,
  isSuccessfulHttpStatus, readPngDimensions, resolveSelection,
} from "../scripts/public-visual-screenshots.mjs";

test("default and named pages stay inside the fixed public allowlist", () => {
  assert.deepEqual(resolveSelection("homepage"), ["homepage"]);
  assert.deepEqual(resolveSelection("mapa"), ["mapa"]);
  for (const value of ["https://example.com", "../admin", "/admin", "partner", "", "unknown"]) {
    assert.throws(() => resolveSelection(value), /Unsupported page/);
  }
  for (const path of Object.values(PUBLIC_PAGES)) {
    assert.match(path, /^\/(?:[a-z-]+)?$/);
    assert.ok(!path.includes("/admin") && !path.includes("/partner"));
  }
});

test("curated groups expand deterministically without duplicates", () => {
  for (const group of ["core", "content", "all"]) {
    const selected = resolveSelection(group);
    assert.ok(selected.length > 1);
    assert.equal(selected.length, new Set(selected).size);
    for (const name of selected) assert.ok(Object.hasOwn(PUBLIC_PAGES, name));
  }
  assert.equal(resolveSelection("all").length, Object.keys(PUBLIC_PAGES).length);
  assert.ok(resolveSelection("core").includes("homepage"));
});

test("six exact capture viewports are configured", () => {
  assert.deepEqual(VIEWPORTS.map(({ width, height }) => [width, height]), [
    [320, 720], [375, 812], [390, 844], [430, 932], [768, 1024], [1440, 900],
  ]);
});

test("production navigation rejects unrelated URLs and credentials", () => {
  assert.equal(isProductionUrl("https://psipedia.sk/"), true);
  assert.equal(isProductionUrl("https://psipedia.sk/podujatia"), true);
  for (const value of [
    "https://example.com/", "https://evil.psipedia.sk/", "http://psipedia.sk",
    "https://psipedia.sk.evil.tld/", "https://user:password@psipedia.sk/",
    "javascript:alert(1)",
  ]) assert.equal(isProductionUrl(value), false);
});

test("unavailable documents are technical failures, not approved screenshots", () => {
  assert.equal(isSuccessfulHttpStatus(200), true);
  assert.equal(isSuccessfulHttpStatus(204), true);
  for (const status of [0, 301, 404, 429, 500, null]) {
    assert.equal(isSuccessfulHttpStatus(status), false);
  }
});

test("unloaded and broken images remain separately measurable", () => {
  const state = classifyImages([
    { complete: true, naturalWidth: 800, rendered: true },
    { complete: false, naturalWidth: 0, rendered: true },
    { complete: true, naturalWidth: 0, rendered: true },
    { complete: true, naturalWidth: 800, rendered: false },
  ]);
  assert.deepEqual(state, { total: 4, unloaded: 1, broken: 1, notRendered: 1 });
});

test("PNG signature and native pixel dimensions are verified", async () => {
  const folder = await mkdtemp(join(tmpdir(), "psipedia-visual-"));
  try {
    const file = join(folder, "sample.png");
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(390, 16);
    png.writeUInt32BE(844, 20);
    await writeFile(file, png);
    assert.deepEqual(await readPngDimensions(file), { width: 390, height: 844, bytes: 24 });
    await writeFile(file, Buffer.from("not-a-png"));
    await assert.rejects(readPngDimensions(file), /Not a valid PNG/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
