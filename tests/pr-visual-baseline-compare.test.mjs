import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { classifyDifference, compareSnapshotDirectories } from "../scripts/pr-visual-baseline-compare.mjs";

test("the visual difference threshold checks both pixels and screenshot dimensions", () => {
  const base = { changedPixels: 1, totalPixels: 1000, baselineWidth: 100, currentWidth: 100,
    baselineHeight: 10, currentHeight: 10 };
  assert.deepEqual(classifyDifference(base, 0.005), { dimensionsMatch: true, fraction: 0.001, failed: false });
  assert.equal(classifyDifference({ ...base, changedPixels: 6 }, 0.005).failed, true);
  assert.equal(classifyDifference({ ...base, currentHeight: 11 }, 0.005).failed, true);
  assert.throws(() => classifyDifference({ ...base, changedPixels: 1001 }), /Invalid visual/);
  assert.throws(() => classifyDifference(base, -0.1), /Invalid visual/);
});

test("identical PNGs pass; modified pixels and missing baselines fail with artifacts", { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "psipedia-visual-diff-"));
  const before = join(root, "before");
  const after = join(root, "after");
  const output = join(root, "diff");
  let browser;
  try {
    await Promise.all([mkdir(before), mkdir(after)]);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    async function image(color, width = 2, height = 2) {
      const png = await page.evaluate(({ color, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = color; context.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png");
      }, { color, width, height });
      return Buffer.from(png.split(",")[1], "base64");
    }
    const red = await image("#d02020");
    const blue = await image("#2050d0");
    const taller = await image("#d02020", 2, 3);
    await browser.close(); browser = null;
    await writeFile(join(before, "directory-320.png"), red);
    await writeFile(join(after, "directory-320.png"), red);
    let result = await compareSnapshotDirectories({
      baselineDir: before, currentDir: after, outputDir: output, baselineSha: "abc", headSha: "def",
    });
    assert.equal(result.failed, false);
    assert.equal(result.manifest.comparisons[0].status, "PASS");

    await writeFile(join(after, "directory-320.png"), blue);
    result = await compareSnapshotDirectories({ baselineDir: before, currentDir: after, outputDir: output });
    assert.equal(result.failed, true);
    assert.equal(result.manifest.comparisons[0].changedPixels, 4);
    assert.equal(result.manifest.comparisons[0].status, "DIFFERENT — review");
    assert.ok((await readFile(join(output, "directory-320.png"))).length > 24);
    assert.match(await readFile(join(output, "summary.md"), "utf8"), /DIFFERENT/);

    await writeFile(join(after, "directory-320.png"), taller);
    result = await compareSnapshotDirectories({ baselineDir: before, currentDir: after, outputDir: output });
    assert.equal(result.failed, true);
    assert.equal(result.manifest.comparisons[0].currentHeight, 3);

    await writeFile(join(after, "new-template-1440.png"), red);
    result = await compareSnapshotDirectories({ baselineDir: before, currentDir: after, outputDir: output });
    assert.equal(result.failed, true);
    assert.match(result.summary, /MISSING BASELINE/);
  } finally {
    await browser?.close();
    await rm(root, { recursive: true, force: true });
  }
});
