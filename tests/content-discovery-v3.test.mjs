import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArticleContinuation } from "../lib/article-continuation.ts";
import { resolveContentHubCta, resolveContentHubNextAction } from "../lib/content-hub-context-cta.ts";

const fixture = (overrides = {}) => ({
  slug: "sample",
  title: "Ukážkový článok",
  category: "Výcvik",
  portalSection: "steniatka",
  portalSubpage: "pred-kupou-psa",
  blocks: [],
  ...overrides,
});
const next = (article = fixture(), extra = {}) =>
  resolveArticleContinuation({
    article,
    topicHref: `/${article.portalSection ?? "clanky"}/${article.portalSubpage ?? "tema"}`,
    topicLabel: "Pred kúpou psa",
    ...extra,
  });
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("article next step reuses curated destination without creating an extra feed CTA", () => {
  assert.deepEqual(next(), {
    href: "/plemena/vyber-plemena",
    label: "Pomoc s výberom plemena",
    context: "cross-section",
  });
  assert.equal(resolveContentHubCta({ section: "steniatka", topic: "pred-kupou-psa", visibleArticleCount: 2 }), null);
  assert.equal(resolveContentHubNextAction({ section: "steniatka", topic: "pred-kupou-psa" })?.href, "/plemena/vyber-plemena");
});

test("manual article destinations and existing recommendations suppress duplicate links", () => {
  assert.equal(next(fixture({ blocks: [
    { id: "r", type: "related", href: "/plemena/vyber-plemena", title: "Výber plemena" },
  ] })).context, "topic");
  assert.equal(next(fixture(), { relatedHrefs: ["/plemena/vyber-plemena?from=related"] }).context, "topic");
  assert.equal(next(fixture({ portalSubpage: "vyber-chovatela", blocks: [
    { id: "p", type: "psipedia-promo", promoKey: "chovatelske-stanice", variant: "auto" },
  ] })).context, "topic");
  assert.equal(next(fixture({ portalSubpage: "socializacia" }), { sidebarPromoKey: "treneri" }).context, "topic");
  assert.equal(next(fixture({ blocks: [
    { id: "r", type: "related", href: "/steniatka/pred-kupou-psa", title: "Téma" },
  ] }), { relatedHrefs: ["/plemena/vyber-plemena"] }), null);
});

test("unmapped articles return to the existing topic, never a global map promo", () => {
  assert.deepEqual(next(fixture({ portalSubpage: "neznama-tema" })), {
    href: "/steniatka/neznama-tema", label: "Viac z témy Pred kúpou psa", context: "topic",
  });
  assert.equal(next(fixture({ portalSubpage: undefined }), {
    topicHref: "/tema/vycvik", topicLabel: "Výcvik",
  })?.href, "/tema/vycvik");
  assert.equal(next(fixture({ portalSubpage: "neznama-tema" }), { topicHref: "/steniatka/sample" }), null);
  assert.equal(next(fixture(), { topicHref: "https://example.com", relatedHrefs: ["/plemena/vyber-plemena"] }), null);
});

test("public article integration stays single-slot and does not restore related/latest sidebar", () => {
  const detail = source("components/article-detail.tsx");
  const component = source("components/article-continuation.tsx");
  const css = source("components/article-continuation.module.css");
  assert.equal((detail.match(/<ArticleContinuation\b/g) ?? []).length, 1);
  assert.match(detail, /<ArticlePopularitySidebar/);
  assert.match(detail, /data-automatic-article-promo/);
  assert.doesNotMatch(detail, /Najnovšie články|Súvisiace články/);
  assert.match(component, /data-content-discovery-v3/);
  assert.match(component, /aria-label="Pokračovanie po článku"/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(source("components/portal-hub.tsx"), /data-content-discovery-v3/);
});
