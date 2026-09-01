import { env } from "cloudflare:workers";
import { articles as seedArticles, type Article, type ArticleSection, type ArticleSource } from "@/lib/content";
import {
  getPortalSubpage,
  isArticlePortalSection,
  type ArticlePortalSection,
} from "@/lib/portal";
import { isNewsCategory, type NewsCategorySlug } from "@/lib/news";
import {
  articleBlockSources,
  legacyArticleBlocks,
  normalizeArticleBlocks,
  type ArticleBlock,
} from "@/lib/article-blocks";

export type ArticleStatus = "draft" | "scheduled" | "published";

export type ManagedArticle = Article & {
  id: number;
  portalSection: ArticlePortalSection;
  status: ArticleStatus;
  imageKey: string | null;
  ogImageKey: string | null;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  showUpdated: boolean;
  createdBy: string;
  updatedBy: string;
  relatedBreedIds: number[];
};

export type ManagedArticleSummary = Pick<
  ManagedArticle,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "category"
  | "portalSection"
  | "newsCategory"
  | "status"
  | "accent"
  | "image"
  | "updatedAt"
>;

export type ManagedArticleSummaryPage = {
  articles: ManagedArticleSummary[];
  counts: {
    total: number;
    published: number;
    scheduled: number;
    draft: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ManagedArticleInput = {
  slug?: string;
  title?: string;
  excerpt?: string;
  category?: string;
  portalSection?: string;
  portalSubpage?: string | null;
  newsCategory?: string | null;
  status?: string;
  accent?: string;
  author?: string;
  intro?: string;
  takeaway?: string;
  sections?: ArticleSection[];
  blocks?: ArticleBlock[];
  sources?: ArticleSource[];
  imageUrl?: string | null;
  imageKey?: string | null;
  readingMinutes?: number;
  publishedAt?: string | null;
  contentUpdatedAt?: string | null;
  showUpdated?: boolean;
  seoTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  noindex?: boolean;
  focusKeyword?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string | null;
  ogImageKey?: string | null;
  relatedBreedIds?: number[];
};

type ArticleRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  portal_section: string;
  portal_subpage: string | null;
  news_category: string | null;
  status: string;
  accent: string;
  author: string;
  intro: string;
  takeaway: string;
  sections_json: string;
  sources_json: string;
  blocks_json: string;
  image_url: string | null;
  image_key: string | null;
  reading_minutes: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
  content_updated_at: string | null;
  show_updated_label: number;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  noindex: number;
  focus_keyword: string;
  og_title: string;
  og_description: string;
  og_image_url: string | null;
  og_image_key: string | null;
};

type ArticleSummaryRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  portal_section: string;
  news_category: string | null;
  status: string;
  accent: string;
  image_url: string | null;
  updated_at: string;
};

type HomepageArticleRow = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  portal_section: string;
  news_category: string | null;
  accent: string;
  image_url: string | null;
  reading_minutes: number;
  published_at: string;
};

type ArticleCountRow = {
  total: number;
  published: number;
  scheduled: number;
  draft: number;
};

type RuntimeBindings = {
  DB?: D1Database;
};

const ARTICLE_CATEGORIES = ["Výcvik", "Zdravie", "Výživa", "Život so psom"] as const;
const ARTICLE_ACCENTS = ["forest", "coral", "gold", "blue"] as const;

function getD1Binding() {
  const runtime = env as unknown as RuntimeBindings;
  return runtime.DB && typeof runtime.DB.prepare === "function" ? runtime.DB : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) {
    throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  }
  return database;
}

async function ensureArticleStore(database: D1Database) {
  void database;
  // Production schema changes are applied by Wrangler migrations during
  // deployment. Never mutate or probe the schema from a page request: an
  // interrupted migration must not turn the whole admin into Worker 1101.
}

function parseJsonArray<T>(value: string, fallback: T[]) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseReadingMinutes(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 5;
}

function formatSlovakDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const months = [
    "januára",
    "februára",
    "marca",
    "apríla",
    "mája",
    "júna",
    "júla",
    "augusta",
    "septembra",
    "októbra",
    "novembra",
    "decembra",
  ];
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function rowToManagedArticle(row: ArticleRow,relatedBreedIds:number[]=[]): ManagedArticle {
  const createdAt = typeof row.created_at === "string" && row.created_at
    ? row.created_at
    : new Date(0).toISOString();
  const updatedAt = typeof row.updated_at === "string" && row.updated_at
    ? row.updated_at
    : createdAt;
  const publishedAt = typeof row.published_at === "string" && row.published_at
    ? row.published_at
    : createdAt;
  const sections = parseJsonArray<ArticleSection>(row.sections_json, []);
  const sources = parseJsonArray<ArticleSource>(row.sources_json, []);
  const storedBlocks = parseJsonArray<ArticleBlock>(row.blocks_json ?? "[]", []);
  const blocks = storedBlocks.length ? normalizeArticleBlocks(storedBlocks) : legacyArticleBlocks(sections, sources);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category as Article["category"],
    portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
    portalSubpage: row.portal_subpage || undefined,
    newsCategory: row.news_category && isNewsCategory(row.news_category) ? row.news_category : undefined,
    date: formatSlovakDate(publishedAt),
    dateIso: publishedAt.slice(0, 10),
    updatedDate: formatSlovakDate(row.content_updated_at || updatedAt),
    updatedDateIso: (row.content_updated_at || updatedAt).slice(0, 10),
    readTime: `${row.reading_minutes} min`,
    image: row.image_url ?? undefined,
    accent: row.accent as Article["accent"],
    author: row.author,
    intro: row.intro,
    takeaway: row.takeaway,
    sections,
    sources,
    blocks,
    status: row.status === "published" ? "published" : row.status === "scheduled" ? "scheduled" : "draft",
    imageKey: row.image_key,
    ogImageKey: row.og_image_key ?? null,
    readingMinutes: row.reading_minutes,
    createdAt,
    updatedAt,
    publishedAt: row.published_at,
    contentUpdatedAt: row.content_updated_at ?? null,
    showUpdated: Boolean(row.show_updated_label),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    relatedBreedIds,
    seo: {
      title: row.seo_title || undefined,
      description: row.meta_description || undefined,
      canonicalUrl: row.canonical_url || undefined,
      noindex: Boolean(row.noindex),
      focusKeyword: row.focus_keyword || undefined,
      ogTitle: row.og_title || undefined,
      ogDescription: row.og_description || undefined,
      ogImage: row.og_image_url || undefined,
    },
  };
}

function rowToManagedArticleSummary(row: ArticleSummaryRow): ManagedArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category as Article["category"],
    portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
    newsCategory: row.news_category && isNewsCategory(row.news_category) ? row.news_category : undefined,
    status: row.status === "published" ? "published" : row.status === "scheduled" ? "scheduled" : "draft",
    accent: row.accent as Article["accent"],
    image: row.image_url ?? undefined,
    updatedAt: row.updated_at,
  };
}

function rowToHomepageArticle(row: HomepageArticleRow): Article {
  const publishedAt = row.published_at || new Date(0).toISOString();
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category as Article["category"],
    portalSection: isArticlePortalSection(row.portal_section) ? row.portal_section : "clanky",
    newsCategory: row.news_category && isNewsCategory(row.news_category) ? row.news_category : undefined,
    date: formatSlovakDate(publishedAt),
    dateIso: publishedAt.slice(0, 10),
    updatedDate: formatSlovakDate(publishedAt),
    updatedDateIso: publishedAt.slice(0, 10),
    readTime: `${row.reading_minutes} min`,
    image: row.image_url ?? undefined,
    accent: row.accent as Article["accent"],
    author: "Redakcia Psipedia",
    intro: "",
    takeaway: "",
    sections: [],
    sources: [],
  };
}

export function slugifyArticleTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeInput(payload: ManagedArticleInput) {
  const title = payload.title?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || title);
  const excerpt = payload.excerpt?.trim() ?? "";
  const intro = payload.intro?.trim() ?? "";
  const takeaway = payload.takeaway?.trim() ?? "";
  const author = payload.author?.trim() || "Redakcia Psipedia";
  const status: ArticleStatus = payload.status === "published" ? "published" : payload.status === "scheduled" ? "scheduled" : "draft";
  const category = ARTICLE_CATEGORIES.includes(payload.category as (typeof ARTICLE_CATEGORIES)[number])
    ? (payload.category as Article["category"])
    : null;
  const portalSection: ArticlePortalSection = payload.portalSection && isArticlePortalSection(payload.portalSection)
    ? payload.portalSection
    : "clanky";
  const portalSubpage = (portalSection === "steniatka" || portalSection === "starostlivost" || portalSection === "aktivity") && payload.portalSubpage && getPortalSubpage(portalSection, payload.portalSubpage)
    ? payload.portalSubpage
    : null;
  const newsCategory: NewsCategorySlug | null = portalSection === "novinky"
    ? payload.newsCategory && isNewsCategory(payload.newsCategory) ? payload.newsCategory : "zo-sveta"
    : null;
  const accent = ARTICLE_ACCENTS.includes(payload.accent as (typeof ARTICLE_ACCENTS)[number])
    ? (payload.accent as Article["accent"])
    : "forest";
  const readingMinutes = Math.min(60, Math.max(1, Math.round(Number(payload.readingMinutes) || 5)));
  const publishedAt = payload.publishedAt ? new Date(payload.publishedAt).toISOString() : null;
  const contentUpdatedAt = payload.contentUpdatedAt ? new Date(payload.contentUpdatedAt).toISOString() : payload.showUpdated ? new Date().toISOString() : null;
  const sections = (payload.sections ?? [])
    .map((section) => ({
      heading: section.heading?.trim() ?? "",
      paragraphs: (section.paragraphs ?? []).map((paragraph) => paragraph.trim()).filter(Boolean),
      bullets: (section.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean),
      tip: section.tip?.trim() || undefined,
    }))
    .filter((section) => section.heading || section.paragraphs.length || section.bullets?.length || section.tip);
  const blocks = normalizeArticleBlocks(payload.blocks ?? []);
  const relatedBreedIds=[...new Set((payload.relatedBreedIds??[]).map(Number).filter((id)=>Number.isSafeInteger(id)&&id>0))].slice(0,50);
  const blockSources = articleBlockSources(blocks);
  const sources = (blockSources.length ? blockSources : payload.sources ?? [])
    .map((source) => ({ label: source.label?.trim() ?? "", url: source.url?.trim() ?? "", ...(source.accessedAt ? { accessedAt: source.accessedAt } : {}) }))
    .filter((source) => source.label || source.url);

  if (!title) throw new Error("Doplň názov článku.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa článku nie je platná.");
  if (portalSection !== "clanky" && getPortalSubpage(portalSection, slug)) {
    throw new Error("Túto adresu už používa podsekcia portálu. Uprav adresu článku.");
  }
  if (!category) throw new Error("Vyber tému článku.");
  if (portalSection === "steniatka" && !portalSubpage) throw new Error("Vyber oblasť v sekcii Šteniatka.");
  if (portalSection === "starostlivost" && !portalSubpage) throw new Error("Vyber oblasť v sekcii Zdravie a starostlivosť.");
  if (portalSection === "aktivity" && !portalSubpage) throw new Error("Vyber oblasť v sekcii Výcvik a aktivity.");
  if (excerpt.length < 20) throw new Error("Perex by mal mať aspoň 20 znakov.");
  if (intro.length < 20) throw new Error("Úvod by mal mať aspoň 20 znakov.");
  if (takeaway.length < 10) throw new Error("Doplň hlavné posolstvo článku.");
  if (!blocks.length && !sections.length) throw new Error("Pridaj aspoň jeden obsahový blok.");
  if (portalSection === "novinky" && status !== "draft" && !sources.length) {
    throw new Error("Novinka potrebuje pred publikovaním aspoň jeden overiteľný zdroj.");
  }
  if (status === "scheduled" && (!publishedAt || new Date(publishedAt).getTime() <= Date.now())) throw new Error("Pre plánované publikovanie vyber budúci dátum a čas.");
  if (status === "published" && publishedAt && new Date(publishedAt).getTime() > Date.now()) throw new Error("Budúci dátum použi cez tlačidlo Naplánovať publikovanie.");

  for (const source of sources) {
    if (!source.label || !source.url) throw new Error("Každý zdroj potrebuje názov aj odkaz.");
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error(`Odkaz na zdroj „${source.label}“ nie je platný.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`Odkaz na zdroj „${source.label}“ musí začínať http:// alebo https://.`);
    }
  }

  for (const block of blocks) {
    if ((block.type === "image" && block.url && !block.alt) || (block.type === "gallery" && block.images.some((image) => !image.alt))) {
      throw new Error("Každý obrázok v obsahu potrebuje alt text.");
    }
    if (block.type === "source" && (!block.label || !block.url)) {
      throw new Error("Každý odborný zdroj potrebuje názov aj odkaz.");
    }
    if (block.type === "related" && (!block.title || !block.href)) {
      throw new Error("Súvisiaci článok potrebuje názov aj odkaz.");
    }
  }

  const imageUrl = payload.imageUrl?.trim() || null;
  const ogImageUrl = payload.ogImageUrl?.trim() || null;
  if (
    imageUrl &&
    !imageUrl.startsWith("/media/") &&
    !imageUrl.startsWith("/images/") &&
    !/^https:\/\//i.test(imageUrl)
  ) {
    throw new Error("Adresa titulného obrázka nie je platná.");
  }
  if (ogImageUrl && !ogImageUrl.startsWith("/media/") && !ogImageUrl.startsWith("/images/") && !/^https:\/\//i.test(ogImageUrl)) throw new Error("Adresa Open Graph obrázka nie je platná.");
  const canonicalUrl = payload.canonicalUrl?.trim() ?? "";
  if (canonicalUrl) {
    try {
      const parsed = new URL(canonicalUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      throw new Error("Canonical URL musí byť úplná platná webová adresa.");
    }
  }

  return {
    slug,
    title,
    excerpt,
    category,
    portalSection,
    portalSubpage,
    newsCategory,
    status,
    accent,
    author,
    intro,
    takeaway,
    sections,
    sources,
    blocks,
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    readingMinutes,
    publishedAt,
    contentUpdatedAt,
    showUpdated: Boolean(payload.showUpdated),
    seoTitle: payload.seoTitle?.trim().slice(0, 180) ?? "",
    metaDescription: payload.metaDescription?.trim().slice(0, 320) ?? "",
    canonicalUrl,
    noindex: Boolean(payload.noindex),
    focusKeyword: payload.focusKeyword?.trim().slice(0, 160) ?? "",
    ogTitle: payload.ogTitle?.trim().slice(0, 180) ?? "",
    ogDescription: payload.ogDescription?.trim().slice(0, 320) ?? "",
    ogImageUrl,
    ogImageKey: payload.ogImageKey?.trim() || null,
    relatedBreedIds,
  };
}

export async function getPublishedArticles(): Promise<Article[]> {
  const database = getD1Binding();
  if (!database) return seedArticles;
  await ensureArticleStore(database);
  const result = await database
    .prepare(
      "SELECT * FROM managed_articles WHERE status = 'published' OR (status = 'scheduled' AND published_at <= ?) ORDER BY published_at DESC, updated_at DESC, id DESC",
    )
    .bind(new Date().toISOString())
    .all<ArticleRow>();
  return result.results.map(rowToManagedArticle);
}

export async function getHomepageArticles(): Promise<Article[]> {
  const database = getD1Binding();
  if (!database) {
    const news = seedArticles.filter((article) => article.portalSection === "novinky").slice(0, 3);
    const guides = seedArticles.filter((article) => article.portalSection !== "novinky").slice(0, 3);
    return [...news, ...guides];
  }
  await ensureArticleStore(database);
  const result = await database.prepare(`
    WITH ranked AS (
      SELECT slug, title, excerpt, category, portal_section, news_category, accent, image_url,
        reading_minutes, published_at,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN portal_section = 'novinky' THEN 0 ELSE 1 END
          ORDER BY published_at DESC, updated_at DESC, id DESC
        ) AS homepage_rank
      FROM managed_articles
      WHERE status = 'published' OR (status = 'scheduled' AND published_at <= ?)
    )
    SELECT slug, title, excerpt, category, portal_section, news_category, accent, image_url,
      reading_minutes, published_at
    FROM ranked
    WHERE homepage_rank <= 3
    ORDER BY published_at DESC
  `).bind(new Date().toISOString()).all<HomepageArticleRow>();
  return result.results.map(rowToHomepageArticle);
}

export async function getPublishedArticle(slug: string): Promise<Article | null> {
  const database = getD1Binding();
  if (!database) return seedArticles.find((article) => article.slug === slug) ?? null;
  await ensureArticleStore(database);
  const row = await database
    .prepare("SELECT * FROM managed_articles WHERE slug = ? AND (status = 'published' OR (status = 'scheduled' AND published_at <= ?)) LIMIT 1")
    .bind(slug, new Date().toISOString())
    .first<ArticleRow>();
  return row ? rowToManagedArticle(row) : null;
}

export async function listManagedArticleSummaries(options: {
  page?: number;
  pageSize?: number;
  portalSection?: ArticlePortalSection;
} = {}): Promise<ManagedArticleSummaryPage> {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? 50)));
  const where = options.portalSection ? "WHERE portal_section = ?" : "";
  const bindings = options.portalSection ? [options.portalSection] : [];
  const listStatement = database.prepare(`
    SELECT id, slug, title, excerpt, category, portal_section, news_category, status, accent, image_url, updated_at
    FROM managed_articles
    ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, (page - 1) * pageSize);
  const countStatement = database.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
      COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS scheduled,
      COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS draft
    FROM managed_articles
    ${where}
  `).bind(...bindings);
  const [listResult, countResult] = await database.batch([listStatement, countStatement]);
  const rows = (listResult.results ?? []) as unknown as ArticleSummaryRow[];
  const rawCounts = (countResult.results?.[0] ?? null) as unknown as ArticleCountRow | null;
  const counts = {
    total: Number(rawCounts?.total ?? 0),
    published: Number(rawCounts?.published ?? 0),
    scheduled: Number(rawCounts?.scheduled ?? 0),
    draft: Number(rawCounts?.draft ?? 0),
  };
  return {
    articles: rows.map(rowToManagedArticleSummary),
    counts,
    pagination: {
      page,
      pageSize,
      total: counts.total,
      totalPages: Math.max(1, Math.ceil(counts.total / pageSize)),
    },
  };
}

export async function getManagedArticleById(id: number) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const [articleResult,relationsResult] = await database.batch([
    database.prepare("SELECT * FROM managed_articles WHERE id = ? LIMIT 1").bind(id),
    database.prepare("SELECT breed_id AS id FROM breed_article_relations WHERE article_id=? ORDER BY breed_id").bind(id),
  ]);
  const row=(articleResult.results?.[0]??null) as unknown as ArticleRow|null;
  const relatedBreedIds=(relationsResult.results as Array<{id:number}>).map((item)=>item.id);
  return row ? rowToManagedArticle(row,relatedBreedIds) : null;
}

async function syncArticleBreeds(database:D1Database,articleId:number,breedIds:number[],editorEmail:string){const now=new Date().toISOString();const statements=[database.prepare("DELETE FROM breed_article_relations WHERE article_id=?").bind(articleId)];for(const breedId of breedIds)statements.push(database.prepare("INSERT OR IGNORE INTO breed_article_relations (breed_id,article_id,created_at,created_by) SELECT id,?,?,? FROM managed_breeds WHERE id=?").bind(articleId,now,editorEmail,breedId));await database.batch(statements);}

export async function createManagedArticle(payload: ManagedArticleInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? input.publishedAt ?? now : input.status === "scheduled" ? input.publishedAt : null;

  const result = await database
    .prepare(`
      INSERT INTO managed_articles (
        slug, title, excerpt, category, portal_section, portal_subpage, news_category, status, accent, author, intro,
        takeaway, sections_json, sources_json, blocks_json, image_url, image_key,
        reading_minutes, created_at, updated_at, published_at, created_by, updated_by,
        content_updated_at, show_updated_label, seo_title, meta_description, canonical_url, noindex,
        focus_keyword, og_title, og_description, og_image_url, og_image_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
    .bind(
      input.slug,
      input.title,
      input.excerpt,
      input.category,
      input.portalSection,
      input.portalSubpage,
      input.newsCategory,
      input.status,
      input.accent,
      input.author,
      input.intro,
      input.takeaway,
      JSON.stringify(input.sections),
      JSON.stringify(input.sources),
      JSON.stringify(input.blocks),
      input.imageUrl,
      input.imageKey,
      input.readingMinutes,
      now,
      now,
      publishedAt,
      editorEmail,
      editorEmail,
      input.contentUpdatedAt,
      input.showUpdated ? 1 : 0,
      input.seoTitle,
      input.metaDescription,
      input.canonicalUrl,
      input.noindex ? 1 : 0,
      input.focusKeyword,
      input.ogTitle,
      input.ogDescription,
      input.ogImageUrl,
      input.ogImageKey,
    )
    .first<ArticleRow>();

  if (!result) throw new Error("Článok sa nepodarilo vytvoriť.");
  await syncArticleBreeds(database,result.id,input.relatedBreedIds,editorEmail);
  return rowToManagedArticle(result,input.relatedBreedIds);
}

export async function updateManagedArticle(
  id: number,
  payload: ManagedArticleInput,
  editorEmail: string,
  existingArticle?: ManagedArticle,
) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  const existing = existingArticle ?? await getManagedArticleById(id);
  if (!existing) return null;

  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published"
    ? input.publishedAt ?? existing.publishedAt ?? now
    : input.status === "scheduled"
      ? input.publishedAt
      : input.publishedAt ?? existing.publishedAt;
  const result = await database
    .prepare(`
      UPDATE managed_articles SET
        slug = ?, title = ?, excerpt = ?, category = ?, portal_section = ?, portal_subpage = ?, news_category = ?, status = ?, accent = ?,
        author = ?, intro = ?, takeaway = ?, sections_json = ?, sources_json = ?, blocks_json = ?,
        image_url = ?, image_key = ?, reading_minutes = ?, updated_at = ?,
        published_at = ?, updated_by = ?, content_updated_at = ?, show_updated_label = ?,
        seo_title = ?, meta_description = ?, canonical_url = ?, noindex = ?, focus_keyword = ?,
        og_title = ?, og_description = ?, og_image_url = ?, og_image_key = ?
      WHERE id = ?
      RETURNING *
    `)
    .bind(
      input.slug,
      input.title,
      input.excerpt,
      input.category,
      input.portalSection,
      input.portalSubpage,
      input.newsCategory,
      input.status,
      input.accent,
      input.author,
      input.intro,
      input.takeaway,
      JSON.stringify(input.sections),
      JSON.stringify(input.sources),
      JSON.stringify(input.blocks),
      input.imageUrl,
      input.imageKey,
      input.readingMinutes,
      now,
      publishedAt,
      editorEmail,
      input.contentUpdatedAt,
      input.showUpdated ? 1 : 0,
      input.seoTitle,
      input.metaDescription,
      input.canonicalUrl,
      input.noindex ? 1 : 0,
      input.focusKeyword,
      input.ogTitle,
      input.ogDescription,
      input.ogImageUrl,
      input.ogImageKey,
      id,
    )
    .first<ArticleRow>();

  if(!result)return null;
  await syncArticleBreeds(database,id,input.relatedBreedIds,editorEmail);
  return rowToManagedArticle(result,input.relatedBreedIds);
}

export async function deleteManagedArticle(id: number) {
  const database = requireD1Binding();
  await ensureArticleStore(database);
  await database.prepare("DELETE FROM breed_article_relations WHERE article_id=?").bind(id).run();
  const row = await database
    .prepare("DELETE FROM managed_articles WHERE id = ? RETURNING *")
    .bind(id)
    .first<ArticleRow>();
  return row ? rowToManagedArticle(row) : null;
}

export function isArticleSlugConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("managed_articles.slug");
}
