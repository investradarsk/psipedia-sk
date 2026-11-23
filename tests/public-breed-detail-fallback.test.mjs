import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("breed detail uses the canonical public missing-photo visual for hero and related breeds", () => {
  const detail = read("app/plemena/[slug]/page.tsx");
  const styles = read("app/plemena/[slug]/breed-profile.module.css");
  const shared = read("components/public-visual-system/public-media-fallback.tsx");
  assert.match(detail, /import \{ PublicMediaFallback \}/);
  assert.match(detail, /breed\.image \? \(/);
  assert.match(detail, /<BreedPhoto[\s\S]*?src=\{breed\.image\}/);
  assert.match(detail, /<PublicMediaFallback\s+size="detail"\s+label=/);
  assert.match(detail, /item\.image\s*\?\s*\(?\s*<BreedPhoto\s+src=\{item\.image\}/);
  assert.match(detail, /:\s*\(?\s*<span aria-hidden="true">\s*<PublicMediaFallback \/>\s*<\/span>/);
  assert.match(styles, /\.photoPlaceholder \{[^}]*width: 100%;[^}]*place-items: stretch;/);
  assert.match(shared, /Fotografia sa pripravuje/);
  assert.match(shared, /data-public-media-fallback/);
});

test("BreedPhoto retains real-photo image rendering and replaces broken-image icons with one shared fallback", () => {
  const photo = read("components/breed-photo.tsx");
  assert.match(photo, /"use client"/);
  assert.match(photo, /useState/);
  assert.match(photo, /responsiveMediaSrcSet\(props\.src,/);
  assert.match(photo, /return\s*\(?\s*<img\s+\{\.\.\.props\}/);
  assert.match(photo, /onError=\{\(\)\s*=>\s*setFailed\(String\(props\.src\)\)\}/);
  assert.match(photo, /!props\.src\s*\|\|\s*failed\s*===\s*props\.src/);
  assert.match(
    photo,
    /<PublicMediaFallback\s+size=\{detailFrame \? "detail" : "thumbnail"\}\s+label="Fotografia nie je dostupná"/,
  );
  assert.doesNotMatch(photo, /<PawMark/);
});

test("breed hero retain the established test and image safety contract", () => {
  const detail = read("app/plemena/[slug]/page.tsx");
  assert.match(detail, /data-testid="breed-hero-photo"/);
  assert.match(detail, /data-image-fallback="breed-photo"/);
  assert.match(detail, /Fotografia plemena/);
  const universalHero = read("components/detail-primitives/detail-primitives.tsx");
  assert.match(
    universalHero,
    /\{media \? \([\s\S]*?className=\{styles\.heroMedia\}[\s\S]*?\{media\}[\s\S]*?\) : null\}/,
  );
});

test("BreedPhoto detects failure before hydration and cancels stale fallback updates", async () => {
  const { default: ts } = await import("typescript");
  const jsx = await import("react/jsx-runtime");
  const source = ts.transpileModule(read("components/breed-photo.tsx"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const image of [
    { complete: true, naturalWidth: 0 },
    { complete: false, naturalWidth: 0 },
    { complete: true, naturalWidth: 1280 },
  ]) {
    let failed = null;
    let cleanup;
    let queued;
    const exports = {};
    new Function("require", "exports", "window", source)(
      (name) => {
        if (name === "react")
          return {
            useState: () => [
              failed,
              (value) => {
                failed = value;
              },
            ],
            useRef: () => ({ current: image }),
            useEffect: (effect) => {
              cleanup = effect();
            },
          };
        if (name === "react/jsx-runtime") return jsx;
        if (name.includes("public-media-fallback")) return { PublicMediaFallback: () => null };
        if (name.includes("responsive-media")) return { responsiveMediaSrcSet: () => undefined };
        throw Error(name);
      },
      exports,
      {
        requestAnimationFrame: (callback) => {
          queued = callback;
          return 1;
        },
        cancelAnimationFrame: () => {
          queued = undefined;
        },
      },
    );
    const props = { src: "/media/breeds/dog.jpg", alt: "Pes" };
    assert.equal(exports.BreedPhoto(props).type, "img");
    if (image.complete && image.naturalWidth === 0) {
      assert.equal(typeof queued, "function");
      cleanup();
      assert.equal(queued, undefined, "unmount/source change cancels old update");
      assert.equal(failed, null);
      exports.BreedPhoto(props);
      queued();
      assert.equal(exports.BreedPhoto(props).type, "span", "broken cached image becomes fallback");
      image.complete = false;
      assert.equal(exports.BreedPhoto({ ...props, src: "/media/breeds/new.jpg" }).type, "img");
    } else {
      assert.equal(queued, undefined, "pending and successful images remain visible");
      assert.equal(failed, null);
    }
  }
});
