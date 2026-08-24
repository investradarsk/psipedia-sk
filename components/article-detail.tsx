import Link from "next/link";
import { ArticleCard, categorySlug } from "@/components/article-card";
import { ArticleBlocks } from "@/components/article-blocks";
import { FavoriteButton } from "@/components/favorite-button";
import { PawMark } from "@/components/icons";
import { ShareButton } from "@/components/share-button";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSectionLabel } from "@/lib/portal";
import { absoluteUrl, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { articleBlockPlainText, legacyArticleBlocks } from "@/lib/article-blocks";

export function ArticleDetail({ article, related }: { article: Article; related: Article[] }) {
  const section = articlePortalSection(article);
  const sectionHref = section === "clanky" ? "/clanky" : `/${section}`;
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topicHref = newsCategory ? `/novinky/${newsCategory.slug}` : `/tema/${categorySlug(article.category)}`;
  const topicLabel = newsCategory?.label ?? article.category;
  const canonical = `${SITE_URL}${articleHref(article)}`;
  const image = article.image ? absoluteUrl(article.image) : undefined;
  const blocks = article.blocks?.length
    ? article.blocks
    : legacyArticleBlocks(article.sections, article.sources);
  const wordCount = [article.intro, article.takeaway, articleBlockPlainText(blocks)]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": section === "novinky" ? "NewsArticle" : "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        headline: article.title,
        description: article.excerpt,
        datePublished: article.dateIso,
        dateModified: article.updatedDateIso,
        inLanguage: "sk-SK",
        isAccessibleForFree: true,
        articleSection: topicLabel,
        keywords: [portalSectionLabel(section), topicLabel, article.category, "psy"],
        wordCount,
        author: { "@type": "Organization", name: article.author, url: `${SITE_URL}/o-nas` },
        publisher: {
          "@type": "Organization",
          "@id": ORGANIZATION_ID,
          name: "Psipedia.sk",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg`, width: 64, height: 64 },
        },
        image: image ? [image] : undefined,
        thumbnailUrl: image,
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: portalSectionLabel(section), item: `${SITE_URL}${sectionHref}` },
          { "@type": "ListItem", position: 3, name: topicLabel, item: `${SITE_URL}${topicHref}` },
          { "@type": "ListItem", position: 4, name: article.title, item: canonical },
        ],
      },
    ],
  };

  return (
    <main id="obsah">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <header className="article-hero shell">
        <nav className="article-breadcrumbs" aria-label="Navigácia v článku">
          <Link href="/">Domov</Link><span>/</span>
          <Link href={sectionHref}>{portalSectionLabel(section)}</Link><span>/</span>
          <Link href={topicHref}>{topicLabel}</Link>
        </nav>
        <div className="article-hero-grid">
          <div className="article-title">
            <span className="eyebrow">{portalSectionLabel(section)} · {topicLabel}</span>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
            <div className="article-byline">
              <strong>{article.author}</strong>
              <time dateTime={article.dateIso}>{article.date}</time>
              <span>Aktualizované <time dateTime={article.updatedDateIso}>{article.updatedDate}</time></span>
              <span>{article.readTime} čítania</span>
            </div>
          </div>
          {article.image ? (
            <img className="article-hero-image" src={article.image} alt={article.title} decoding="async" />
          ) : (
            <div className={`article-hero-placeholder article-hero-placeholder--${article.accent}`}><PawMark size={86} /></div>
          )}
        </div>
      </header>

      <div className="article-content-wrap shell">
        <article className="article-prose">
          <p className="article-intro">{article.intro}</p>
          <div className="takeaway-box"><strong>To najdôležitejšie</strong><p>{article.takeaway}</p></div>
          <ArticleBlocks blocks={blocks} />
          <p className="article-disclaimer">{section === "novinky" ? "Správa vychádza z uvedených zdrojov a pri ďalšom vývoji udalosti ju aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku." : "Obsah je informačný a nenahrádza individuálne vyšetrenie veterinárom ani prácu s kvalifikovaným trénerom, ak ju situácia vyžaduje."} <Link href="/opravy-a-podnety">Nahlásiť chybu alebo požiadať o opravu.</Link></p>
        </article>
        <aside className="article-aside" aria-label="Nástroje článku">
          <FavoriteButton slug={article.slug} />
          <ShareButton title={article.title} label={section === "novinky" ? "Zdieľať novinku" : "Zdieľať článok"} />
          <p className="article-aside-note">Článok si môžeš uložiť v tomto zariadení a vrátiť sa k nemu neskôr.</p>
        </aside>
      </div>

      <section className="related-section">
        <div className="shell">
          <span className="eyebrow">Pokračuj v čítaní</span>
          <h2>Mohlo by sa ti hodiť</h2>
          <div className="article-grid">{related.map((item) => <ArticleCard article={item} key={item.slug} />)}</div>
        </div>
      </section>
    </main>
  );
}
