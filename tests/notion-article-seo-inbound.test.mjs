import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_NOTION_SEO_PROPERTIES,
  articleSeoFromNotion,
} from "../lib/notion-article-seo-properties.ts";

const rich = (value) => ({
  type: "rich_text",
  rich_text: [{ plain_text: value, text: { content: value } }],
});
const url = (value) => ({ type: "url", url: value });
const bool = (value) => ({ type: "checkbox", checkbox: value });
const seoPage = (data) => ({
  properties: Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      const { name, type } = ARTICLE_NOTION_SEO_PROPERTIES[key];
      return [name, type === "rich_text" ? rich(value)
        : type === "url" ? url(value) : bool(value)];
    }),
  ),
});

test("all eight populated Notion SEO properties flow into the canonical Admin payload", () => {
  const page = seoPage({
    seoTitle: "Titulok z Notionu",
    metaDescription: "Opis pre vyhľadávače",
    focusKeyword: "pes",
    canonicalUrl: "https://psipedia.sk/clanky/test",
    noindex: true,
    ogTitle: "Nový OG titulok",
    ogDescription: "Nový OG popis",
    ogImageUrl: "https://psipedia.sk/media/articles/test.webp",
  });
  const actual = articleSeoFromNotion(page, {
    seo: {
      title: "Starý titulok",
      description: "Starý popis",
      focusKeyword: "staré",
      canonicalUrl: "https://psipedia.sk/clanky/stare",
      noindex: false,
      ogTitle: "Starý OG",
      ogDescription: "Starý OG popis",
      ogImage: "/media/articles/old.webp",
    },
    ogImageKey: "articles/old.webp",
  });
  assert.deepEqual(actual, {
    seoTitle: "Titulok z Notionu",
    metaDescription: "Opis pre vyhľadávače",
    focusKeyword: "pes",
    canonicalUrl: "https://psipedia.sk/clanky/test",
    noindex: true,
    ogTitle: "Nový OG titulok",
    ogDescription: "Nový OG popis",
    ogImageUrl: "https://psipedia.sk/media/articles/test.webp",
    ogImageKey: null,
  });
});

test("new draft uses sensible SEO defaults without requiring optional fields", () => {
  const actual = articleSeoFromNotion(seoPage({
    seoTitle: "SEO nadpis",
    metaDescription: "SEO opis",
    focusKeyword: "šteniatka",
    noindex: false,
  }));
  assert.deepEqual(actual, {
    seoTitle: "SEO nadpis",
    metaDescription: "SEO opis",
    focusKeyword: "šteniatka",
    canonicalUrl: "",
    noindex: false,
    ogTitle: "SEO nadpis",
    ogDescription: "SEO opis",
    ogImageUrl: null,
    ogImageKey: null,
  });
});

test("blank columns on an already published article preserve the current Admin SEO", () => {
  const old = {
    seo: {
      title: "Existujúci title",
      description: "Existujúci popis",
      focusKeyword: "labrador",
      canonicalUrl: "https://psipedia.sk/clanky/labrador",
      noindex: true,
      ogTitle: "Pôvodný OG title",
      ogDescription: "Pôvodný OG popis",
      ogImage: "/media/articles/labrador-og.webp",
    },
    ogImageKey: "articles/labrador-og.webp",
  };
  const blank = seoPage({
    seoTitle: "", metaDescription: "", focusKeyword: "",
    canonicalUrl: null, noindex: false,
    ogTitle: "", ogDescription: "", ogImageUrl: null,
  });
  assert.deepEqual(articleSeoFromNotion(blank, old), {
    seoTitle: old.seo.title,
    metaDescription: old.seo.description,
    focusKeyword: old.seo.focusKeyword,
    canonicalUrl: old.seo.canonicalUrl,
    noindex: true,
    ogTitle: old.seo.ogTitle,
    ogDescription: old.seo.ogDescription,
    ogImageUrl: old.seo.ogImage,
    ogImageKey: old.ogImageKey,
  });
});

test("updating only one SEO field cannot wipe unrelated fields or their R2 key", () => {
  const old = {
    seo: {
      title: "Admin title", description: "Admin meta",
      canonicalUrl: "https://psipedia.sk/clanky/unchanged",
      noindex: false,
      ogTitle: "Admin OG title", ogDescription: "Admin OG description",
      ogImage: "/media/articles/keep.webp",
    },
    ogImageKey: "articles/keep.webp",
  };
  const seo = articleSeoFromNotion(seoPage({ ogDescription: "Zmenený OG popis" }), old);
  assert.equal(seo.ogDescription, "Zmenený OG popis");
  assert.equal(seo.canonicalUrl, old.seo.canonicalUrl);
  assert.equal(seo.ogTitle, old.seo.ogTitle);
  assert.equal(seo.ogImageUrl, old.seo.ogImage);
  assert.equal(seo.ogImageKey, old.ogImageKey);
});

test("rich text with multiple Notion chunks preserves its complete SEO value", () => {
  const page = { properties: {
    "SEO title": { type: "rich_text", rich_text: [
      { plain_text: "Dlhší " }, { text: { content: "titulok" } },
    ] },
  } };
  assert.equal(articleSeoFromNotion(page).seoTitle, "Dlhší titulok");
});
