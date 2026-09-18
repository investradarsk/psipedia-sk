import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITORIAL_RICH_TEXT_VERSION,
  editorialRichTextPlainText,
  legacyRichTextToDocument,
  normalizeEditorialRichText,
  sanitizeEditorialHref,
} from "../lib/editorial-content.ts";
import { normalizeEditorialExternalVideo } from "../lib/editorial-video.ts";
import { resolveArticleAuthorSelection } from "../lib/editorial-authors.ts";

function authorRow(overrides = {}) {
  return {
    id: 1,
    slug: "redakcia-psipedia",
    kind: "team",
    display_name: "Redakcia Psipedia",
    avatar_url: null,
    short_bio: "",
    role: "Redakcia",
    is_active: 1,
    is_default: 1,
    ...overrides,
  };
}

function fakeAuthorDatabase(rows) {
  return {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...nextBindings) {
          bindings = nextBindings;
          return statement;
        },
        async first() {
          if (sql.includes("WHERE id = ?")) {
            const id = Number(bindings[0]);
            const row = rows.find((item) => item.id === id);
            if (!row) return null;
            if (sql.includes("is_active = 1") && !row.is_active) return null;
            return row;
          }
          if (sql.includes("is_default = 1")) {
            return rows.find((item) => item.is_active && item.is_default) ?? null;
          }
          return null;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

test("rich-text v1 covers the WYSIWYG-safe minimum without raw HTML nodes", () => {
  const document = legacyRichTextToDocument([
    "## Nadpis",
    "",
    "Odstavec s **tučným**, _kurzívou_ a [odkazom](https://psipedia.sk/clanky).",
    "druhý riadok",
    "",
    "- prvá položka",
    "- druhá položka",
    "",
    "1. prvá",
    "2. druhá",
    "",
    "> bezpečný citát",
  ].join("\n"));

  assert.equal(document.version, EDITORIAL_RICH_TEXT_VERSION);
  assert.equal(document.type, "doc");
  assert.ok(document.content.some((block) => block.type === "heading" && block.level === 2));
  assert.ok(document.content.some((block) => block.type === "paragraph"));
  assert.ok(document.content.some((block) => block.type === "bulletList"));
  assert.ok(document.content.some((block) => block.type === "orderedList"));
  assert.ok(document.content.some((block) => block.type === "blockquote"));
  assert.match(editorialRichTextPlainText(document), /tučným/);
  assert.match(editorialRichTextPlainText(document), /druhý riadok/);

  const paragraph = document.content.find((block) => block.type === "paragraph");
  assert.ok(paragraph && paragraph.type === "paragraph");
  const marks = paragraph.content.flatMap((node) => node.type === "text" ? node.marks ?? [] : []);
  assert.ok(marks.some((mark) => mark.type === "bold"));
  assert.ok(marks.some((mark) => mark.type === "italic"));
  assert.ok(marks.some((mark) => mark.type === "link"));
  assert.ok(paragraph.content.some((node) => node.type === "hardBreak"));
});

test("rich-text normalizer drops script-like nodes, arbitrary HTML nodes and malicious hrefs", () => {
  const normalized = normalizeEditorialRichText({
    version: 1,
    type: "doc",
    content: [
      { type: "script", content: [{ type: "text", text: "alert(1)" }] },
      { type: "iframe", src: "https://evil.example" },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "<script>alert(1)</script>" },
          { type: "text", text: "bad link", marks: [{ type: "link", href: "javascript:alert(1)" }] },
          { type: "text", text: "good link", marks: [{ type: "link", href: "https://psipedia.sk" }] },
        ],
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.content.length, 1);
  assert.equal(normalized.content[0].type, "paragraph");
  assert.equal(editorialRichTextPlainText(normalized), "<script>alert(1)</script> bad link good link");
  const paragraph = normalized.content[0];
  assert.ok(paragraph.type === "paragraph");
  const bad = paragraph.content.find((node) => node.type === "text" && node.text === "bad link");
  const good = paragraph.content.find((node) => node.type === "text" && node.text === "good link");
  assert.deepEqual(bad?.type === "text" ? bad.marks : undefined, undefined);
  assert.deepEqual(good?.type === "text" ? good.marks : undefined, [{ type: "link", href: "https://psipedia.sk/" }]);

  assert.equal(sanitizeEditorialHref("javascript:alert(1)"), "");
  assert.equal(sanitizeEditorialHref("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(sanitizeEditorialHref("//evil.example"), "");
  assert.equal(sanitizeEditorialHref("/bezpecna-cesta"), "/bezpecna-cesta");
});

test("video contract only produces iframe metadata for allowlisted HTTPS providers", () => {
  const youtube = normalizeEditorialExternalVideo({
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Ukážka",
    caption: "Popis videa",
  });
  assert.ok(youtube);
  assert.equal(youtube.provider, "youtube");
  assert.equal(youtube.videoId, "dQw4w9WgXcQ");
  assert.equal(youtube.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(youtube.caption, "Popis videa");

  const vimeo = normalizeEditorialExternalVideo({ url: "https://vimeo.com/123456789" });
  assert.ok(vimeo);
  assert.equal(vimeo.provider, "vimeo");
  assert.equal(vimeo.embedUrl, "https://player.vimeo.com/video/123456789");

  assert.equal(normalizeEditorialExternalVideo({ url: "http://youtube.com/watch?v=dQw4w9WgXcQ" }), null);
  assert.equal(normalizeEditorialExternalVideo({ url: "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ" }), null);
  assert.equal(normalizeEditorialExternalVideo({ url: "javascript:alert(1)" }), null);
  assert.equal(normalizeEditorialExternalVideo({ url: "<iframe src=\"https://youtube.com/embed/dQw4w9WgXcQ\"></iframe>" }), null);
});

test("author selection supports canonical default, explicit active profile and legacy fallback", async () => {
  const database = fakeAuthorDatabase([
    authorRow(),
    authorRow({
      id: 2,
      slug: "martin",
      kind: "individual",
      display_name: "Martin",
      role: "Autor",
      is_default: 0,
    }),
    authorRow({
      id: 3,
      slug: "inactive",
      kind: "external",
      display_name: "Neaktívny autor",
      is_active: 0,
      is_default: 0,
    }),
  ]);

  assert.deepEqual(
    await resolveArticleAuthorSelection(database, { legacyAuthor: "Redakcia Psipedia" }),
    { authorProfileId: 1, author: "Redakcia Psipedia" },
  );
  assert.deepEqual(
    await resolveArticleAuthorSelection(database, { authorProfileId: 2, legacyAuthor: "Starý text" }),
    { authorProfileId: 2, author: "Martin" },
  );
  assert.deepEqual(
    await resolveArticleAuthorSelection(database, { legacyAuthor: "Externý autor bez profilu" }),
    { authorProfileId: null, author: "Externý autor bez profilu" },
  );
  await assert.rejects(
    () => resolveArticleAuthorSelection(database, { authorProfileId: 3 }),
    /neexistuje alebo nie je aktívny/,
  );
});

test("article storage keeps legacy compatibility while making takeaway and generic sources optional", () => {
  const store = readFileSync("lib/article-store.ts", "utf8");
  const detail = readFileSync("components/article-detail.tsx", "utf8");
  const editor = readFileSync("components/admin-article-editor.tsx", "utf8");

  assert.match(store, /parseRichTextDocument\(row\.intro_rich_text_json, row\.intro\)/);
  assert.match(store, /parseRichTextDocument\(row\.takeaway_rich_text_json, row\.takeaway\)/);
  assert.match(store, /author_profile_id/);
  assert.match(store, /payload\.intro\?\.trim\(\) \|\| editorialRichTextPlainText\(suppliedIntroRichText\)/);
  assert.match(store, /getEditorialAuthorProfile\(database, existingAuthorProfileId, false\)/);
  assert.doesNotMatch(store, /takeaway\.length\s*</);
  assert.match(store, /portalSection === "novinky" && status !== "draft" && !sources\.length/);
  assert.match(detail, /showTakeaway && <aside className="takeaway-box"/);
  assert.match(editor, /To najdôležitejšie <small>nepovinné<\/small>/);
  assert.doesNotMatch(editor, /id="article-takeaway"[^\n>]*required/);
});

test("migration is forward-only and preserves legacy article author/text columns", () => {
  const migration = readFileSync("drizzle/0043_editorial_content_foundation.sql", "utf8");
  assert.match(migration, /CREATE TABLE editorial_author_profiles/);
  assert.match(migration, /ADD COLUMN author_profile_id INTEGER REFERENCES editorial_author_profiles\(id\) ON DELETE SET NULL/);
  assert.match(migration, /ADD COLUMN intro_rich_text_json TEXT/);
  assert.match(migration, /ADD COLUMN takeaway_rich_text_json TEXT/);
  assert.match(migration, /redakcia-psipedia/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+managed_articles/i);
  assert.doesNotMatch(migration, /UPDATE\s+managed_articles/i);
});

test("canonical body blocks can be saved without legacy textarea strings", () => {
  const blocks = readFileSync("lib/article-blocks.ts", "utf8");
  assert.match(blocks, /legacyContent \|\| editorialRichTextPlainText\(richText\)/);
});

test("shared renderer never accepts raw HTML injection APIs", () => {
  const renderer = readFileSync("components/editorial-rich-text.tsx", "utf8");
  const videoRenderer = readFileSync("components/article-blocks.tsx", "utf8");
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.match(videoRenderer, /normalizeEditorialExternalVideo/);
  assert.doesNotMatch(videoRenderer, /srcDoc=/);
});
