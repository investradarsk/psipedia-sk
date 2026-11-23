import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const atlas = source("app/plemena/page.tsx");
const browser = source("components/breed-browser.tsx");
const store = source("lib/article-store.ts");
const detail = source("app/plemena/[slug]/page.tsx");
const archive = source("app/clanky/plemena/page.tsx");
const collection = source("components/breed-article-collection.tsx");

test("atlas previews three breed articles after the club banner in the results column", () => {
  assert.match(atlas, /category: "Plemená", limit: 3/);
  assert.match(atlas, /<BreedBrowser[\s\S]*groupArticles=\{groupArticles\}/);
  const banner = atlas.indexOf('title="Nájdi klub svojho plemena"');
  const section = atlas.indexOf('id="clanky-o-plemenach"');
  const browserEnd = atlas.indexOf('</BreedBrowser>');
  assert.ok(banner >= 0 && section > banner, "articles follow club banner");
  assert.match(atlas, /href="\/clanky\/plemena"/);
  assert.doesNotMatch(atlas.slice(atlas.indexOf('className="breed-atlas-footer"')), /id="clanky-o-plemenach"/);
});

test("FCI group previews derive from persistent breed relation, not headline guesses", () => {
  assert.match(store, /FROM breed_article_relations r/);
  assert.match(store, /JOIN managed_breeds b ON b\.id = r\.breed_id/);
  assert.match(store, /b\.status = 'published'/);
  assert.match(store, /PARTITION BY linked\.fci_group/);
  assert.match(store, /a\.category = 'Plemená'/);
  assert.match(browser, /articles=\{groupArticles\[group\.number\] \?\? \[\]\}/);
  assert.match(browser, /href=\{`\/clanky\/plemena\?fciGroup=\$\{group\.number\}`\}/);
  assert.match(collection, /if \(!articles\.length\) return null/);
  assert.match(collection, /limit=\{3\}/);
  assert.match(collection, /<EditorialTopicArticleGrid/);
});

test("SQLite ranks each FCI group separately, excludes drafts and de-duplicates relations", () => {
  const sql = store.match(/const rows = await database\.prepare\(`([\s\S]*?)`\)\.bind\(new Date\(\)\.toISOString\(\), safeLimit\)/)?.[1];
  assert.ok(sql, "group teaser query is inspectable");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE breed_article_relations (article_id INTEGER, breed_id INTEGER);
      CREATE TABLE managed_breeds (id INTEGER, fci_group INTEGER, status TEXT);
      CREATE TABLE managed_articles (id INTEGER, slug TEXT, category TEXT, portal_section TEXT, status TEXT, published_at TEXT);
    `);
    const breeds = db.prepare("INSERT INTO managed_breeds VALUES (?,?,?)");
    breeds.run(1,1,"published"); breeds.run(2,1,"published"); breeds.run(3,8,"published"); breeds.run(4,6,"draft");
    const article = db.prepare("INSERT INTO managed_articles VALUES (?,?,?,?,?,?)");
    for (let id=1;id<=5;id++) article.run(id,"article-"+id,"Plemená","clanky","published",`2026-11-0${id}T12:00:00Z`);
    article.run(6,"draft","Plemená","clanky","draft","2026-11-06T12:00:00Z");
    article.run(7,"general","Výcvik","clanky","published","2026-11-07T12:00:00Z");
    const link = db.prepare("INSERT INTO breed_article_relations VALUES (?,?)");
    link.run(1,1); link.run(1,2); link.run(2,1); link.run(3,1); link.run(4,1);
    link.run(5,3); link.run(6,1); link.run(7,1); link.run(5,4);
    const query = sql
      .replace("${PUBLIC_ARTICLE_SUMMARY_COLUMNS}","slug, category")
      .replace("${imageColumns}","id");
    const result = db.prepare(query).all("2026-11-23T00:00:00Z",3);
    assert.deepEqual(result.map(x=>[x.fci_group,x.slug]),[
      [1,"article-4"],[1,"article-3"],[1,"article-2"],[8,"article-5"],
    ]);
  } finally { db.close(); }
});

test("new breed editorial archive has search, FCI filter and true server pagination", () => {
  assert.match(archive, /path: "\/clanky\/plemena"/);
  assert.match(archive, /getPublishedBreedArticleArchivePage/);
  assert.match(archive, /name="q"/);
  assert.match(archive, /fciGroups\.map/);
  assert.match(archive, /aria-current=\{fciGroup === group\.number/);
  assert.match(archive, /hasPrevious/);
  assert.match(archive, /hasNext/);
  assert.match(store, /SELECT COUNT\(\*\) AS count FROM managed_articles a/);
  assert.match(store, /FROM managed_articles a WHERE \$\{where\}/);
  assert.match(store, /LIMIT \? OFFSET \?/);
  assert.match(store, /r\.article_id = a\.id AND b\.status = 'published' AND b\.fci_group = \?/);
});

test("breed detail has matching article cards after desktop and mobile facts, not as a full-width footer", () => {
  const desktop = detail.indexOf('{relatedArticleCard("desktop")}');
  const facts = detail.indexOf('className={styles.desktopFacts}');
  const promo = detail.indexOf('<ArticlePromo promoKey="veterinari"');
  const mobile = detail.indexOf('{relatedArticleCard("mobile")}');
  const mobileFacts = detail.indexOf('className={styles.mobileFacts}');
  const ratings = detail.indexOf('{ratings.length ? (');
  assert.ok(facts >= 0 && desktop > facts && promo > desktop);
  assert.ok(mobileFacts >= 0 && mobile > mobileFacts && ratings > mobile);
  assert.ok(detail.indexOf('id={`suvisiaci-obsah-${placement}`}') >= 0);
  assert.doesNotMatch(detail.slice(detail.indexOf('        </PublicHelpProfileDetailLayout>')), /relatedArticles\.map/);
});
