const REQUIRED_FLAG = "PSIPEDIA_E2E_LOCAL_BOOTSTRAP";
const DEFAULT_BASE_URL = "http://localhost:5173";

const sectionFixtures = [
  {
    slug: "aktivity",
    label: "Výcvik a aktivity",
    eyebrow: "Spolupráca v praxi",
    description: "Výcvik, šport a aktivity so psom.",
    intro: "Praktické návody pre zrozumiteľný tréning a bezpečný pohyb.",
    visible: true,
    subpages: [{ slug: "trening", label: "Výcvik", description: "Základy aj pokročilý tréning." }],
  },
  {
    slug: "starostlivost",
    label: "Zdravie a starostlivosť",
    eyebrow: "Každodenná starostlivosť",
    description: "Zdravie, výživa a praktická starostlivosť o psa.",
    intro: "Rozhodovanie podľa potrieb konkrétneho psa a overiteľných zdrojov.",
    visible: true,
    subpages: [{ slug: "vyziva", label: "Výživa", description: "Krmivá, dávky a zdravá kondícia." }, { slug: "zdravie", label: "Zdravie", description: "Prevencia a zdravie psa." }],
  },
  {
    slug: "novinky",
    label: "Novinky",
    eyebrow: "Zo sveta psov",
    description: "Overené správy a nové poznatky zo sveta psov.",
    intro: "Kompletný archív publikovaných noviniek.",
    visible: true,
    subpages: [
      { slug: "veda-a-zdravie", label: "Veda a zdravie", description: "Výskum a zdravie psov." },
      { slug: "zaujimavosti", label: "Zaujímavosti", description: "Zaujímavé témy zo sveta psov." },
    ],
  },
];

const bikeBlocks = [
  { id: "bike-h2-1", type: "h2", text: "Čo je bikejoring a ako funguje" },
  { id: "bike-text-1", type: "text", content: "Bikejoring je tímový šport, pri ktorom pes beží pred bicyklom a s jazdcom je spojený pružnou ťažnou šnúrou. Bezpečný začiatok stojí na ovládateľnosti psa, kondícii a správnej výbave.", richText: { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bikejoring je tímový šport", marks: [{ type: "bold" }] }, { type: "text", text: ", pri ktorom pes pracuje v ťahu." }, { type: "hardBreak" }, { type: "text", text: "Bezpečný začiatok je dôležitejší než rýchlosť.", marks: [{ type: "italic" }] }] }, { type: "bulletList", items: [[{ type: "text", text: "ovládateľnosť psa" }], [{ type: "text", text: "primeraná kondícia" }]] }] } },
  { id: "bike-tip-1", type: "tip", content: "Najskôr nacvičte prácu pred človekom a smerové povely bez bicykla." },
  { id: "bike-h2-2", type: "h2", text: "Aký pes je vhodný na bikejoring" },
  { id: "bike-text-2", type: "text", content: "Dôležitejšia než konkrétne plemeno je zdravá pohybová sústava, primeraná hmotnosť, kondícia a schopnosť pracovať aj pri rušení." },
  { id: "bike-h2-3", type: "h2", text: "Kedy môže pes s bikejoringom začať" },
  { id: "bike-warning-1", type: "warning", content: "Intenzívny ťah patrí až k fyzicky pripravenému psovi. Pri mladom psovi rešpektujte vývoj kostí, kĺbov, svalov a šliach." },
  { id: "bike-related-1", type: "related", title: "Stimulus control: kedy pes povel naozaj ovláda", href: "/aktivity/stimulus-control-u-psa", description: "Ako overiť, či správanie naozaj riadi konkrétny signál." },
  { id: "bike-h2-4", type: "h2", text: "Výbava na bikejoring: čo skutočne potrebujete" },
  { id: "bike-list-1", type: "bullet-list", items: ["dobre sediaci ťažný postroj", "pružná ťažná šnúra", "bikejoringová anténa", "spoľahlivý bicykel a prilba"] },
  { id: "bike-image-1", type: "image", url: "/images/trening-pri-nohe.webp", alt: "Pes pri tréningu s človekom", caption: "Testovací lokálny vizuál používa existujúcu fotografiu Psipedie.", credit: "Psipedia", size: "wide" },
  { id: "bike-h2-5", type: "h2", text: "Najdôležitejšie povely pre bikejoring" },
  { id: "bike-h3-1", type: "h3", text: "Smer a zastavenie" },
  { id: "bike-text-3", type: "text", content: "Povely musia byť krátke, konzistentné a naučené ešte predtým, než ich pes potrebuje použiť vo vyššej rýchlosti." },
  { id: "bike-h2-6", type: "h2", text: "Ako začať s bikejoringom krok za krokom" },
  { id: "bike-table-1", type: "table", headers: ["Fáza", "Cieľ", "Prostredie"], rows: [["1", "povely", "pokoj"], ["2", "ťah", "krátky úsek"], ["3", "bicykel", "prehľadná trasa"]] },
  { id: "bike-video-1", type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Bezpečné video v článku", caption: "Allowlisted YouTube embed pre public rendering test." },
  { id: "bike-source-1", type: "source", label: "International Federation of Sleddog Sports", url: "https://sleddogsport.net/", note: "Pravidlá a bezpečnostný rámec športov psích záprahov." },
];

const stimulusBlocks = [
  { id: "stim-h2-1", type: "h2", text: "Čo stimulus control v skutočnosti znamená" },
  { id: "stim-text-1", type: "text", content: "Konkrétny signál má spoľahlivo vyvolať konkrétne správanie bez hádania a bez závislosti od pomocných pohybov človeka." },
  { id: "stim-h2-2", type: "h2", text: "Štyri podmienky stimulus control" },
  { id: "stim-h3-1", type: "h3", text: "Po signále príde správne správanie" },
  { id: "stim-list-1", type: "numbered-list", items: ["správna reakcia po cue", "žiadne automatické ponúkanie bez cue", "iné signály nevyvolajú rovnakú reakciu", "po cue nepríde iná odpoveď"] },
  { id: "stim-h2-3", type: "h2", text: "Najčastejší problém: pes reaguje na vaše telo" },
  { id: "stim-text-2", type: "text", content: "Slovný a gestický signál testujte oddelene, aby bolo jasné, ktorý podnet správanie naozaj riadi." },
  { id: "stim-h2-4", type: "h2", text: "Anticipácia nie je vždy znakom výborného psa" },
  { id: "stim-h2-5", type: "h2", text: "Ako stimulus control testovať" },
  { id: "stim-embed-bad", type: "embed", url: "javascript:alert(1)", title: "Malicious embed" },
  { id: "stim-source-1", type: "source", label: "Karen Pryor Clicker Training", url: "https://www.clickertraining.com/" },
];

const granuleBlocks = [
  { id: "food-h2-1", type: "h2", text: "Začnite označením kompletného krmiva" },
  { id: "food-text-1", type: "text", content: "Na každodenné kŕmenie hľadajte kompletné krmivo pre príslušnú vekovú kategóriu a potreby konkrétneho psa." },
  { id: "food-h2-2", type: "h2", text: "Kalórie rozhodujú o dávke" },
  { id: "food-list-1", type: "bullet-list", items: ["ľahko hmatateľné rebrá", "viditeľný pás zhora", "brucho mierne vtiahnuté zboku"] },
  { id: "food-h2-3", type: "h2", text: "Zmena patrí do viacerých dní" },
  { id: "food-tip-1", type: "tip", content: "Nové a pôvodné krmivo miešajte postupne a sledujte toleranciu psa." },
  { id: "food-h2-4", type: "h2", text: "Kedy riešiť veterinára" },
  { id: "food-warning-1", type: "warning", content: "Dlhodobá hnačka, vracanie, chudnutie alebo výrazné svrbenie si zaslúžia veterinárne vyšetrenie." },
  { id: "food-source-1", type: "source", label: "WSAVA Global Nutrition Guidelines", url: "https://wsava.org/global-guidelines/global-nutrition-guidelines/" },
  { id: "food-source-2", type: "source", label: "WSAVA Global Nutrition Toolkit", url: "https://wsava.org/global-guidelines/global-nutrition-guidelines/" },
];

const sidebarFixtures = Array.from({ length: 6 }, (_, index) => ({
  slug: `e2e-sidebar-article-${index + 1}`,
  title: `E2E magazínový článok ${index + 1}`,
  excerpt: "Publikovaný lokálny fixture pre päťpoložkový magazínový sidebar.",
  category: "Život so psom",
  portalSection: "novinky",
  newsCategory: "zaujimavosti",
  status: "published",
  accent: "coral",
  author: "Redakcia Psipedia",
  intro: "Pomocný publikovaný fixture pre deterministické odporúčania.",
  takeaway: "",
  blocks: [{ id: `sidebar-${index + 1}-text`, type: "text", content: "Krátky testovací obsah." }],
  sections: [],
  sources: [],
  readingMinutes: 2,
  publishedAt: `2026-08-${String(8 - index).padStart(2, "0")}T08:00:00.000Z`,
  showUpdated: false,
  noindex: true,
}));

const articleFixtures = [
  {
    slug: "bikejoring-so-psom-kompletny-sprievodca-od-prveho-treningu-az-po-preteky-na-slovensku",
    title: "Bikejoring so psom: kompletný sprievodca od prvého tréningu až po preteky na Slovensku",
    excerpt: "Bikejoring spája rýchlosť horskej cyklistiky s prácou psa v ťahu. Zistite, akú výbavu potrebujete, ako bezpečne začať trénovať a kde sa bikejoringu venovať či pretekať na Slovensku.",
    category: "Výcvik",
    portalSection: "aktivity",
    portalSubpage: "trening",
    status: "published",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro: "Bikejoring patrí medzi najdynamickejšie športy, ktoré môže človek robiť spolu so psom. Pes beží pred bicyklom, je s jazdcom spojený pružnou ťažnou šnúrou a svojím pohybom mu pomáha zrýchľovať. Nejde však o obyčajnú jazdu na bicykli so psom na vodítku.",
    takeaway: "Bikejoring je tímový šport, v ktorom musí byť pes fyzicky pripravený, ovládateľný a vybavený správnym postrojom, zatiaľ čo jazdec aktívne šliape a kontroluje rýchlosť.",
    blocks: bikeBlocks,
    sections: [],
    sources: [],
    imageUrl: "/images/trening-pri-nohe.webp",
    readingMinutes: 14,
    publishedAt: "2026-08-17T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  {
    slug: "stimulus-control-u-psa",
    title: "Stimulus control: kedy pes povel naozaj ovláda",
    excerpt: "Pes si sadne na „sadni“. Znamená to, že povel naozaj ovláda? Nie vždy. Skutočný stimulus control má štyri podmienky a odhalí presnosť vášho tréningu.",
    category: "Výcvik",
    portalSection: "aktivity",
    portalSubpage: "trening",
    status: "published",
    accent: "coral",
    author: "Martin",
    intro: "Pes si sadne, keď poviete „sadni“. Pri presnejšom tréningu však jedna správna reakcia nestačí. Pes môže reagovať na maškrtu, pohyb ruky alebo známe prostredie namiesto samotného signálu.",
    takeaway: "Správanie je pod kontrolou signálu až vtedy, keď pes vykoná správny cvik po správnom cue a nerozhoduje sa podľa náhodných pomocných podnetov.",
    blocks: stimulusBlocks,
    sections: [],
    sources: [],
    imageUrl: "/images/trening-pri-nohe.webp",
    readingMinutes: 5,
    publishedAt: "2026-09-07T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  {
    slug: "ako-vybrat-granule-bez-marketingovych-mytov",
    title: "Ako vybrať granule bez marketingových mýtov",
    excerpt: "Zloženie, energia, tolerancia a kondícia psa: štyri veci, ktoré majú väčšiu váhu než predná strana obalu.",
    category: "Výživa",
    portalSection: "starostlivost",
    portalSubpage: "vyziva",
    status: "published",
    accent: "gold",
    author: "Redakcia Psipedia",
    intro: "Dobré krmivo nie je to s najdlhším zoznamom módnych surovín. Je to kompletná strava, ktorú konkrétny pes dobre trávi, prospieva na nej a zodpovedá jeho veku, aktivite aj zdravotnému stavu.",
    takeaway: "Obal je začiatok, nie verdikt. Sledujte kondíciu, stolicu, kožu, srsť a energiu psa počas niekoľkých týždňov.",
    blocks: granuleBlocks,
    sections: [],
    sources: [],
    imageUrl: "/images/zdravie-veterinar.webp",
    readingMinutes: 9,
    publishedAt: "2026-08-09T08:00:00.000Z",
    contentUpdatedAt: "2026-08-16T08:00:00.000Z",
    showUpdated: true,
    noindex: true,
  },
  {
    slug: "e2e-clanok-bez-obrazka",
    title: "E2E článok bez hero obrázka",
    excerpt: "Testovací článok overuje stabilnú magazínovú kompozíciu bez hlavného obrázka.",
    category: "Zdravie",
    portalSection: "starostlivost",
    portalSubpage: "zdravie",
    status: "published",
    accent: "forest",
    author: "Redakcia Psipedia",
    intro: "Článok zámerne nemá hero obrázok ani vhodný related článok v rovnakej téme.",
    takeaway: "Placeholder nesmie rozbiť titulok, utility ani začiatok čítania.",
    blocks: [
      { id: "no-image-h2-1", type: "h2", text: "Prvá časť článku" },
      { id: "no-image-text-1", type: "text", content: "Prvý blok testovacieho obsahu." },
      { id: "no-image-h2-2", type: "h2", text: "Druhá časť článku" },
      { id: "no-image-text-2", type: "text", content: "Druhý blok testovacieho obsahu." },
    ],
    sections: [],
    sources: [],
    readingMinutes: 4,
    publishedAt: "2026-09-01T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  {
    slug: "e2e-nepublikovany-related",
    title: "E2E nepublikovaný related kandidát",
    excerpt: "Draft fixture sa nesmie objaviť v žiadnom verejnom odporúčaní.",
    category: "Výcvik",
    portalSection: "aktivity",
    portalSubpage: "trening",
    status: "draft",
    accent: "coral",
    author: "Redakcia Psipedia",
    intro: "Tento draft existuje iba na overenie unpublished exclusion.",
    takeaway: "",
    blocks: [{ id: "draft-text", type: "text", content: "Draft obsah." }],
    sections: [],
    sources: [],
    readingMinutes: 2,
    publishedAt: "2026-09-19T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  {
    slug: "e2e-vyskum-psov-2026",
    title: "E2E výskum psov 2026",
    excerpt: "Testovacia publikovaná novinka pre overenie kompletného archívu a kategórie Veda a zdravie.",
    category: "Zdravie",
    portalSection: "novinky",
    newsCategory: "veda-a-zdravie",
    status: "published",
    accent: "blue",
    author: "Redakcia Psipedia",
    intro: "Tento lokálny fixture overuje public news archive bez zásahu do produkčných dát.",
    takeaway: "",
    blocks: [
      { id: "news-1-text", type: "text", content: "Obsah lokálneho E2E fixture pre kompletný archív." },
      { id: "news-1-source", type: "source", label: "Psipedia E2E source", url: "https://psipedia.sk/" },
    ],
    sections: [],
    sources: [],
    imageUrl: "/images/zdravie-veterinar.webp",
    readingMinutes: 3,
    publishedAt: "2026-09-18T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  {
    slug: "e2e-zaujimavost-psov-2026",
    title: "E2E zaujímavosť zo sveta psov",
    excerpt: "Druhá testovacia publikovaná novinka overuje kategórie aj zobrazenie všetkých publikovaných položiek.",
    category: "Život so psom",
    portalSection: "novinky",
    newsCategory: "zaujimavosti",
    status: "published",
    accent: "coral",
    author: "Redakcia Psipedia",
    intro: "Tento lokálny fixture je určený výhradne pre izolované E2E testy.",
    takeaway: "",
    blocks: [
      { id: "news-2-text", type: "text", content: "Druhý lokálny E2E fixture pre filtrovanie archívu." },
      { id: "news-2-source", type: "source", label: "Psipedia E2E source", url: "https://psipedia.sk/" },
    ],
    sections: [],
    sources: [],
    imageUrl: "/images/hero-labrador.webp",
    readingMinutes: 2,
    publishedAt: "2026-09-17T08:00:00.000Z",
    showUpdated: false,
    noindex: true,
  },
  ...sidebarFixtures,
];

function fail(message) {
  throw new Error(`[article-ux-e2e-bootstrap] ${message}`);
}

function requireLocalBaseUrl() {
  if (process.env[REQUIRED_FLAG] !== "1") fail(`Refusing to run without ${REQUIRED_FLAG}=1.`);
  if (process.env.NODE_ENV === "production") fail("Refusing to run with NODE_ENV=production.");
  const url = new URL(process.env.E2E_BASE_URL || DEFAULT_BASE_URL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5173") {
    fail(`Refusing non-local target ${url.origin}.`);
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
  if (!response.ok) fail(`${init.method || "GET"} ${pathname} returned ${response.status}: ${body.slice(0, 500)}`);
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

async function materializeSections(baseUrl) {
  const current = await requestJson(baseUrl, "/api/admin/sections");
  const fixtureSlugs = new Set(sectionFixtures.map((section) => section.slug));
  const preserved = (current.sections || []).filter((section) => !fixtureSlugs.has(section.slug));
  const saved = await requestJson(baseUrl, "/api/admin/sections", {
    method: "PUT",
    body: JSON.stringify({ sections: [...preserved, ...sectionFixtures] }),
  });
  for (const expected of sectionFixtures) {
    const section = saved.sections?.find((item) => item.slug === expected.slug);
    if (!section?.visible) fail(`Managed section ${expected.slug} was not materialized.`);
  }
}

async function findArticle(baseUrl, slug) {
  let page = 1;
  while (true) {
    const result = await requestJson(baseUrl, `/api/admin/articles?page=${page}&limit=100`);
    const match = result.articles?.find((article) => article.slug === slug);
    if (match) return match;
    if (page >= Number(result.pagination?.totalPages || 1)) return null;
    page += 1;
  }
}

async function upsertArticle(baseUrl, fixture) {
  const existing = await findArticle(baseUrl, fixture.slug);
  const result = existing
    ? await requestJson(baseUrl, `/api/admin/articles/${existing.id}`, { method: "PUT", body: JSON.stringify(fixture) })
    : await requestJson(baseUrl, "/api/admin/articles", { method: "POST", body: JSON.stringify(fixture) });
  if (result.article?.slug !== fixture.slug || result.article?.status !== fixture.status) {
    fail(`Article ${fixture.slug} was not persisted with status ${fixture.status}.`);
  }
}

async function verifyPublicRoutes(baseUrl) {
  for (const fixture of articleFixtures.filter((item) => item.status === "published")) {
    const route = `/${fixture.portalSection}/${fixture.slug}`;
    const result = await request(baseUrl, route);
    if (result.response.status !== 200) fail(`${route} returned ${result.response.status}.`);
    if (!result.body.includes(fixture.title)) fail(`${route} is missing its title.`);
  }
}

const baseUrl = requireLocalBaseUrl();
await materializeSections(baseUrl);
for (const fixture of articleFixtures) await upsertArticle(baseUrl, fixture);
await verifyPublicRoutes(baseUrl);
console.log(`[article-ux-e2e-bootstrap] PASS: ${articleFixtures.length} isolated local article fixtures are ready at ${baseUrl}.`);
