import { chromium } from "@playwright/test";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Compare only the same locally generated fixture names, viewports and Chromium
// environment. No production screenshots, credentials or third-party services.
export const DEFAULT_MAX_DIFFERENCE = 0.005;
export const DEFAULT_CHANNEL_TOLERANCE = 24;

export function classifyDifference({ changedPixels, totalPixels, baselineWidth, baselineHeight, currentWidth, currentHeight }, maxFraction = DEFAULT_MAX_DIFFERENCE) {
  if (!Number.isInteger(changedPixels) || !Number.isInteger(totalPixels) || totalPixels < 1 ||
    changedPixels < 0 || changedPixels > totalPixels || !Number.isFinite(maxFraction) || maxFraction < 0 || maxFraction > 1) {
    throw new Error("Invalid visual comparison metrics or threshold.");
  }
  const dimensionsMatch = baselineWidth === currentWidth && baselineHeight === currentHeight;
  const fraction = changedPixels / totalPixels;
  return { dimensionsMatch, fraction, failed: !dimensionsMatch || fraction > maxFraction };
}

async function snapshotNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(entry.name))
    .map((entry) => entry.name).sort();
}

export async function comparePngBuffers(page, baselinePng, currentPng, tolerance = DEFAULT_CHANNEL_TOLERANCE) {
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) throw new Error("Invalid channel tolerance.");
  // Canvas decodes PNG natively in Chromium; no unpinned image dependencies.
  return page.evaluate(async ({ baselineSource, currentSource, tolerance }) => {
    async function decode(value) {
      const image = new Image();
      image.src = "data:image/png;base64," + value;
      await image.decode();
      return image;
    }
    const [baseline, current] = await Promise.all([decode(baselineSource), decode(currentSource)]);
    function pixelsOf(image) {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const basePixels = pixelsOf(baseline);
    const currentPixels = pixelsOf(current);
    const width = Math.max(baseline.naturalWidth, current.naturalWidth);
    const height = Math.max(baseline.naturalHeight, current.naturalHeight);
    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext("2d", { willReadFrequently: true });
    const diffImage = diffContext.createImageData(width, height);
    const diff = diffImage.data;
    let changedPixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const insideBase = x < baseline.naturalWidth && y < baseline.naturalHeight;
        const insideCurrent = x < current.naturalWidth && y < current.naturalHeight;
        const a = (y * baseline.naturalWidth + x) * 4;
        const b = (y * current.naturalWidth + x) * 4;
        const different = !insideBase || !insideCurrent ||
          Math.max(Math.abs(basePixels[a] - currentPixels[b]), Math.abs(basePixels[a + 1] - currentPixels[b + 1]),
            Math.abs(basePixels[a + 2] - currentPixels[b + 2]), Math.abs(basePixels[a + 3] - currentPixels[b + 3])) > tolerance;
        if (different) {
          changedPixels += 1;
          diff[offset] = 255; diff[offset + 1] = 30; diff[offset + 2] = 70; diff[offset + 3] = 255;
        } else {
          const grayscale = Math.round((basePixels[a] + basePixels[a + 1] + basePixels[a + 2]) / 3);
          diff[offset] = grayscale; diff[offset + 1] = grayscale; diff[offset + 2] = grayscale; diff[offset + 3] = 255;
        }
      }
    }
    diffContext.putImageData(diffImage, 0, 0);
    return {
      baselineWidth: baseline.naturalWidth, baselineHeight: baseline.naturalHeight,
      currentWidth: current.naturalWidth, currentHeight: current.naturalHeight,
      totalPixels: width * height, changedPixels,
      diffPng: diffCanvas.toDataURL("image/png").slice("data:image/png;base64,".length),
    };
  }, { baselineSource: baselinePng.toString("base64"), currentSource: currentPng.toString("base64"), tolerance });
}

function reportMarkdown(manifest) {
  const lines = [
    "# PSIPEDIA – Visual baseline comparison",
    "",
    "Baseline (shared Git ancestor): " + manifest.baselineSha + ".",
    "PR commit: " + manifest.headSha + ".",
    "Only deterministic local fixture screenshots are compared at identical viewports.",
    "Per-pixel RGB/alpha tolerance: " + manifest.channelTolerance +
      "; maximum changed-pixel fraction: " + (manifest.maxDifference * 100).toFixed(2) + "%.",
    "A changed screenshot is **not** automatically accepted. Review baseline/current/diff PNG artifacts.",
    "",
    "| Fixture | Before → After (px) | Changed pixels | Difference | Result |",
    "| --- | --- | ---: | ---: | --- |",
  ];
  for (const entry of manifest.comparisons) {
    lines.push("| " + entry.name + " | " +
      (entry.baselineWidth ?? "—") + "×" + (entry.baselineHeight ?? "—") + " → " +
      (entry.currentWidth ?? "—") + "×" + (entry.currentHeight ?? "—") + " | " +
      (entry.changedPixels ?? "—") + " | " +
      (entry.fraction === null ? "—" : (entry.fraction * 100).toFixed(3) + "%") +
      " | " + entry.status + " |");
  }
  lines.push("", "Total: " + manifest.comparisons.length + "; flagged: " +
    manifest.comparisons.filter((entry) => entry.status !== "PASS").length + ".", "");
  return lines.join("\n");
}

export async function compareSnapshotDirectories({
  baselineDir, currentDir, outputDir, baselineSha = "unknown", headSha = "unknown",
  maxDifference = DEFAULT_MAX_DIFFERENCE, channelTolerance = DEFAULT_CHANNEL_TOLERANCE,
}) {
  if (!baselineDir || !currentDir || !outputDir) throw new Error("Both screenshot directories and output are required.");
  const namesBefore = new Set(await snapshotNames(baselineDir));
  const namesAfter = new Set(await snapshotNames(currentDir));
  const names = [...new Set([...namesBefore, ...namesAfter])].sort();
  if (!names.length) throw new Error("No screenshot fixtures found: a missing baseline must not pass CI.");
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const manifest = { baselineSha, headSha, maxDifference, channelTolerance, comparisons: [] };
  try {
    for (const name of names) {
      const hasBefore = namesBefore.has(name);
      const hasAfter = namesAfter.has(name);
      if (!hasBefore || !hasAfter) {
        manifest.comparisons.push({ name, status: hasBefore ? "MISSING PR" : "MISSING BASELINE",
          changedPixels: null, fraction: null, baselineWidth: null, baselineHeight: null,
          currentWidth: null, currentHeight: null });
        continue;
      }
      const [baselinePng, currentPng] = await Promise.all([
        readFile(join(baselineDir, name)), readFile(join(currentDir, name)),
      ]);
      const comparison = await comparePngBuffers(page, baselinePng, currentPng, channelTolerance);
      const { diffPng, ...metrics } = comparison;
      const assessment = classifyDifference(metrics, maxDifference);
      if (assessment.failed) await writeFile(join(outputDir, name), Buffer.from(diffPng, "base64"));
      manifest.comparisons.push({
        name, baselineWidth: metrics.baselineWidth, baselineHeight: metrics.baselineHeight,
        currentWidth: metrics.currentWidth, currentHeight: metrics.currentHeight,
        changedPixels: metrics.changedPixels, fraction: assessment.fraction,
        status: assessment.failed ? "DIFFERENT — review" : "PASS",
      });
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(outputDir, "summary.md"), reportMarkdown(manifest) + "\n");
  return { manifest, summary: reportMarkdown(manifest),
    failed: manifest.comparisons.some((entry) => entry.status !== "PASS") };
}

async function main() {
  const output = resolve(process.env.VISUAL_DIFF_OUTPUT_DIR ?? ".e2e-artifacts/pr-visual/template-diff");
  const result = await compareSnapshotDirectories({
    baselineDir: resolve(process.env.VISUAL_BASELINE_DIR ?? ".e2e-artifacts/pr-visual/template-baseline"),
    currentDir: resolve(process.env.VISUAL_CURRENT_DIR ?? ".e2e-artifacts/pr-visual/template-fixtures"),
    outputDir: output,
    baselineSha: process.env.VISUAL_BASELINE_SHA ?? "unknown",
    headSha: process.env.PR_HEAD_SHA ?? "unknown",
  });
  console.log(result.summary);
  if (result.failed) {
    console.error("Visual differences need explicit review. See paired screenshots and red diff PNGs in the PR artifact.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
