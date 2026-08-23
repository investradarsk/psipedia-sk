import { getPublishedArticles } from "@/lib/article-store";
import { articleHref } from "@/lib/portal";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function articleDate(value: string) {
  const date = new Date(`${value}T08:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

export async function GET() {
  const articles = await getPublishedArticles();
  const items = articles.slice(0, 50).map((article) => {
    const url = `${SITE_URL}${articleHref(article)}`;
    const image = article.image
      ? article.image.startsWith("https://") ? article.image : `${SITE_URL}${article.image}`
      : null;
    return `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(article.excerpt)}</description>
      <pubDate>${articleDate(article.dateIso)}</pubDate>
      <dc:creator>${escapeXml(article.author)}</dc:creator>
      <category>${escapeXml(article.category)}</category>${image ? `
      <enclosure url="${escapeXml(image)}" type="image/webp" />` : ""}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE_NAME} – nové články a novinky</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>sk-SK</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
