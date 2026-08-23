import { getPublishedArticles } from "@/lib/article-store";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const articles = (await getPublishedArticles()).filter((article) => {
    if (articlePortalSection(article) !== "novinky") return false;
    const published = new Date(`${article.dateIso}T00:00:00.000Z`).getTime();
    return Number.isFinite(published) && published <= now && now - published <= twoDays;
  });
  const urls = articles.map((article) => `
  <url>
    <loc>${escapeXml(`${SITE_URL}${articleHref(article)}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${SITE_NAME}</news:name>
        <news:language>sk</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(article.dateIso)}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`).join("");

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
