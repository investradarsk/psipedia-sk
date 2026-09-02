import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function createAccessToken({ audience, email, issuer, keyId }) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const header = encodeJwtPart({ alg: "RS256", kid: keyId });
  const payload = encodeJwtPart({
    aud: [audience],
    email,
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: issuer,
  });
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(input),
  );

  return {
    jwk: { ...publicKey, alg: "RS256", kid: keyId, use: "sig" },
    token: `${input}.${Buffer.from(signature).toString("base64url")}`,
  };
}

function createAdminMockDatabase() {
  const now = "2026-08-25T12:00:00.000Z";
  const articleRow = {
    id: 7,
    slug: "testovaci-clanok",
    title: "Testovací článok",
    excerpt: "Dostatočne dlhý perex testovacieho článku pre administráciu.",
    category: "Výcvik",
    portal_section: "clanky",
    portal_subpage: null,
    news_category: null,
    status: "draft",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro: "Dostatočne dlhý úvod testovacieho článku pre administráciu.",
    takeaway: "Hlavné posolstvo testovacieho článku.",
    sections_json: "[]",
    sources_json: "[]",
    blocks_json: JSON.stringify([
      { id: "text-1", type: "text", content: "Obsah testovacieho článku.", alignment: "left" },
      { id: "cta-1", type: "cta", text: "Odporúčaná pomôcka pre tento tréning.", buttonText: "Pozrieť produkt", url: "https://example.com/produkt", newTab: true, sponsored: true },
    ]),
    image_url: null,
    image_key: null,
    reading_minutes: 5,
    created_at: now,
    updated_at: now,
    published_at: null,
    created_by: "martin.zabransky@gmail.com",
    updated_by: "martin.zabransky@gmail.com",
    content_updated_at: null,
    show_updated_label: 0,
    seo_title: "",
    meta_description: "",
    canonical_url: "",
    noindex: 0,
    focus_keyword: "",
    og_title: "",
    og_description: "",
    og_image_url: null,
    og_image_key: null,
  };
  const profileRow = {
    id: 9,
    slug: "testovaci-klub",
    name: "Testovací kynologický klub",
    category: "kynologicke-kluby",
    status: "published",
    excerpt: "Dostatočne dlhý krátky popis testovacieho kynologického klubu.",
    description: "Dostatočne dlhý podrobný popis testovacieho kynologického klubu pre overenie detailu.",
    services_json: JSON.stringify(["Výcvik", "Socializácia"]),
    qualifications_json: JSON.stringify(["Stav overenia: Čiastočne overené", "Skúsený tím"]),
    city: "Bratislava",
    district: "Bratislava I",
    region: "Bratislavský kraj",
    address: "Testovacia 1",
    online: 0,
    price_note: "",
    website_url: "https://example.com",
    internal_email: "klub@example.com",
    image_url: null,
    image_key: null,
    import_key: "test-klub-9",
    source_data_json: JSON.stringify({ Zdroj: "interný test", Telefón: "+421 900 111 222", "E-mail": "klub@example.com", Facebook: "https://facebook.com/testklub" }),
    search_text: "testovaci kynologicky klub bratislava",
    verified: 1,
    featured: 0,
    created_at: now,
    updated_at: now,
    published_at: now,
    created_by: "martin.zabransky@gmail.com",
    updated_by: "martin.zabransky@gmail.com",
    seo_json: "{}",
  };
  const queries = [];

  function rowsFor(sql) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/FROM sqlite_master/i.test(normalized)) {
      // Intentionally omit the newer module tables to verify that the dashboard
      // still renders while production migrations catch up.
      return [{ name: "managed_articles" }, { name: "directory_profiles" }];
    }
    if (/COUNT\(\*\) AS count/i.test(normalized) && /FROM managed_articles/i.test(normalized)) {
      return [{ count: /portal_section != 'steniatka'/i.test(normalized) ? 1 : 0 }];
    }
    if (/COUNT\(\*\) AS count/i.test(normalized) && /FROM directory_profiles/i.test(normalized)) {
      return [{ count: 1 }];
    }
    if (/COUNT\(\*\) AS total/i.test(normalized) && /FROM managed_articles/i.test(normalized)) {
      return [{ total: 1, published: 0, scheduled: 0, draft: 1 }];
    }
    if (/COUNT\(\*\) AS total/i.test(normalized) && /FROM directory_profiles/i.test(normalized)) {
      return [{ total: 1, published: 1, draft: 0 }];
    }
    if (/SELECT id, slug, title, excerpt, category, portal_section, news_category, status, accent, image_url, updated_at FROM managed_articles/i.test(normalized)) {
      return [{
        id: articleRow.id,
        slug: articleRow.slug,
        title: articleRow.title,
        excerpt: articleRow.excerpt,
        category: articleRow.category,
        portal_section: articleRow.portal_section,
        news_category: articleRow.news_category,
        status: articleRow.status,
        accent: articleRow.accent,
        image_url: articleRow.image_url,
        updated_at: articleRow.updated_at,
      }];
    }
    if (/SELECT id, slug, name, category, status, services_json, city, district, region, image_url, verified, featured FROM directory_profiles/i.test(normalized)) {
      return [{
        id: profileRow.id,
        slug: profileRow.slug,
        name: profileRow.name,
        category: profileRow.category,
        status: profileRow.status,
        services_json: profileRow.services_json,
        city: profileRow.city,
        district: profileRow.district,
        region: profileRow.region,
        image_url: profileRow.image_url,
        verified: profileRow.verified,
        featured: profileRow.featured,
      }];
    }
    if (/FROM directory_profiles WHERE status = 'published'.*LIMIT \?/i.test(normalized)) return [profileRow];
    if (/FROM directory_profiles WHERE status = 'published'.*category = \?.*slug = \?.*LIMIT 1/i.test(normalized)) return [profileRow];
    if (/SELECT \* FROM managed_articles WHERE id = \?/i.test(normalized)) return [articleRow];
    if (/FROM directory_profiles WHERE id = \?/i.test(normalized)) return [profileRow];
    if (/INSERT INTO managed_articles/i.test(normalized) || /UPDATE managed_articles SET/i.test(normalized)) return [articleRow];
    return [];
  }

  function statement(sql, bindings = []) {
    return {
      bind(...values) { return statement(sql, values); },
      async all() {
        queries.push({ sql, bindings, operation: "all" });
        return { success: true, results: rowsFor(sql), meta: {} };
      },
      async first() {
        queries.push({ sql, bindings, operation: "first" });
        return rowsFor(sql)[0] ?? null;
      },
      async run() {
        queries.push({ sql, bindings, operation: "run" });
        return { success: true, results: [], meta: { last_row_id: articleRow.id } };
      },
    };
  }

  return {
    queries,
    prepare(sql) { return statement(sql); },
    async batch(statements) { return Promise.all(statements.map((item) => item.all())); },
  };
}

test("renders the portal homepage", async () => {
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
  // The externally hosted Cloudflare build intentionally has no Sites-only
  // development preview marker.
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /Rozumej svojmu psovi/);
  assert.match(html, /Pomoc psom/);
  assert.match(html, /Najbližšie podujatia/);
  assert.match(html, /Dobré čítanie pre dobrý psí život/);
  assert.match(html, /Plemeno dňa/);
  assert.match(html, /Koľko „ľudských rokov“ má tvoj pes/);
  assert.match(html, /Kalendár práve dopĺňame/);
  assert.match(html, /Žiadna otvorená výzva/);
  assert.match(html, /Novinky zo sveta psov/);
  assert.match(html, /Prvé overené správy pripravujeme/);
  assert.match(html, /href="\/o-nas#kontakt"/);
  assert.ok(html.indexOf("<h2>Novinky zo sveta psov</h2>") < html.indexOf("<h2>Najbližšie podujatia</h2>"));
  assert.ok(html.indexOf("<h2>Najbližšie podujatia</h2>") < html.indexOf("<h2>Dobré čítanie pre dobrý psí život</h2>"));
  assert.ok(html.indexOf("<h2>Dobré čítanie pre dobrý psí život</h2>") < html.indexOf("<h2>Pomoc psom</h2>"));
  assert.doesNotMatch(html, /Psipedia je viac než magazín/);
  assert.doesNotMatch(html, /Portál, ktorý sa hýbe s komunitou/);
  assert.doesNotMatch(html, /Vyber si, koho hľadáš/);

  const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const articleStoreSource = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");
  const breedStoreSource = readFileSync(new URL("../lib/breed-store.ts", import.meta.url), "utf8");
  const homepageArticleStart = articleStoreSource.indexOf("export async function getHomepageArticles");
  const breedOfTheDayStart = breedStoreSource.indexOf("export async function getBreedOfTheDay");
  const homepageArticleQuery = articleStoreSource.slice(homepageArticleStart, articleStoreSource.indexOf("export async function getPublishedArticle(", homepageArticleStart));
  const breedOfTheDayQuery = breedStoreSource.slice(breedOfTheDayStart, breedStoreSource.indexOf("export async function listPublishedBreeds", breedOfTheDayStart));
  assert.match(homeSource, /getHomepageArticles\(\)/);
  assert.match(homeSource, /getBreedOfTheDay\(dayOfYear\)/);
  assert.doesNotMatch(homeSource, /getPublishedArticles|listPublishedBreedsForComparison/);
  assert.match(homepageArticleQuery, /homepage_rank <= 3/);
  assert.doesNotMatch(homepageArticleQuery, /SELECT \*/);
  assert.match(breedOfTheDayQuery, /LIMIT 1/);
  assert.doesNotMatch(breedOfTheDayQuery, /fci_standard_json|SELECT \*/);
});

test("passes a verified Cloudflare Access identity to the admin application", async () => {
  const issuer = "https://psipedia-test.cloudflareaccess.com";
  const audience = "psipedia-admin-test";
  const email = "martin.zabransky@gmail.com";
  const keyId = "psipedia-test-key";
  const { jwk, token } = await createAccessToken({ audience, email, issuer, keyId });
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const previousRuntimeEnv = { ...runtimeEnv };
  Object.assign(runtimeEnv, {
    AUTH_MODE: "cloudflare-access",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}/cdn-cgi/access/certs`) {
      return Response.json({ keys: [jwk] });
    }
    return originalFetch(input, init);
  };

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("access-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/navigation", {
        headers: {
          accept: "application/json",
          "cf-access-jwt-assertion": token,
        },
      }),
      {
        ACCESS_AUD: audience,
        ACCESS_TEAM_DOMAIN: issuer,
        ADMIN_EMAILS: email,
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        AUTH_MODE: "cloudflare-access",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.items));
    assert.ok(payload.items.length > 0);

    const spoofedResponse = await worker.fetch(
      new Request("http://localhost/api/admin/navigation", {
        headers: {
          accept: "application/json",
          "x-psipedia-admin-authorized": "1",
          "x-psipedia-auth-provider": "cloudflare-access",
          "oai-authenticated-user-email": email,
        },
      }),
      {
        ACCESS_AUD: audience,
        ACCESS_TEAM_DOMAIN: issuer,
        ADMIN_EMAILS: email,
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        AUTH_MODE: "cloudflare-access",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(spoofedResponse.status, 403);

    const staleDeniedPage = await worker.fetch(
      new Request("http://localhost/admin/nepovoleny", {
        headers: {
          accept: "text/html",
          "cf-access-jwt-assertion": token,
        },
      }),
      {
        ACCESS_AUD: audience,
        ACCESS_TEAM_DOMAIN: issuer,
        ADMIN_EMAILS: email,
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        AUTH_MODE: "cloudflare-access",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(staleDeniedPage.status, 307);
    assert.equal(new URL(staleDeniedPage.headers.get("location")).pathname, "/admin");

    const deniedResponse = await worker.fetch(
      new Request("http://localhost/api/admin/navigation", {
        headers: {
          accept: "application/json",
          "cf-access-jwt-assertion": token,
        },
      }),
      {
        ACCESS_AUD: "ine-publikum",
        ACCESS_TEAM_DOMAIN: issuer,
        ADMIN_EMAILS: email,
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        AUTH_MODE: "cloudflare-access",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(deniedResponse.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(runtimeEnv)) delete runtimeEnv[key];
    Object.assign(runtimeEnv, previousRuntimeEnv);
  }
});

test("uses light admin lists and loads full records only for detail and save", async () => {
  const issuer = "https://psipedia-admin-performance.cloudflareaccess.com";
  const audience = "psipedia-admin-performance";
  const email = "martin.zabransky@gmail.com";
  const keyId = "psipedia-admin-performance-key";
  const { jwk, token } = await createAccessToken({ audience, email, issuer, keyId });
  const database = createAdminMockDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const previousRuntimeEnv = { ...runtimeEnv };
  Object.assign(runtimeEnv, { DB: database, AUTH_MODE: "cloudflare-access" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    return originalFetch(input, init);
  };

  const bindings = {
    ACCESS_AUD: audience,
    ACCESS_TEAM_DOMAIN: issuer,
    ADMIN_EMAILS: email,
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    AUTH_MODE: "cloudflare-access",
    DB: database,
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const adminRequest = (path, init = {}) => new Request(`http://localhost${path}`, {
    ...init,
    headers: { accept: "text/html", "cf-access-jwt-assertion": token, ...(init.headers ?? {}) },
  });

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("admin-performance-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);

    const dashboard = await worker.fetch(adminRequest("/admin"), bindings, context);
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /Testovací článok/);
    assert.match(dashboardHtml, /Súhrnný prehľad/);

    const directory = await worker.fetch(adminRequest("/admin/adresar"), bindings, context);
    assert.equal(directory.status, 200);
    assert.match(await directory.text(), /Testovací kynologický klub/);

    const filteredDirectory = await worker.fetch(adminRequest("/admin/adresar?category=kynologicke-kluby"), bindings, context);
    assert.equal(filteredDirectory.status, 200);
    assert.match(await filteredDirectory.text(), /Kategória/);
    const filteredDirectoryQuery = database.queries.find(({ sql, bindings: queryBindings }) => /FROM directory_profiles\s+WHERE category = \?/i.test(sql) && queryBindings[0] === "kynologicke-kluby");
    assert.ok(filteredDirectoryQuery, "adresár musí filtrovať kategóriu v databázovom dotaze");

    const breeds = await worker.fetch(adminRequest("/admin/plemena"), bindings, context);
    assert.equal(breeds.status, 200);
    assert.match(await breeds.text(), /FCI skupina/);

    const articleListQueries = database.queries.filter(({ sql }) => /FROM managed_articles/i.test(sql) && /LIMIT \?/i.test(sql));
    assert.ok(articleListQueries.length > 0);
    for (const { sql } of articleListQueries) {
      assert.doesNotMatch(sql, /SELECT\s+\*/i);
      assert.doesNotMatch(sql, /sections_json|blocks_json|sources_json|seo_title|meta_description/i);
    }
    const directoryListQueries = database.queries.filter(({ sql }) => /FROM directory_profiles/i.test(sql) && /LIMIT \?/i.test(sql));
    assert.ok(directoryListQueries.length > 0);
    for (const { sql } of directoryListQueries) {
      assert.doesNotMatch(sql, /SELECT\s+\*/i);
      assert.doesNotMatch(sql, /description|qualifications_json|source_data_json|internal_email/i);
    }

    const articleDetail = await worker.fetch(adminRequest("/admin/clanky/7"), bindings, context);
    assert.equal(articleDetail.status, 200);
    const articleDetailHtml = await articleDetail.text();
    assert.match(articleDetailHtml, /Upraviť článok/);
    assert.match(articleDetailHtml, /Testovací článok/);
    assert.match(articleDetailHtml, /Vložiť blok sem/);
    assert.match(articleDetailHtml, />Zdroj</);
    assert.match(articleDetailHtml, />CTA</);
    assert.match(articleDetailHtml, /Pozrieť produkt/);
    assert.match(articleDetailHtml, /Partnerský odkaz/);
    assert.match(articleDetailHtml, /rel="sponsored nofollow noreferrer"/);
    assert.match(articleDetailHtml, /Prázdny riadok vytvorí na webe nový odsek/);

    const profileDetail = await worker.fetch(adminRequest("/admin/adresar/9"), bindings, context);
    assert.equal(profileDetail.status, 200);
    const profileDetailHtml = await profileDetail.text();
    assert.match(profileDetailHtml, /Upraviť profil/);
    assert.match(profileDetailHtml, /Testovací kynologický klub/);

    const articlePayload = {
      title: "Nový testovací článok",
      slug: "novy-testovaci-clanok",
      excerpt: "Dostatočne dlhý perex nového testovacieho článku.",
      category: "Výcvik",
      portalSection: "clanky",
      status: "draft",
      accent: "forest",
      author: "Redakcia Psipedia",
      intro: "Dostatočne dlhý úvod nového testovacieho článku.",
      takeaway: "Dôležité posolstvo testovacieho článku.",
      blocks: [
        { id: "text-1", type: "text", content: "Obsah nového testovacieho článku.", alignment: "left" },
        { id: "cta-1", type: "cta", text: "Odporúčaná pomôcka.", buttonText: "Pozrieť produkt", url: "https://example.com/produkt", newTab: true, sponsored: true },
      ],
    };
    const created = await worker.fetch(adminRequest("/api/admin/articles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(articlePayload),
    }), bindings, context);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).article.id, 7);
    const createArticleQuery = database.queries.find(({ sql }) => /INSERT INTO managed_articles/i.test(sql));
    const storedBlocks = createArticleQuery?.bindings.find((value) => typeof value === "string" && value.includes('"type":"cta"'));
    assert.match(storedBlocks ?? "", /"buttonText":"Pozrieť produkt"/);
    assert.match(storedBlocks ?? "", /"sponsored":true/);

    database.queries.length = 0;
    const saved = await worker.fetch(adminRequest("/api/admin/articles/7", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(articlePayload),
    }), bindings, context);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).article.id, 7);
    assert.equal(database.queries.filter(({ sql }) => /SELECT \* FROM managed_articles WHERE id = \?/i.test(sql)).length, 1);
    assert.equal(database.queries.filter(({ sql }) => /UPDATE managed_articles SET/i.test(sql)).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(runtimeEnv)) delete runtimeEnv[key];
    Object.assign(runtimeEnv, previousRuntimeEnv);
  }
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
  assert.match(html, /Prvý rok labradora/);
  assert.match(html, /Článok/);
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
  assert.doesNotMatch(html, /Obsah článku/);
  assert.match(html, /Súvisiace články/);
  assert.match(html, /WSAVA: Global Nutrition Guidelines/);
  assert.match(html, /"dateModified":"2026-08-16"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.article-blocks\s*>\s*ul\s*\{[^}]*list-style:\s*disc outside/s);
  assert.match(css, /\.article-blocks\s*>\s*ol\s*\{[^}]*list-style:\s*decimal outside/s);
  assert.match(css, /\.admin-section-nav\s*\{[^}]*position:\s*sticky[^}]*top:\s*76px/s);
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

  const calendar = await worker.fetch(new Request("http://localhost/podujatia/kalendar", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(calendar.status, 200);
  assert.match(await calendar.text(), /event-calendar-hero--photo/);

  const trainers = await worker.fetch(new Request("http://localhost/adresar/treneri", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(trainers.status, 200);
  const trainersHtml = await trainers.text();
  assert.match(trainersHtml, /Služby pre psov|Psí tréneri/);
  assert.match(trainersHtml, /Psí tréneri a psie školy/);
  assert.match(trainersHtml, /Názov, služba, plemeno alebo lokalita/);
  assert.match(trainersHtml, /Mesto\/obec/);
  assert.match(trainersHtml, /Zoradenie/);
  assert.match(trainersHtml, /Nenašli sme zhodu/);
  assert.doesNotMatch(trainersHtml, /Koho hľadáš/);

  const directory = await worker.fetch(new Request("http://localhost/adresar", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(directory.status, 200);
  const directoryHtml = await directory.text();
  assert.match(directoryHtml, /Nájdi službu pre svojho psa/);
  assert.match(directoryHtml, /Veterinári/);
  assert.match(directoryHtml, /Hotely a opatrovanie/);
  assert.match(directoryHtml, /Fyzioterapia/);
  assert.match(directoryHtml, /Čo hľadáš/);
  assert.match(directoryHtml, /directory-hero--photo/);
  assert.doesNotMatch(directoryHtml, /Profily v adresári/);

  const legacySchools = await worker.fetch(new Request("http://localhost/adresar/psie-skoly", { headers: { accept: "text/html" }, redirect: "manual" }), bindings, context);
  assert.equal(legacySchools.status, 301);
  assert.equal(new URL(legacySchools.headers.get("location")).pathname, "/adresar/treneri");

  for (const category of ["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby", "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie", "fyzioterapia", "dalsie-sluzby"]) {
    const response = await worker.fetch(new Request(`http://localhost/adresar/${category}`, { headers: { accept: "text/html" } }), bindings, context);
    assert.equal(response.status, 200, category);
    const html = await response.text();
    assert.match(html, /Kraj/);
    assert.match(html, /Okres/);
    assert.match(html, /Mesto\/obec/);
    assert.doesNotMatch(html, /source_data_json|import_key|Overené Psipediou|Stav overenia/);
  }
});

test("renders the care hub, urgent guidance and topic-specific articles", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("care-portal-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const hub = await worker.fetch(new Request("http://localhost/starostlivost", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  assert.match(hubHtml, /Zdravie a starostlivosť/);
  assert.match(hubHtml, /Má pes akútny problém/);
  assert.match(hubHtml, /Čo riešiš/);
  assert.match(hubHtml, /Užitočné služby a kontakty/);
  assert.match(hubHtml, /Nájsť veterinára/);
  assert.match(hubHtml, /portal-hero--photo/);
  assert.match(hubHtml, /portal-hero-photo/);

  const nutrition = await worker.fetch(new Request("http://localhost/starostlivost/vyziva", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(nutrition.status, 200);
  const nutritionHtml = await nutrition.text();
  assert.match(nutritionHtml, /Praktická poradňa: Výživa/);
  assert.match(nutritionHtml, /Čo môžeš urobiť doma/);
  assert.match(nutritionHtml, /Varovné signály/);
  assert.match(nutritionHtml, /Ako vybrať granule bez marketingových mýtov/);
  assert.doesNotMatch(nutritionHtml, /Chôdza pri nohe bez ťahania/);

  const editorSource = readFileSync(new URL("../components/admin-section-editor.tsx", import.meta.url), "utf8");
  assert.match(editorSource, /Najčastejšie otázky/);
  assert.match(editorSource, /Pripnuté články/);
  assert.match(editorSource, /Meta description/);
  const articleEditorSource = readFileSync(new URL("../components/admin-article-editor.tsx", import.meta.url), "utf8");
  assert.match(articleEditorSource, /Oblasť Zdravia a starostlivosti/);
});

test("renders the activities hub, safe-start guidance and activity admin fields", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("activities-portal-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const hub = await worker.fetch(new Request("http://localhost/aktivity", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  assert.match(hubHtml, /Výcvik a aktivity/);
  assert.match(hubHtml, /Dobrá aktivita sedí konkrétnemu psovi/);
  assert.match(hubHtml, /Hľadať v aktivitách/);
  assert.match(hubHtml, /Tréning a zážitky nablízku/);
  assert.match(hubHtml, /Kynologické kluby/);

  const sports = await worker.fetch(new Request("http://localhost/aktivity/psie-sporty", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(sports.status, 200);
  const sportsHtml = await sports.text();
  assert.match(sportsHtml, /Praktický sprievodca: Psie športy/);
  assert.match(sportsHtml, /Ako začať/);
  assert.match(sportsHtml, /Bezpečnosť a limity/);
  assert.match(sportsHtml, /Aport: od naháňačky k spoľahlivému odovzdaniu do ruky/);

  const editorSource = readFileSync(new URL("../components/admin-section-editor.tsx", import.meta.url), "utf8");
  assert.match(editorSource, /Obsah oblasti výcviku a aktivít/);
  assert.match(editorSource, /Kontakty a súvisiace služby/);
  const articleEditorSource = readFileSync(new URL("../components/admin-article-editor.tsx", import.meta.url), "utf8");
  assert.match(articleEditorSource, /Oblasť Výcviku a aktivít/);
  const articleStoreSource = readFileSync(new URL("../lib/article-store.ts", import.meta.url), "utf8");
  assert.match(articleStoreSource, /Vyber oblasť v sekcii Výcvik a aktivity/);
});

test("renders the puppy journey, practical topic guidance and puppy admin fields", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("puppy-portal-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const bindings = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const hub = await worker.fetch(new Request("http://localhost/steniatka", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  assert.match(hubHtml, /Čakáš šteniatko alebo je už doma/);
  assert.match(hubHtml, /Pred príchodom/);
  assert.match(hubHtml, /Prvé týždne doma/);
  assert.match(hubHtml, /Rast a dospievanie/);
  assert.match(hubHtml, /Hľadať v sprievodcovi/);
  assert.match(hubHtml, /Chovateľské stanice/);

  const firstDays = await worker.fetch(new Request("http://localhost/steniatka/prve-dni", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(firstDays.status, 200);
  const firstDaysHtml = await firstDays.text();
  assert.match(firstDaysHtml, /Sprievodca: Prvé dni doma/);
  assert.match(firstDaysHtml, /Čo urobiť teraz/);
  assert.match(firstDaysHtml, /Na čo si dať pozor/);
  assert.match(firstDaysHtml, /Dôležité pre túto fázu/);

  const editorSource = readFileSync(new URL("../components/admin-section-editor.tsx", import.meta.url), "utf8");
  assert.match(editorSource, /Obsah oblasti Šteniatok/);
  assert.match(editorSource, /Témy tejto fázy/);
  assert.match(editorSource, /Dôležité pre túto fázu/);
  const articleEditorSource = readFileSync(new URL("../components/admin-article-editor.tsx", import.meta.url), "utf8");
  assert.match(articleEditorSource, /Oblasť Šteniatok/);
});

test("filters a directory category on the server and keeps verification data private", async () => {
  const database = createAdminMockDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const previousRuntimeEnv = { ...runtimeEnv };
  Object.assign(runtimeEnv, { DB: database });
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("directory-filter-test", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const bindings = { DB: database, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
    const context = { waitUntil() {}, passThroughOnException() {} };

    const list = await worker.fetch(new Request("http://localhost/adresar/kynologicke-kluby?q=zlate+moravce", { headers: { accept: "text/html" } }), bindings, context);
    assert.equal(list.status, 200);
    const listHtml = await list.text();
    assert.match(listHtml, /Testovací kynologický klub/);
    assert.doesNotMatch(listHtml, /Koho hľadáš/);
    assert.doesNotMatch(listHtml, /Overený profil/);
    const filteredQuery = database.queries.find(({ sql, bindings: values }) => /search_text LIKE/i.test(sql) && /LIMIT \? OFFSET \?/i.test(sql) && values.includes("%zlate moravce%"));
    assert.ok(filteredQuery);
    assert.doesNotMatch(filteredQuery.sql, /SELECT\s+\*/i);
    assert.match(filteredQuery.sql, /LIMIT \? OFFSET \?/i);

    const detail = await worker.fetch(new Request("http://localhost/adresar/kynologicke-kluby/testovaci-klub", { headers: { accept: "text/html" } }), bindings, context);
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.doesNotMatch(detailHtml, /Overenie údajov|Dátum overenia|Zobraziť zdroj|Overený profil|Stav overenia|Čiastočne overené|interný test|source_data_json|import_key/);
    assert.match(detailHtml, /Bratislava I/);
    assert.match(detailHtml, /tel:\+421900111222/);
    assert.match(detailHtml, /mailto:klub@example.com/);
    assert.match(detailHtml, /Navigovať/);
    assert.match(detailHtml, /Ste majiteľom tohto profilu/);
  } finally {
    for (const key of Object.keys(runtimeEnv)) delete runtimeEnv[key];
    Object.assign(runtimeEnv, previousRuntimeEnv);
  }
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
  assert.match(helpHtml, /help-hero--photo/);
  assert.match(helpHtml, /Pomôžme psom správne/);
  assert.match(helpHtml, /Zbierky a výzvy/);
  assert.match(helpHtml, /Meno psa, mesto alebo organizácia/);
  assert.match(helpHtml, /Prvé overené prípady pripravujeme/);

  const adoption = await worker.fetch(new Request("http://localhost/pomoc-psom/adopcia", { headers: { accept: "text/html" } }), bindings, context);
  assert.equal(adoption.status, 200);
  assert.match(await adoption.text(), /Psy na adopciu/);

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
  assert.match(html, /FCI skupiny alebo sekcie/);
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
  assert.match(cookiesHtml, /Google Analytics sa pred prijatím analytiky nenačíta/i);

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
  assert.match(sitemapText, /https:\/\/psipedia\.sk\/adresar\/treneri/);
  assert.doesNotMatch(sitemapText, /https:\/\/psipedia\.sk\/adresar\/psie-skoly/);

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
