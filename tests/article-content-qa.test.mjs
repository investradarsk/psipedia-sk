import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assessArticleContentQa,
  blockerIssues,
} from "../lib/article-content-qa.ts";
import { buildDentalArticleRemediation } from "../lib/article-content-remediation.ts";

function base(overrides = {}) {
  return {
    title: "Bezpečný testovací článok",
    excerpt: "Dostatočne dlhý redakčný perex pre publikačný QA test.",
    intro: "Dostatočne dlhý úvod článku bez interných redakčných poznámok.",
    takeaway: "",
    category: "Život so psom",
    portalSection: "clanky",
    status: "published",
    blocks: [{ id: "body", type: "text", content: "Finálny verejný obsah článku." }],
    sections: [],
    sources: [],
    ...overrides,
  };
}

function codes(payload) {
  return assessArticleContentQa(payload).map((item) => item.code);
}

test("CONTENT-QA placeholder detector catches high-confidence editorial patterns", () => {
  for (const text of [
    "TODO dopísať zdroj",
    "fixme: opraviť",
    "DOPLNIŤ: finálny text",
    "doplnit - zdroj",
    "SEM   DOPLNIŤ: citáciu",
    "PLACEHOLDER",
    "Lorem ipsum dolor sit amet",
    "Po   publikovaní   bude   vhodné prepojiť aj článok Ako spoznať bolesť u psa",
  ]) {
    assert.ok(codes(base({ blocks: [{ id: "body", type: "text", content: text }] })).includes("EDITORIAL_PLACEHOLDER")
      || codes(base({ blocks: [{ id: "body", type: "text", content: text }] })).includes("POST_PUBLISH_EDITORIAL_NOTE"), text);
  }
});

test("CONTENT-QA placeholder detector avoids broad Slovak false positives", () => {
  const issues = assessArticleContentQa(base({
    blocks: [{
      id: "body",
      type: "text",
      content: "Majiteľ môže doplniť vodu podľa potreby. Tento článok môžeme publikovať po bežnej redakčnej kontrole.",
    }],
  }));
  assert.equal(issues.some((item) => item.code === "EDITORIAL_PLACEHOLDER" || item.code === "POST_PUBLISH_EDITORIAL_NOTE"), false);
});

test("CONTENT-QA validates online and offline citations without inventing metadata", () => {
  assert.equal(blockerIssues(assessArticleContentQa(base({
    blocks: [{ id: "source-web", type: "source", label: "WSAVA guideline", url: "https://wsava.org/example" }],
  }))).length, 0);

  assert.equal(blockerIssues(assessArticleContentQa(base({
    blocks: [{ id: "source-offline", type: "source", label: "Veterinárna stomatológia", url: "", note: "Knižná publikácia, 3. vydanie." }],
  }))).length, 0);

  assert.ok(codes(base({ blocks: [{ id: "source-js", type: "source", label: "X", url: "javascript:alert(1)" }] })).includes("SOURCE_URL_UNSAFE"));
  assert.ok(codes(base({ blocks: [{ id: "source-data", type: "source", label: "X", url: "data:text/html,evil" }] })).includes("SOURCE_URL_UNSAFE"));
  assert.ok(codes(base({ blocks: [{ id: "source-empty", type: "source", label: "", url: "https://example.com" }] })).includes("SOURCE_TITLE_REQUIRED"));
  assert.ok(codes(base({ blocks: [{ id: "source-date", type: "source", label: "Zdroj", url: "https://example.com", accessedAt: "neznámy" }] })).includes("SOURCE_ACCESS_DATE_INVALID"));
  assert.ok(codes(base({ blocks: [{ id: "source-offline-empty", type: "source", label: "Kniha", url: "" }] })).includes("SOURCE_IDENTITY_INCOMPLETE"));
});

test("CONTENT-QA reports duplicate citations deterministically", () => {
  assert.ok(codes(base({
    blocks: [
      { id: "source-a", type: "source", label: "WSAVA", url: "https://wsava.org/guideline" },
      { id: "source-b", type: "source", label: "WSAVA duplicate", url: "https://wsava.org/guideline" },
    ],
  })).includes("SOURCE_DUPLICATE"));
});

test("CONTENT-QA validates relation shape, plain-text notes, duplicates and unsafe raw markup", () => {
  assert.ok(codes(base({ blocks: [{ id: "rel", type: "related", title: "Cieľ", href: "https://example.com" }] })).includes("RELATED_TARGET_NOT_INTERNAL"));
  assert.ok(codes(base({ blocks: [{ id: "rel", type: "related", title: "", href: "" }] })).includes("RELATED_TARGET_REQUIRED"));
  assert.ok(codes(base({ blocks: [{ id: "body", type: "text", content: "Súvisiaci článok: Ako vybrať granule bez marketingových mýtov." }] })).includes("PLAIN_TEXT_RELATION_NOTE"));
  assert.ok(codes(base({ blocks: [
    { id: "rel-a", type: "related", title: "Cieľ", href: "/clanky/ciel" },
    { id: "rel-b", type: "related", title: "Cieľ druhýkrát", href: "/clanky/ciel" },
  ] })).includes("RELATED_DUPLICATE"));
  assert.ok(codes(base({ blocks: [{ id: "body", type: "text", content: '<script>alert(1)</script>' }] })).includes("UNSAFE_RAW_MARKUP"));
  assert.ok(codes(base({ blocks: [{ id: "body", type: "text", content: "Tento článok je odborne overené." }] })).includes("UNSUPPORTED_VERIFICATION_CLAIM"));
});

test("CONTENT-QA health content requires a real source but never creates reviewer claims", () => {
  const health = assessArticleContentQa(base({ category: "Zdravie" }));
  assert.ok(health.some((item) => item.code === "HEALTH_SOURCE_REQUIRED" && item.severity === "BLOCKER"));
  assert.ok(health.some((item) => item.code === "HEALTH_DISCLAIMER_RENDERED" && item.severity === "INFO"));
  assert.equal(JSON.stringify(health).includes("Overené"), false);
  assert.equal(JSON.stringify(health).includes("reviewer"), false);
});

test("CONTENT-QA server integration gates publish/scheduled, keeps draft save path and returns structured 422", () => {
  const store = readFileSync("lib/article-store.ts", "utf8");
  const collectionRoute = readFileSync("app/api/admin/articles/route.ts", "utf8");
  const itemRoute = readFileSync("app/api/admin/articles/[id]/route.ts", "utf8");
  const editor = readFileSync("components/admin-article-editor.tsx", "utf8");

  assert.match(store, /status === "published" \|\| status === "scheduled"/);
  assert.match(store, /throw new ArticlePublishIntegrityError\(qaIssues\)/);
  assert.match(collectionRoute, /status: 422/);
  assert.match(itemRoute, /status: 422/);
  assert.match(collectionRoute, /issues: error\.issues/);
  assert.match(itemRoute, /issues: error\.issues/);
  assert.match(editor, /Chýbajú povinné údaje/);
  assert.match(editor, /Koncept môžeš ďalej ukladať/);
  assert.doesNotMatch(editor, />Overené</);
});

test("CONTENT-QA public renderer keeps safe clickable online sources and visible offline citations", () => {
  const renderer = readFileSync("components/article-blocks.tsx", "utf8");
  assert.match(renderer, /safeHref\(source\.url\) \|\| block\.note/);
  assert.match(renderer, /href \? <a href=\{href\}/);
  assert.match(renderer, /: <span>\{source\.label\}<\/span>/);
  assert.match(renderer, /rel="noreferrer"/);
});


test("CONTENT-QA dental remediation is exact, canonical-rich-text-safe and idempotent", () => {
  const input = {
    sections: [{
      heading: "Dentálna hygiena",
      paragraphs: [
        "Verejný text zostáva.",
        "Súvisiaca podsekcia: Hygiena šteniatka.",
      ],
      bullets: [],
    }],
    blocks: [
      { id: "note", type: "text", content: "po publikovaní bude vhodné prepojiť aj článok Ako spoznať bolesť u psa" },
      { id: "nutrition", type: "text", content: "Súvisiaci článok: Ako vybrať granule bez marketingových mýtov." },
      { id: "keep", type: "text", content: "Legitímna veta: používateľ môže doplniť vodu." },
    ],
    relatedNutritionArticleHref: "/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov",
  };
  const first = buildDentalArticleRemediation(input);
  assert.equal(first.changed, true);
  assert.equal(first.removedEditorialNotes.length, 3);
  assert.equal(first.blocks.some((block) => block.id === "note"), false);
  assert.equal(first.blocks.some((block) => block.id === "nutrition"), false);
  assert.equal(first.blocks.some((block) => block.type === "related" && block.href === input.relatedNutritionArticleHref), true);
  assert.equal(first.blocks.some((block) => block.type === "text" && block.content.includes("doplniť vodu")), true);

  const second = buildDentalArticleRemediation({
    sections: first.sections,
    blocks: first.blocks,
    relatedNutritionArticleHref: input.relatedNutritionArticleHref,
  });
  assert.equal(second.changed, false);
  assert.equal(second.addedRelatedArticle, false);
  assert.deepEqual(second.blocks, first.blocks);
});

test("CONTENT-QA dental remediation never invents a missing canonical target", () => {
  const result = buildDentalArticleRemediation({
    sections: [],
    blocks: [{ id: "nutrition", type: "text", content: "Súvisiaci článok: Ako vybrať granule bez marketingových mýtov." }],
    relatedNutritionArticleHref: null,
  });
  assert.equal(result.addedRelatedArticle, false);
  assert.ok(result.manualRequired.some((item) => item.includes("nebol automaticky pridaný")));
});
