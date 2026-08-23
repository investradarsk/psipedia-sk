import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /Psipedia je viac než magazín/);
  assert.match(html, /Šteniatka/);
  assert.match(html, /Pomoc psom/);
  assert.match(html, /Jedno miesto pre celý život so psom/);
  assert.match(html, /Portál, ktorý sa hýbe s komunitou/);
  assert.match(html, /Kalendár práve dopĺňame/);
  assert.match(html, /Vyber si, koho hľadáš/);
  assert.match(html, /Žiadna otvorená výzva/);
  assert.match(html, /Čo sa deje vo svete psov/);
  assert.match(html, /Prvé overené správy pripravujeme/);
});

test("renders the news portal and stable topic URLs without published news", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("news-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const news = await worker.fetch(new Request("http://localhost/novinky", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(news.status, 200);
  const newsHtml = await news.text();
  assert.match(newsHtml, /Novinky zo sveta psov/);
  assert.match(newsHtml, /Záchrana a hrdinovia/);
  assert.match(newsHtml, /Veda a zdravie/);
  assert.match(newsHtml, /Pracovné a záchranárske psy/);
  assert.match(newsHtml, /Najprv overiť, potom zdieľať/);

  const science = await worker.fetch(new Request("http://localhost/novinky/veda-a-zdravie", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(science.status, 200);
  const scienceHtml = await science.text();
  assert.match(scienceHtml, /Čo nový objav naozaj znamená/);
  assert.match(scienceHtml, /Prvú overenú správu pripravujeme/);
});

test("renders the community news-tip workflow on its own stable URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("news-tip-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const news = await worker.fetch(new Request("http://localhost/novinky", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(news.status, 200);
  const newsHtml = await news.text();
  assert.match(newsHtml, /Pošli tip/);
  assert.match(newsHtml, /Komunita vidí viac/);

  const tipPage = await worker.fetch(new Request("http://localhost/novinky/poslat-tip", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(tipPage.status, 200);
  const tipHtml = await tipPage.text();
  assert.match(tipHtml, /Pošli tip Psipedii/);
  assert.match(tipHtml, /Čo by sme mali preveriť/);
  assert.match(tipHtml, /Odoslať tip redakcii/);
  assert.match(tipHtml, /Tip nie je automaticky článok/);
});

test("searches the whole portal on a dedicated results URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("search-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/hladat?q=labrador", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Čo hľadáš/);
  assert.match(html, /Výsledky pre/);
  assert.match(html, /Labradorský retriever/);
  assert.match(html, /Plemeno/);
});

test("renders article freshness and expert sources", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("article-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Aktualizované/);
  assert.match(html, /Odborné zdroje/);
  assert.match(html, /WSAVA: Global Nutrition Guidelines/);
  assert.match(html, /"dateModified":"2026-08-16"/);
});

test("redirects an old article URL to its portal section URL", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("redirect-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/clanky/ako-vybrat-granule-bez-marketingovych-mytov", {
      headers: { accept: "text/html" },
      redirect: "manual",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location")).pathname, "/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov");
});

test("renders portal sections and the functional directory on stable URLs", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("portal-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const events = await worker.fetch(new Request("http://localhost/podujatia", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(events.status, 200);
  const eventsHtml = await events.text();
  assert.match(eventsHtml, /Kalendár podujatí/);
  assert.match(eventsHtml, /Výstavy/);

  const trainers = await worker.fetch(new Request("http://localhost/adresar/treneri", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(trainers.status, 200);
  const trainersHtml = await trainers.text();
  assert.match(trainersHtml, /Adresár psieho sveta|Tréneri/);
  assert.match(trainersHtml, /Kontakt cez Psipediu/);
  assert.match(trainersHtml, /Názov, mesto alebo služba/);
  assert.match(trainersHtml, /Prvé profily pripravujeme/);

  const directory = await worker.fetch(new Request("http://localhost/adresar", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(directory.status, 200);
  const directoryHtml = await directory.text();
  assert.match(directoryHtml, /Adresár psieho sveta/);
  assert.match(directoryHtml, /Útulky a záchrana/);
  assert.match(directoryHtml, /Salóny a služby/);
});

test("renders the functional event calendar and type view", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("events-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const calendar = await worker.fetch(new Request("http://localhost/podujatia/kalendar", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(calendar.status, 200);
  const calendarHtml = await calendar.text();
  assert.match(calendarHtml, /Kalendár podujatí/);
  assert.match(calendarHtml, /Názov, mesto alebo organizátor/);
  assert.match(calendarHtml, /Prvé podujatia pripravujeme/);

  const shows = await worker.fetch(new Request("http://localhost/podujatia/vystavy", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(shows.status, 200);
  assert.match(await shows.text(), /Výstavy psov/);
});

test("renders the help portal, stable category URL and emergency guide", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("help-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const help = await worker.fetch(new Request("http://localhost/pomoc-psom", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(help.status, 200);
  const helpHtml = await help.text();
  assert.match(helpHtml, /Pomôžme psom správne/);
  assert.match(helpHtml, /Overené zbierky/);
  assert.match(helpHtml, /Meno psa, mesto alebo organizácia/);
  assert.match(helpHtml, /Prvé overené prípady pripravujeme/);

  const adoption = await worker.fetch(new Request("http://localhost/pomoc-psom/adopcia", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(adoption.status, 200);
  assert.match(await adoption.text(), /Adopcia/);

  const guide = await worker.fetch(new Request("http://localhost/pomoc-psom/nahlasit-psa-v-nudzi", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(guide.status, 200);
  const guideHtml = await guide.text();
  assert.match(guideHtml, /Našiel si psa v núdzi/);
  assert.match(guideHtml, /Najprv bezpečnosť/);
  assert.match(guideHtml, /Nájsť útulok alebo organizáciu/);
});

test("renders the breed comparison with two distinct defaults", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("comparison-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/porovnat-plemena", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Porovnávač plemien/);
  assert.match(html, /Labradorský retriever/);
  assert.match(html, /Border kólia/);
  assert.match(html, /FCI skupina/);
  assert.match(html, /Vymeniť poradie plemien/);
});

test("renders the atlas in all ten FCI groups with breed photos", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("atlas-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/plemena", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /10 skupín FCI/);
  assert.match(html, /FCI skupina 1/);
  assert.match(html, /FCI skupina 10/);
  assert.match(html, /Austrálsky ovčiak/);
  assert.match(html, /Bernský salašnícky pes/);
  assert.match(html, /Bígl/);
  assert.match(html, /Whippet/);
  assert.match(html, /\/images\/breeds\/whippet\.webp/);
  assert.match(html, /Oficiálna nomenklatúra FCI/);
});

test("renders the public legal centre and privacy controls", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("legal-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const legal = await worker.fetch(new Request("http://localhost/pravne-informacie", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(legal.status, 200);
  const legalHtml = await legal.text();
  assert.match(legalHtml, /Právne informácie/);
  assert.match(legalHtml, /Pilotná prevádzka/);
  assert.match(legalHtml, /Prevádzkovateľ/);

  const privacy = await worker.fetch(new Request("http://localhost/sukromie", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(privacy.status, 200);
  const privacyHtml = await privacy.text();
  assert.match(privacyHtml, /Ochrana osobných údajov/);
  assert.match(privacyHtml, /Aké údaje a prečo spracúvame/);
  assert.match(privacyHtml, /Cookies a lokálne úložisko/);

  const cookies = await worker.fetch(new Request("http://localhost/cookies", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(cookies.status, 200);
  const cookiesHtml = await cookies.text();
  assert.match(cookiesHtml, /Cookies a lokálne úložisko/);
  assert.match(cookiesHtml, /nepoužíva analytické, reklamné ani marketingové cookies/i);

  const terms = await worker.fetch(new Request("http://localhost/podmienky-pouzivania", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(terms.status, 200);
  assert.match(await terms.text(), /Podmienky používania/);

  const corrections = await worker.fetch(new Request("http://localhost/opravy-a-podnety", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(corrections.status, 200);
  assert.match(await corrections.text(), /Opravy a podnety/);
});

test("publishes search-engine and ChatGPT discovery endpoints", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("seo-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const robots = await worker.fetch(new Request("http://localhost/robots.txt"), bindings, context);
  assert.equal(robots.status, 200);
  const robotsText = await robots.text();
  assert.match(robotsText, /User-Agent: OAI-SearchBot/i);
  assert.match(robotsText, /User-Agent: Googlebot/i);
  assert.match(robotsText, /Sitemap: https:\/\/psipedia\.sk\/sitemap\.xml/i);
  assert.match(robotsText, /Sitemap: https:\/\/psipedia\.sk\/news-sitemap\.xml/i);

  const sitemap = await worker.fetch(new Request("http://localhost/sitemap.xml"), bindings, context);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /xml/i);
  const sitemapText = await sitemap.text();
  assert.match(sitemapText, /https:\/\/psipedia\.sk\/plemena\/border-kolia/);
  assert.match(sitemapText, /https:\/\/psipedia\.sk\/starostlivost\/ako-vybrat-granule-bez-marketingovych-mytov/);

  const feed = await worker.fetch(new Request("http://localhost/feed.xml"), bindings, context);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type") ?? "", /application\/rss\+xml/i);
  const feedText = await feed.text();
  assert.match(feedText, /<rss version="2\.0"/);
  assert.match(feedText, /Prvý rok labradora/);
  assert.match(feedText, /https:\/\/psipedia\.sk\/steniatka\/prvy-rok-labradora-mesiac-po-mesiaci/);

  const article = await worker.fetch(new Request("http://localhost/starostlivost/ako-vybrat-granule-bez-marketingovych-mytov", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(article.status, 200);
  const articleHtml = await article.text();
  assert.match(articleHtml, /rel="canonical" href="https:\/\/psipedia\.sk\/starostlivost\/ako-vybrat-granule-bez-marketingovych-mytov"/);
  assert.match(articleHtml, /"mainEntityOfPage"/);
  assert.match(articleHtml, /"BreadcrumbList"/);
  assert.match(articleHtml, /max-image-preview:large/i);
});
