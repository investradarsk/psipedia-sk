import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared public gallery preserves uncut native image presentation and mobile grid", () => {
  const src = read("components/public-visual-system/public-photo-gallery.tsx");
  const css = read("components/public-visual-system/public-photo-gallery.module.css");
  const index = read("components/public-visual-system/index.ts");
  assert.ok(index.includes("PublicPhotoGallery"));
  assert.ok(src.includes("export function PublicPhotoGallery"));
  for (const fragment of [
    "data-public-photo-gallery", 'data-photo-fit={fit}', 'alt={image.alt}',
    'loading="lazy"', 'decoding="async"', "maxImages = 6",
    "images.filter((image) => image.src.trim()).slice"
  ]) assert.ok(src.includes(fragment), fragment);
  for (const fragment of [
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
    "aspect-ratio: 4 / 3", "object-fit: contain",
    '@media (max-width: 600px)',
    "grid-template-columns: repeat(2, minmax(0, 1fr))"
  ]) assert.ok(css.includes(fragment), fragment);
  assert.doesNotMatch(src, /"use client"|window\.|localStorage|fetch\(/);
});

test("adoption detail uses the canonical gallery, preserving photo alt and six-image cap", () => {
  const adoption = read("components/adoption-detail.tsx");
  const css = read("components/adoption-detail.module.css");
  assert.ok(adoption.includes("sections.gallery &&"));
  assert.ok(adoption.includes("<PublicPhotoGallery"));
  assert.ok(adoption.includes("dog.gallery.filter(Boolean).slice(0, 6)"));
  assert.ok(adoption.includes("index + 2"));
  assert.ok(adoption.includes("Galéria"));
  assert.doesNotMatch(css, /\.detailGallery\s*\{/);
});


test("gallery photos open full-size images using native accessible links", () => {
  const src = read("components/public-visual-system/public-photo-gallery.tsx");
  const css = read("components/public-visual-system/public-photo-gallery.module.css");

  assert.match(src, /<a[\s\S]*?href=\{href\}/);
  assert.match(src, /const href = \/\^\(\?:https\?:/);
  assert.match(src, /: <span key=\{image\.src/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
  assert.match(src, /aria-label=\{image\.alt \?/);
  assert.match(src, /src=\{image\.src\}/);
  assert.match(src, /alt=\{image\.alt\}/);
  assert.match(css, /\.gallery a:focus-visible \{/);
  assert.match(css, /\.gallery a:hover img,/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(src, /"use client"|window\.open|onClick/);
});

// Exercise the real TSX with React's renderer; CSS module names are identity-mapped.
async function galleryRenderer() {
  const [{ default: ts }, React, { renderToStaticMarkup }] = await Promise.all([
    import("typescript"), import("react"), import("react-dom/server"),
  ]);
  const source = read("components/public-visual-system/public-photo-gallery.tsx");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const jsx = await import("react/jsx-runtime");
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error("Unexpected import " + name);
  }, exports);
  return { React, render: (props) => renderToStaticMarkup(React.createElement(exports.PublicPhotoGallery, props)) };
}

test("preserved gallery variants keep every photo, captions, crop variants and existing link behavior", async () => {
  const { React, render } = await galleryRenderer();
  const images = Array.from({ length: 8 }, (_, index) => ({ src: `/photo-${index}.jpg`, alt: `Pes ${index}` }));
  const linked = render({ images });
  assert.equal((linked.match(/<img /g) ?? []).length, 6);
  assert.equal((linked.match(/<a /g) ?? []).length, 6);
  assert.match(linked, /target="_blank" rel="noopener noreferrer"/);
  assert.equal(render({ images: [] }), "");

  const breed = render({
    images: images.map((image) => ({ ...image, caption: React.createElement("span", null, "Foto: Autor") })),
    variant: "breed", as: "section", label: "Fotografie plemena", maxImages: images.length,
    renderImage: (image) => React.createElement("img", { src: image.src, alt: image.alt, "data-breed-photo": true }),
  });
  assert.match(breed, /<section[^>]*class="breed"[^>]*aria-label="Fotografie plemena"/);
  assert.equal((breed.match(/<figure /g) ?? []).length, 8);
  assert.equal((breed.match(/<figcaption>/g) ?? []).length, 8);
  assert.equal((breed.match(/data-breed-photo="true"/g) ?? []).length, 8);
  assert.doesNotMatch(breed, /<a /);

  const report = render({ images, variant: "report", maxImages: images.length });
  assert.equal((report.match(/<img /g) ?? []).length, 8);
  assert.doesNotMatch(report, /<a |<figure|loading=|decoding=/);

  const editorial = render({ images: [{ ...images[0], size: "wide", caption: "Popis" }], variant: "editorial" });
  assert.match(editorial, /article-block-gallery-item--wide/);
  assert.match(editorial, /data-photo-size="wide"/);
  assert.match(editorial, /loading="lazy" decoding="async"/);
  assert.match(editorial, /<figcaption>Popis<\/figcaption>/);
  assert.doesNotMatch(editorial, /<a /);
});

test("all existing public gallery families use central presentation without local duplicate CSS", () => {
  for (const [path, variant] of [
    ["app/plemena/[slug]/page.tsx", "breed"],
    ["components/lost-found-dog-detail.tsx", "report"],
    ["components/article-blocks.tsx", "editorial"],
  ]) {
    const source = read(path);
    assert.ok(source.includes("<PublicPhotoGallery"), path);
    assert.ok(source.includes(`variant="${variant}"`), path);
    assert.match(source, /maxImages=\{(?:gallery|report\.gallery|block\.images)\.length\}/);
  }
  const css = read("components/public-visual-system/public-photo-gallery.module.css");
  for (const breakpoint of [600, 360, 650, 680]) assert.ok(css.includes(`max-width: ${breakpoint}px`));
  assert.match(css, /repeat\(auto-fit, minmax\(260px, 1fr\)\)/);
  assert.match(css, /\.breed figure[^}]*border-radius: 0/);
  assert.match(css, /\.report img[^}]*border-radius: 9px/);
  assert.match(css, /\.editorial \[data-photo-size="wide"\] img[^}]*aspect-ratio: 16 \/ 9/);
  assert.doesNotMatch(read("app/globals.css"), /\.breed-gallery|\.article-block-gallery/);
  assert.doesNotMatch(read("components/lost-found-dogs.module.css"), /\.gallery/);
});
