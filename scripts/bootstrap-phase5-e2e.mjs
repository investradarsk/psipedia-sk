const REQUIRED_FLAG = "PSIPEDIA_E2E_LOCAL_BOOTSTRAP";
const DEFAULT_BASE_URL = "http://localhost:5173";
const REVIEW_SLUG = "e2e-testovacia-recenzia-krmiva";
const REVIEW_TITLE = "E2E testovacia recenzia krmiva";

const reviewSubpages = [
  { slug: "krmiva", label: "Krmivá", description: "Zloženie, použitie, energia a praktické hodnotenie." },
  { slug: "maskrty", label: "Maškrty", description: "Tréningové odmeny, žuvanie a každodenné používanie." },
  { slug: "hracky", label: "Hračky", description: "Odolnosť, bezpečnosť a vhodnosť podľa typu hry." },
  { slug: "postroje-a-vodidla", label: "Postroje a vodidlá", description: "Pohodlie, ovládanie a bezpečnosť pri pohybe." },
  { slug: "gps-lokatory", label: "GPS lokátory", description: "Dosah, výdrž, presnosť a praktické používanie." },
  { slug: "peleche", label: "Pelechy", description: "Pohodlie, údržba a vhodnosť podľa veľkosti psa." },
  { slug: "cestovanie", label: "Cestovanie", description: "Autovýbava, nosiče, fľaše a veci na výlet." },
  { slug: "vycvikova-vybava", label: "Výcviková výbava", description: "Pomôcky pre bezpečný a zrozumiteľný tréning." },
];

const reviewSection = {
  slug: "recenzie",
  label: "Recenzie a testy",
  eyebrow: "Testy bez marketingovej hmly",
  description: "Praktické skúsenosti s krmivami, výbavou, hračkami a cestovateľskými produktmi.",
  intro: "Pri každej recenzii bude jasné, čo sme hodnotili, pre akého psa je produkt určený a či bol obsah podporený partnerom.",
  visible: true,
  subpages: reviewSubpages,
};

const reviewArticle = {
  slug: REVIEW_SLUG,
  title: REVIEW_TITLE,
  excerpt: "Deterministická lokálna E2E recenzia vytvorená iba na overenie sekcie Recenzie a testy.",
  category: "Výživa",
  portalSection: "recenzie",
  portalSubpage: "krmiva",
  status: "published",
  accent: "gold",
  author: "E2E Psipedia",
  intro: "Tento lokálny testovací článok overuje render hubu, kategórie a detailu bez produkčných dát.",
  takeaway: "Záznam slúži výhradne lokálnemu E2E bootstrapu.",
  sections: [
    {
      heading: "E2E testovací obsah",
      paragraphs: ["Minimálny deterministický obsah pre overenie publikovanej recenzie v lokálnom D1 prostredí."],
    },
  ],
  sources: [],
  readingMinutes: 2,
  publishedAt: "2026-01-15T12:00:00.000Z",
  showUpdated: false,
  noindex: true,
};

function fail(message) {
  throw new Error(`[phase5-e2e-bootstrap] ${message}`);
}

function requireLocalBaseUrl() {
  if (process.env[REQUIRED_FLAG] !== "1") {
    fail(`Refusing to run without ${REQUIRED_FLAG}=1.`);
  }
  if (process.env.NODE_ENV === "production") {
    fail("Refusing to run with NODE_ENV=production.");
  }

  const url = new URL(process.env.E2E_BASE_URL || DEFAULT_BASE_URL);
  if (url.protocol !== "http:" || url.hostname !== "localhost" || url.port !== "5173") {
    fail(`Refusing non-local target ${url.origin}; expected http://localhost:5173.`);
  }
  return url.origin;
}

async function request(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json, text/html;q=0.9",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    fail(`${init.method || "GET"} ${pathname} returned ${response.status}: ${body.slice(0, 500)}`);
  }
  return { response, body };
}

async function requestJson(baseUrl, pathname, init = {}) {
  const { body } = await request(baseUrl, pathname, init);
  try {
    return JSON.parse(body);
  } catch {
    fail(`${init.method || "GET"} ${pathname} did not return JSON.`);
  }
}

async function materializeReviewSection(baseUrl) {
  const saved = await requestJson(baseUrl, "/api/admin/sections", {
    method: "PUT",
    body: JSON.stringify({ sections: [reviewSection] }),
  });
  const recenzie = saved.sections?.find((section) => section.slug === "recenzie");
  if (!recenzie) fail("Managed section recenzie was not materialized.");

  const slugs = (recenzie.subpages || []).map((subpage) => subpage.slug);
  if (slugs.length !== reviewSubpages.length || reviewSubpages.some((subpage) => !slugs.includes(subpage.slug))) {
    fail(`Managed review subpages are not canonical: ${JSON.stringify(slugs)}`);
  }
}

async function findSeedArticle(baseUrl) {
  let page = 1;
  while (true) {
    const result = await requestJson(baseUrl, `/api/admin/articles?page=${page}&limit=100`);
    const match = result.articles?.find((article) => article.slug === REVIEW_SLUG);
    if (match) return match;
    if (page >= Number(result.pagination?.totalPages || 1)) return null;
    page += 1;
  }
}

async function upsertSeedArticle(baseUrl) {
  const existing = await findSeedArticle(baseUrl);
  const result = existing
    ? await requestJson(baseUrl, `/api/admin/articles/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(reviewArticle),
      })
    : await requestJson(baseUrl, "/api/admin/articles", {
        method: "POST",
        body: JSON.stringify(reviewArticle),
      });

  if (result.article?.slug !== REVIEW_SLUG || result.article?.portalSubpage !== "krmiva" || result.article?.status !== "published") {
    fail("Seed review was not persisted with the expected slug, portalSubpage and published status.");
  }
}

function assertContains(html, value, context) {
  if (!html.includes(value)) fail(`${context} is missing ${JSON.stringify(value)}.`);
}

async function verifyPublicRoutes(baseUrl) {
  const hub = await request(baseUrl, "/recenzie");
  if (hub.response.status !== 200) fail(`/recenzie returned ${hub.response.status}.`);
  assertContains(hub.body, "Recenzie a testy", "/recenzie H1");
  for (const subpage of reviewSubpages) {
    assertContains(hub.body, `/recenzie/${subpage.slug}`, `/recenzie managed tabs`);
  }
  assertContains(hub.body, REVIEW_TITLE, "/recenzie review card");
  assertContains(hub.body, `/recenzie/${REVIEW_SLUG}`, "/recenzie review card link");

  const category = await request(baseUrl, "/recenzie/krmiva");
  if (category.response.status !== 200) fail(`/recenzie/krmiva returned ${category.response.status}.`);
  assertContains(category.body, REVIEW_TITLE, "/recenzie/krmiva review card");

  const detail = await request(baseUrl, `/recenzie/${REVIEW_SLUG}`);
  if (detail.response.status !== 200) fail(`/recenzie/${REVIEW_SLUG} returned ${detail.response.status}.`);
  assertContains(detail.body, REVIEW_TITLE, "seeded review detail H1");

  console.log(`[phase5-e2e-bootstrap] HTTP smoke PASS: /recenzie 200, 8 managed review tabs, seeded review card, /recenzie/krmiva 200, /recenzie/${REVIEW_SLUG} 200.`);
}

const baseUrl = requireLocalBaseUrl();
await materializeReviewSection(baseUrl);
await upsertSeedArticle(baseUrl);
await verifyPublicRoutes(baseUrl);
console.log(`[phase5-e2e-bootstrap] Bootstrap PASS at ${baseUrl}. Re-running is idempotent for ${REVIEW_SLUG}.`);
