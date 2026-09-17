import Link from "next/link";
import { categorySlug } from "@/components/article-card";
import { ArticleBlocks, ArticleRichText } from "@/components/article-blocks";
import { ArticleFeedback } from "@/components/article-feedback";
import { FavoriteButton } from "@/components/favorite-button";
import { PawMark } from "@/components/icons";
import { Breadcrumbs, MediaFrame } from "@/components/page-system";
import { ShareButton } from "@/components/share-button";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSectionLabel, portalSubpageHref, type PortalSection } from "@/lib/portal";
import { absoluteUrl, articleAuthorJsonLd, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { articleBlockHeadings, articleBlockPlainText, legacyArticleBlocks } from "@/lib/article-blocks";
import styles from "./article-detail.module.css";

export function ArticleDetail({ article, related, portalSection }: { article: Article; related: Article[]; portalSection?: PortalSection }) {
  const section = articlePortalSection(article);
  const sectionHref = section === "clanky" ? "/clanky" : `/${section}`;
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const reviewCategory = section === "recenzie" && portalSection?.slug === "recenzie" && article.portalSubpage
    ? portalSection.subpages.find((item) => item.slug === article.portalSubpage && item.visible !== false) ?? null
    : null;
  const topicHref = newsCategory ? `/novinky/${newsCategory.slug}` : reviewCategory ? portalSubpageHref(portalSection!, reviewCategory) : `/tema/${categorySlug(article.category)}`;
  const topicLabel = newsCategory?.label ?? reviewCategory?.label ?? article.category;
  const canonical = article.seo?.canonicalUrl || `${SITE_URL}${articleHref(article)}`;
  const image = article.image ? absoluteUrl(article.image) : undefined;
  const blocks = article.blocks?.length
    ? article.blocks
    : legacyArticleBlocks(article.sections, article.sources);
  const contentBlocks = blocks.filter((block) => block.type !== "source");
  const sourceBlocks = blocks.filter((block) => block.type === "source");
  const headings = articleBlockHeadings(blocks);
  const h2Count = headings.filter((heading) => heading.level === 2).length;
  const readMinutes = Number.parseInt(String(article.readTime).match(/\d+/)?.[0] ?? "0", 10);
  const showTableOfContents = readMinutes >= 8 && h2Count >= 5;
  const showUpdated = article.showUpdated ?? article.updatedDateIso !== article.dateIso;
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
        keywords: [article.seo?.focusKeyword, portalSectionLabel(section), topicLabel, article.category, "psy"].filter(Boolean),
        wordCount,
        author: articleAuthorJsonLd(article.author),
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
  const shareLabel = section === "novinky" ? "Zdieľať novinku" : section === "recenzie" ? "Zdieľať recenziu" : "Zdieľať článok";
  const favoriteHint = "Článok si môžeš uložiť v tomto zariadení a vrátiť sa k nemu neskôr.";
  const relatedItems = related.slice(0, 3);

  return (
    <main id="obsah" className={styles.modernArticle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <header className={`${styles.hero} shell`}>
        <Breadcrumbs label="Navigácia v článku">
          <Link href="/">Domov</Link><span>/</span>
          <Link href={sectionHref}>{portalSectionLabel(section)}</Link><span>/</span>
          <Link href={topicHref}>{topicLabel}</Link>
        </Breadcrumbs>
        <div className={styles.heroGrid}>
          <div className={styles.title}>
            <span className={styles.kicker}>{portalSectionLabel(section)} · {topicLabel}</span>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
            <div className={styles.metaActions}>
              <div className="article-byline">
                <strong>{article.author}</strong>
                <time dateTime={article.dateIso}>{article.date}</time>
                {showUpdated && <span className="article-updated">Aktualizované <time dateTime={article.updatedDateIso}>{article.updatedDate}</time></span>}
                <span>{article.readTime} čítania</span>
              </div>
              <div className={styles.favoriteAction} title={favoriteHint}>
                <FavoriteButton slug={article.slug} />
              </div>
            </div>
          </div>
          <MediaFrame className={styles.heroMedia} variant="article">
            {article.image ? (
              <img className="article-hero-image" src={article.image} alt={article.title} decoding="async" />
            ) : (
              <div className={`article-hero-placeholder article-hero-placeholder--${article.accent}`}><PawMark size={86} /></div>
            )}
          </MediaFrame>
        </div>
      </header>

      <div className={`${styles.readingShell} shell`}>
        <article className="article-prose">
          <ArticleRichText className="article-intro" value={article.intro} />
          <aside className="takeaway-box" aria-label="To najdôležitejšie"><strong>To najdôležitejšie</strong><ArticleRichText value={article.takeaway} /></aside>
          {showTableOfContents && (
            <details className={styles.toc}>
              <summary>Obsah článku</summary>
              <nav aria-label="Obsah článku">
                <ol>
                  {headings.map((heading) => (
                    <li className={heading.level === 3 ? styles.tocSubitem : undefined} key={heading.blockId}>
                      <a href={`#${heading.id}`}>{heading.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            </details>
          )}
          <ArticleBlocks blocks={contentBlocks} />
          {sourceBlocks.length > 0 && <ArticleBlocks blocks={sourceBlocks} />}
          <p className="article-disclaimer">{section === "novinky" ? "Správa vychádza z uvedených zdrojov a pri ďalšom vývoji udalosti ju aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku." : section === "recenzie" ? "Ak obsah obsahuje partnerský alebo affiliate odkaz, je označený priamo pri príslušnom odkaze." : "Obsah je informačný a nenahrádza individuálne vyšetrenie veterinárom ani prácu s kvalifikovaným trénerom, ak ju situácia vyžaduje."} <Link href="/opravy-a-podnety">Nahlásiť chybu alebo požiadať o opravu.</Link></p>
          <div className={styles.endActions}>
            <ShareButton title={article.title} label={shareLabel} />
          </div>
          <ArticleFeedback articlePath={articleHref(article)} articleTitle={article.title} />
        </article>
      </div>

      {relatedItems.length > 0 && (
        <section className={`${styles.relatedSection} related-section`}>
          <div className="shell">
            <span className="eyebrow">Pokračovať v téme</span>
            <h2>{section === "recenzie" ? "Súvisiace recenzie a články" : "Súvisiace články"}</h2>
            <div className={styles.relatedList}>
              {relatedItems.map((item) => (
                <Link className={styles.relatedItem} href={articleHref(item)} key={item.slug}>
                  <span>{item.category}</span>
                  <strong>{item.title}</strong>
                  {item.excerpt && <small>{item.excerpt}</small>}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
