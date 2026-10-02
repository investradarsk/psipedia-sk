import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildSectionVisualRegistry,
  normalizeSectionVisualCrop,
  resolveSectionVisual,
  SECTION_VISUAL_DESKTOP_ASPECT,
  SECTION_VISUAL_MOBILE_ASPECT,
  SECTION_VISUAL_ZOOM_MAX,
  SECTION_VISUAL_ZOOM_MIN,
} from "../lib/section-visual-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("SECTION-VISUALS-1 registry covers homepage, main sections and canonical domain categories", () => {
  const registry = buildSectionVisualRegistry();
  const keys = new Set(registry.map((item) => item.visualKey));

  for (const key of [
    "home.hero",
    "section.novinky",
    "section.plemena",
    "section.steniatka",
    "section.starostlivost",
    "section.aktivity",
    "section.adresar",
    "section.podujatia",
    "section.pomoc-psom",
    "section.recenzie",
    "directory.veterinari",
    "events.vystavy",
    "events.preteky",
    "events.seminare",
    "help.adopcia",
    "help.utulky",
  ]) {
    assert.equal(keys.has(key), true, `missing visual key ${key}`);
  }

  assert.equal([...keys].some((key) => key.startsWith("subsection.steniatka.")), true);
  assert.equal([...keys].some((key) => key.startsWith("subsection.starostlivost.")), true);
  assert.equal([...keys].some((key) => key.startsWith("subsection.aktivity.")), true);
  assert.equal([...keys].some((key) => key.startsWith("reviews.")), true);
  assert.equal(keys.size, registry.length, "visual keys must be unique");
});

test("default visual resolution is stable and never derives an image from dynamic content", () => {
  const definition = buildSectionVisualRegistry().find((item) => item.visualKey === "section.steniatka");
  assert.ok(definition);
  const resolved = resolveSectionVisual(definition, null);
  assert.equal(resolved.source, "default");
  assert.match(resolved.imageUrl, /^\/images\//);
  assert.equal(resolved.imageKey, null);
});

test("stored visual overrides the stable default and keeps independent crop state", () => {
  const definition = buildSectionVisualRegistry().find((item) => item.visualKey === "directory.veterinari");
  assert.ok(definition);
  const resolved = resolveSectionVisual(definition, {
    visualKey: definition.visualKey,
    sectionSlug: "adresar",
    subsectionSlug: "veterinari",
    imageUrl: "/media/section-visuals/2026/example.webp",
    imageKey: "section-visuals/2026/example.webp",
    altText: "Veterinár so psom",
    desktopCrop: { x: 0.2, y: 0.7, zoom: 1.35 },
    mobileCrop: { x: 0.8, y: 0.3, zoom: 1.8 },
  });
  assert.equal(resolved.source, "custom");
  assert.equal(resolved.imageUrl, "/media/section-visuals/2026/example.webp");
  assert.deepEqual(resolved.desktopCrop, { x: 0.2, y: 0.7, zoom: 1.35 });
  assert.deepEqual(resolved.mobileCrop, { x: 0.8, y: 0.3, zoom: 1.8 });
});

test("crop normalization clamps position and zoom to the persisted contract", () => {
  assert.deepEqual(
    normalizeSectionVisualCrop({ x: -2, y: 8, zoom: 99 }),
    { x: 0, y: 1, zoom: SECTION_VISUAL_ZOOM_MAX },
  );
  assert.deepEqual(
    normalizeSectionVisualCrop({ x: 0.25, y: 0.75, zoom: -4 }),
    { x: 0.25, y: 0.75, zoom: SECTION_VISUAL_ZOOM_MIN },
  );
  assert.deepEqual(
    normalizeSectionVisualCrop({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: Number.NaN }, { x: 0.4, y: 0.6, zoom: 1.4 }),
    { x: 0.4, y: 0.6, zoom: 1.4 },
  );
});

test("registry exposes one exact desktop/mobile crop contract", () => {
  const registry = buildSectionVisualRegistry();
  assert.ok(registry.length > 10);
  for (const definition of registry) {
    assert.deepEqual(definition.desktopAspect, SECTION_VISUAL_DESKTOP_ASPECT);
    assert.deepEqual(definition.mobileAspect, SECTION_VISUAL_MOBILE_ASPECT);
    assert.equal(definition.hasDesktopMobileCrop, true);
    assert.ok(definition.minimumSize.width > 0);
    assert.ok(definition.minimumSize.height > 0);
  }
});

test("homepage fallback preserves the pre-existing mobile focal position", () => {
  const definition = buildSectionVisualRegistry().find((item) => item.visualKey === "home.hero");
  assert.ok(definition);
  const resolved = resolveSectionVisual(definition, null);
  assert.deepEqual(resolved.desktopCrop, { x: 0.5, y: 0.5, zoom: 1 });
  assert.deepEqual(resolved.mobileCrop, { x: 0.64, y: 0.5, zoom: 1 });
});

test("admin visual save and shared upload remain admin-authenticated", async () => {
  const [visualRoute, uploadRoute] = await Promise.all([
    readFile(path.join(repoRoot, "app/api/admin/section-visuals/route.ts"), "utf8"),
    readFile(path.join(repoRoot, "app/api/admin/uploads/route.ts"), "utf8"),
  ]);
  for (const source of [visualRoute, uploadRoute]) {
    assert.match(source, /getAdminApiUser/);
    assert.match(source, /unauthorizedAdminResponse/);
  }
  assert.match(uploadRoute, /"section-visuals"/);
  assert.match(uploadRoute, /detectedImageType/);
  assert.match(uploadRoute, /MAX_FILE_SIZE/);
});

test("client upload contract exposes section-visuals and retains optimization", async () => {
  const source = await readFile(path.join(repoRoot, "lib/admin-image-upload.ts"), "utf8");
  assert.match(source, /"section-visuals"/);
  assert.match(source, /image\/webp/);
  assert.match(source, /createImageBitmap/);
  assert.match(source, /2400/);
});

test("public unified hero consumes desktop/mobile crop and all future rollout slots", async () => {
  const [component, css] = await Promise.all([
    readFile(path.join(repoRoot, "components/public-visual-system/unified-section-hero.tsx"), "utf8"),
    readFile(path.join(repoRoot, "components/public-visual-system/unified-section-hero.module.css"), "utf8"),
  ]);
  for (const slot of ["breadcrumbs", "searchSlot", "ctaSlot", "metaSlot"]) assert.match(component, new RegExp(slot));
  for (const token of [
    "--section-visual-desktop-x",
    "--section-visual-desktop-y",
    "--section-visual-desktop-zoom",
    "--section-visual-mobile-x",
    "--section-visual-mobile-y",
    "--section-visual-mobile-zoom",
  ]) {
    assert.match(component + css, new RegExp(token));
  }
});

test("section visual store fails safe on missing D1 table and never selects dynamic content", async () => {
  const source = await readFile(path.join(repoRoot, "lib/section-visual-store.ts"), "utf8");
  assert.match(source, /no such table:\\s\*section_visuals/i);
  assert.match(source, /return \[\]/);
  assert.match(source, /return null/);
  assert.doesNotMatch(source, /first article|first profile|first event|LIMIT 1.*managed_articles/is);
});
