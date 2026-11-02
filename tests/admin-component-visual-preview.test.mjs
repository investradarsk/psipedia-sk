import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("component preview gallery is inside the existing admin-protected registry route only", () => {
  const route = read("app/admin/komponenty/page.tsx");
  assert.match(route, /requireAdminPageUser\("\/admin\/komponenty"\)/);
  const registry = read("components/admin-component-registry.tsx");
  assert.match(registry, /adminComponentPreviewSamples/);
  assert.match(registry, /<AdminComponentVisualPreview id=\{sample.id\}/);
  assert.match(registry, /inert/);
  assert.match(registry, /aria-hidden="true"/);
  assert.match(registry, /Vzorový obsah/);
});

test("examples use actual reusable public components, not manually invented banner markup", () => {
  const previews = read("components/admin-component-visual-preview.tsx");
  const targets = [
    "public-magazine-banner", "public-context-banner", "public-help-banner",
    "public-photo-callout", "public-article-callout", "content-hub-cta",
    "public-banner-frame",
  ];
  for (const name of targets) {
    assert.match(previews, new RegExp("components/(?:public-visual-system/)?"+name+"\\.tsx"));
  }
  for (const name of [
    "PublicMagazineBanner", "PublicContextBanner", "PublicHelpReportBanner",
    "PublicHelpPhotoBanner", "PublicHelpClosingBanner", "PublicArticleCallout",
    "ContentHubCta", "PublicPhotoCallout",
  ]) assert.match(previews, new RegExp("<"+name+"\\b|<"+name+"\\s"));
  assert.match(previews, /featured: true/);
  assert.doesNotMatch(previews, /fetch\(|localStorage|document\.cookie|onClick|onSubmit/);
});

test("preview route does not expose a public endpoint or change existing front end", () => {
  const preview = read("components/admin-component-visual-preview.tsx");
  assert.match(preview, /preview-only/);
  assert.match(preview, /href="\/adresar"/);
  assert.match(preview, /href="\/plemena"/);
  assert.match(read("components/admin-component-registry.module.css"), /pointer-events: none;/);
});
