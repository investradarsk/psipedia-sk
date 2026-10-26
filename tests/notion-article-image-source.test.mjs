import test from "node:test";
import assert from "node:assert/strict";
import { notionArticleMainImageSource } from "../lib/notion-article-image-source.ts";

test("Notion hero chooses uploaded file when no canonical URL exists", () => {
  const page = { properties: {
    "Hlavný obrázok URL": { url: null },
    "Titulný obrázok": { files: [
      { id: "file-123", type: "file", file: { url: "https://notion-static.example/signed?token=1" } },
    ] },
  }};
  const first = notionArticleMainImageSource(page);
  assert.equal(first.kind, "file");
  assert.equal(first.fileIdentity, "notion-file:file-123");
  page.properties["Titulný obrázok"].files[0].file.url = "https://notion-static.example/signed?token=2";
  const second = notionArticleMainImageSource(page);
  assert.equal(second.identity, first.identity, "signed URL refresh must be idempotent");
  assert.notEqual(second.url, first.url, "each sync fetches the fresh signed URL");
});

test("the existing URL remains authoritative and backwards compatible", () => {
  const source = notionArticleMainImageSource({ properties: {
    "Hlavný obrázok URL": { url: "https://example.org/canonical.jpg" },
    "Titulný obrázok": { files: [
      { id: "file-123", type: "file", file: { url: "https://notion-static.example/older.jpg" } },
    ] },
  } });
  assert.deepEqual(source, {
    url: "https://example.org/canonical.jpg",
    identity: "https://example.org/canonical.jpg",
    fileIdentity: null,
    kind: "url",
  });
});

test("missing files leave the article hero optional", () => {
  assert.equal(notionArticleMainImageSource({ properties: {} }).kind, "none");
  assert.equal(notionArticleMainImageSource({ properties: { "Titulný obrázok": { files: [] } } }).kind, "none");
});

test("uploaded image fields fail closed on invalid multi-file or unsigned input", () => {
  const noId = { properties: { "Titulný obrázok": { files: [
    { type: "file", file: { url: "https://a.example/photos/dog.jpg?token=1" } },
  ] } } };
  const first = notionArticleMainImageSource(noId);
  noId.properties["Titulný obrázok"].files[0].file.url = "https://a.example/photos/dog.jpg?token=2";
  assert.equal(notionArticleMainImageSource(noId).identity, first.identity,
    "fall back to stable origin + pathname if the Notion file has no ID");
  assert.throws(() => notionArticleMainImageSource({ properties: {
    "Titulný obrázok": { files: [{ id:"x", type: "file", file: { url: "http://a.example/a" } }] },
  }}), /HTTPS/);
  assert.throws(() => notionArticleMainImageSource({ properties: {
    "Titulný obrázok": { files: [{ id: "a" }, { id: "b" }] },
  }}), /presne jeden/);
});

test("Notion external Files-media fallback is supported", () => {
  const image = notionArticleMainImageSource({ properties: { "Titulný obrázok": {
    files: [{ type: "external", external: { url: "https://example.org/dog.webp" } }],
  } }});
  assert.equal(image.identity, "notion-external:https://example.org/dog.webp");
});
