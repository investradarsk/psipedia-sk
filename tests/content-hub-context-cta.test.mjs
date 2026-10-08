import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getArticlePromoTarget } from "../lib/article-promo.ts";
import { resolveContentHubCta } from "../lib/content-hub-context-cta.ts";

const select = (section, topic, visibleArticleCount = 9, extra = {}) =>
  resolveContentHubCta({ section, topic, visibleArticleCount, ...extra });
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("health CTA preserves exact emergency copy and two canonical routes", () => {
  const cta = select("starostlivost", "zdravie");
  assert.equal(cta.key, "health-urgent");
  assert.equal(cta.headline, "Keď ide o čas");
  assert.equal(cta.lead, "Má pes akútny problém?");
  assert.equal(cta.text, "Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.");
  assert.deepEqual(cta.actions.map((a) => a.href), [
    "/starostlivost/kedy-ist-so-psom-k-veterinarovi", "/adresar/veterinari",
  ]);
  assert.deepEqual(cta.actions.map((a) => a.role), ["primary", "secondary"]);
});

test("puppy, training and care context maps use real canonical destinations", () => {
  assert.equal(select("steniatka", "pred-kupou-psa").actions[0].href, "/plemena/vyber-plemena");
  assert.equal(select("steniatka", "vyber-plemena").actions[0].href, "/porovnat-plemena");
  assert.equal(select("steniatka", "vyber-chovatela").actions[0].href, getArticlePromoTarget("chovatelske-stanice").href);
  assert.equal(select("steniatka", "prve-dni").actions[0].href, getArticlePromoTarget("veterinari").href);
  assert.equal(select("steniatka", "socializacia").actions[0].href, getArticlePromoTarget("treneri").href);
  assert.equal(select("steniatka", "krmenie").actions[0].href, "/starostlivost/vyziva");
  assert.equal(select("aktivity", "trening").actions[0].href, getArticlePromoTarget("treneri").href);
  assert.equal(select("aktivity", "psie-sporty").actions[0].href, getArticlePromoTarget("kynologicke-kluby").href);
  assert.equal(select("starostlivost", "vyziva").actions[0].href, getArticlePromoTarget("veterinari").href);
  assert.equal(select("starostlivost", "srst-a-hygiena").actions[0].href, getArticlePromoTarget("salony").href);
  for (const [section, topic] of [["novinky", "veda-a-zdravie"], ["aktivity", "vylety-so-psom"], ["steniatka", "vyziva"]]) {
    assert.equal(select(section, topic), null, `${section}/${topic}`);
  }
});

test("bounded frequency never inserts in short feeds except safety and never replaces pillar", () => {
  assert.equal(select("steniatka", "prve-dni", 3), null);
  assert.equal(select("steniatka", "prve-dni", 4).afterArticleCount, 3);
  assert.equal(select("steniatka", "prve-dni", 18).afterArticleCount, 3);
  assert.equal(select("starostlivost", "zdravie", 1).afterArticleCount, 1);
  assert.equal(select("starostlivost", "zdravie", 0), null);
});

test("sidebar or manual promo on same destination removes duplicate inline links", () => {
  const health = select("starostlivost", "zdravie", 5, { sidebarPromoKey: "veterinari" });
  assert.deepEqual(health.actions.map((a) => a.href), ["/starostlivost/kedy-ist-so-psom-k-veterinarovi"]);
  assert.equal(select("steniatka", "socializacia", 6, { sidebarPromoKey: "treneri" }), null);
  assert.equal(select("steniatka", "socializacia", 6, { occupiedPromoKeys: ["treneri"] }), null);
  assert.equal(select("steniatka", "pred-kupou-psa", 6, { occupiedHrefs: ["/plemena/vyber-plemena?source=sidebar"] }), null);
  assert.equal(new Set(select("starostlivost", "zdravie", 5).actions.map((a) => a.href)).size, 2);
});

test("CTA stays inside original article feed and keeps existing ArticleListItem/pillar", () => {
  const section = read("components/editorial-section.tsx");
  const cta = read("components/content-hub-cta.tsx");
  const css = read("components/content-hub-cta.module.css");
  assert.match(section, /data-content-hub-pillar/);
  assert.match(section, /<ArticleCard article=\{pillar\}/);
  assert.match(section, /<ArticleListItem article=\{article\}/);
  assert.match(section, /contextualCta\?\.afterArticleCount === index \+ 1/);
  assert.match(section, /contextualCta=\{contextualCta\}/);
  assert.match(section, /<HealthUrgent cta=\{contextualCta\}/);
  assert.doesNotMatch(section, /<PageContainer className=\{styles.calloutShell\}><HealthUrgent/);
  assert.match(cta, /data-contextual-hub-cta/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
