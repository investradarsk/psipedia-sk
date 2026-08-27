import { getPublishedArticles } from "@/lib/article-store";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const NEWS_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_NEWS_ITEMS = 1000;

type PublishedArticle = Awaited<ReturnType<typeof getPublishedArticles>>[number];

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function publicationDate(article: PublishedArticle) {
  const stored = "publishedAt" in article && typeof article.publishedAt === "string"
    ? article.publishedAt
    : article.dateIso;
  const parsed = new Date(stored);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function canonicalArticleUrl(article: PublishedArticle) {
  try {
    const url = new URL(articleHref(article), SITE_URL);
    if (url.origin !== SITE_URL || !url.pathname.startsWith("/novinky/")) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  const articles = (await getPublishedArticles())
    .flatMap((article) => {
      if (articlePortalSection(article) !== "novinky" || article.seo?.noindex || !article.title.trim()) return [];
      const published = publicationDate(article);
      const loc = canonicalArticleUrl(article);
      if (!published || !loc || published.getTime() > now) return [];
      return [{ article, loc, published }];
    })
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .slice(0, MAX_NEWS_ITEMS);

  const urls = articles.map(({ article, loc, published }) => {
    // Google allows older article URLs to stay in this base sitemap after the
    // News extension is removed. That prevents an empty urlset between
    // publishing days without presenting old content as fresh news.
    const newsMetadata = now - published.getTime() <= NEWS_WINDOW_MS ? `
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>sk</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(published.toISOString())}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>` : "";

    return `
  <url>
    <loc>${escapeXml(loc)}</loc>${newsMetadata}
  </url>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
