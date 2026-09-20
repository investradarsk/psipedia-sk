import Link from "next/link";
import { categorySlug } from "@/components/article-card";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import { ArticleFeedback } from "@/components/article-feedback";
import { FavoriteButton } from "@/components/favorite-button";
import { PawMark } from "@/components/icons";
import { Breadcrumbs, MediaFrame } from "@/components/page-system";
import { PublicContentList } from "@/components/public-visual-system";
import { ArticleListItem } from "@/components/article-list-item";
import { ShareButton } from "@/components/share-button";
import { AdSlot } from "@/components/ad-slot";
import type { Article } from "@/lib/content";
import type { ArticleMagazineData } from "@/lib/article-magazine";
import type { EditorialAuthorProfile } from "@/lib/editorial-authors";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSectionLabel, portalSubpageHref, type PortalSection } from "@/lib/portal";
import { absoluteUrl, articleAuthorJsonLd, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { articleBlockHeadings, articleBlockPlainText, legacyArticleBlocks } from "@/lib/article-blocks";
import { editorialRichTextPlainText, legacyRichTextToDocument } from "@/lib/editorial-content";
import { AD_PLACEMENTS } from "@/lib/monetization";
import styles from "./article-detail.module.css";

function safeExternalImageCreditUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function recommendationTopicLabel(article: Article) {
  return articlePortalSection(article) === "novinky"
    ? getNewsCategory(article.newsCategory)?.shortLabel ?? article.category
    : article.category;
}

export function ArticleDetail({
  article,
  magazine,
  portalSection,
  authorProfile,
}: {
  article: Article;
  magazine: ArticleMagazineData;
  portalSection?: PortalSection;
  authorProfile?: EditorialAuthorProfile | null;
}) {
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
  const imageCreditHref = safeExternalImageCreditUrl(article.imageCreditUrl);
  const showImageMeta = Boolean(article.image && (article.imageCaption || article.imageCredit || imageCreditHref));
  const authorName = authorProfile?.displayName || article.author;
  const blocks = article.blocks?.length
    ? article.blocks
    : legacyArticleBlocks(article.sections, article.sources);
  const contentBlocks = blocks.filter((block) => block.type !== "source" && block.type !== "related");
  const sourceBlocks = blocks.filter((block) => block.type === "source");
  const introDocument = article.introRichText ?? legacyRichTextToDocument(article.intro);
  const takeawayDocument = article.takeawayRichText ?? legacyRichTextToDocument(article.takeaway);
  const showTakeaway = editorialRichTextPlainText(takeawayDocument).length > 0;
  const headings = articleBlockHeadings(blocks);
  const h2Count = headings.filter((heading) => heading.level === 2).length;
  const readMinutes = Number.parseInt(String(article.readTime).match(/\d+/)?.[0] ?? "0", 10);
  const showTableOfContents = readMinutes >= 8 && h2Count >= 5;
  const showUpdated = article.showUpdated ?? article.updatedDateIso !== article.dateIso;
  const wordCount = [editorialRichTextPlainText(introDocument), editorialRichTextPlainText(takeawayDocument), articleBlockPlainText(blocks)]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const structurallySafeMidRelated = contentBlocks.length >= 2 ? magazine.midRelated : null;
  const relatedSplitIndex = structurallySafeMidRelated
    ? Math.max(1, Math.min(contentBlocks.length - 1, Math.round(contentBlocks.length * 0.4)))
    : -1;
  const contentBeforeRelated = relatedSplitIndex > 0 ? contentBlocks.slice(0, relatedSplitIndex) : contentBlocks;
  const contentAfterRelated = relatedSplitIndex > 0 ? contentBlocks.slice(relatedSplitIndex) : [];
  const endRecommendationPool = [
    ...(structurallySafeMidRelated || !magazine.midRelated ? [] : [magazine.midRelated]),
    ...magazine.endRelated,
  ];
  const relatedItems = endRecommendationPool.filter((item, index, items) =>
    item.slug !== article.slug && items.findIndex((candidate) => candidate.slug === item.slug) === index
  ).slice(0, 3);

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
        author: articleAuthorJsonLd(authorName),
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
  const sidebarLabel = magazine.sidebarMode === "latest" ? "Najnovšie články" : "Články";

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
              <div className={styles.bylineWrap}>
                <div className={styles.authorIdentity}>
                  {authorProfile?.avatarUrl ? <img src={authorProfile.avatarUrl} alt="" loading="lazy" decoding="async" /> : null}
                  <span>
                    <strong>{authorName}</strong>
                    {authorProfile?.role ? <small>{authorProfile.role}</small> : null}
                  </span>
                </div>
                <div className={styles.articleMeta}>
                  <span>Publikované <time dateTime={article.dateIso}>{article.date}</time></span>
                  {showUpdated ? <span>Aktualizované <time dateTime={article.updatedDateIso}>{article.updatedDate}</time></span> : null}
                </div>
              </div>
              <div className={styles.utilityActions}>
                <div className={styles.favoriteAction} title={favoriteHint}>
                  <FavoriteButton slug={article.slug} />
                </div>
                <ShareButton title={article.title} label={shareLabel} url={canonical} compact />
              </div>
            </div>
          </div>
          <figure className={styles.heroFigure}>
            <MediaFrame className={styles.heroMedia} variant="article">
              {article.image ? (
                <img className="article-hero-image" src={article.image} alt={article.imageAlt || article.title} loading="eager" fetchPriority="high" decoding="async" />
              ) : (
                <div className={`article-hero-placeholder article-hero-placeholder--${article.accent}`}><PawMark size={72} /></div>
              )}
            </MediaFrame>
            {showImageMeta ? (
              <figcaption className={styles.heroImageMeta}>
                {article.imageCaption ? <span>{article.imageCaption}</span> : null}
                {article.imageCaption && (article.imageCredit || imageCreditHref) ? <span aria-hidden="true"> · </span> : null}
                {article.imageCredit || imageCreditHref ? (
                  <span>
                    Foto: {imageCreditHref ? (
                      <a href={imageCreditHref} target="_blank" rel="noopener noreferrer">{article.imageCredit || "Zdroj fotografie"}</a>
                    ) : article.imageCredit}
                  </span>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        </div>
      </header>

      <div className={`${styles.readingShell} shell`}>
        <div className={styles.magazineLayout}>
          <article className="article-prose">
            <EditorialRichText className="article-intro" document={introDocument} keyPrefix="article-intro" />
            {showTakeaway ? <aside className="takeaway-box" aria-label="To najdôležitejšie"><strong>To najdôležitejšie</strong><EditorialRichText document={takeawayDocument} keyPrefix="article-takeaway" /></aside> : null}
            {showTableOfContents ? (
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
            ) : null}
            <ArticleBlocks blocks={contentBeforeRelated} />
            {structurallySafeMidRelated ? (
              <aside className={styles.midRelated} aria-label="Súvisiaci článok">
                <Link href={articleHref(structurallySafeMidRelated)}>
                  {structurallySafeMidRelated.image ? (
                    <span className={styles.midRelatedImage}>
                      <img src={structurallySafeMidRelated.image} alt="" loading="lazy" decoding="async" />
                    </span>
                  ) : null}
                  <span className={styles.midRelatedCopy}>
                    <span className={styles.midRelatedLabel}>SÚVISIACI ČLÁNOK</span>
                    <small>{recommendationTopicLabel(structurallySafeMidRelated)}</small>
                    <strong>{structurallySafeMidRelated.title}</strong>
                    <span className={styles.midRelatedArrow} aria-hidden="true">→</span>
                  </span>
                </Link>
              </aside>
            ) : null}
            {contentAfterRelated.length > 0 ? <ArticleBlocks blocks={contentAfterRelated} /> : null}
            {sourceBlocks.length > 0 ? <ArticleBlocks blocks={sourceBlocks} /> : null}
            <AdSlot placementId={AD_PLACEMENTS.ARTICLE_END.id} />
            <p className="article-disclaimer">{section === "novinky" ? (sourceBlocks.length > 0 ? "Správa vychádza z uvedených zdrojov a pri ďalšom vývoji udalosti ju aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku." : "Správu pri ďalšom vývoji udalosti priebežne aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku.") : section === "recenzie" ? "Ak obsah obsahuje partnerský alebo affiliate odkaz, je označený priamo pri príslušnom odkaze." : "Obsah je informačný a nenahrádza individuálne vyšetrenie veterinárom ani prácu s kvalifikovaným trénerom, ak ju situácia vyžaduje."} <Link href="/opravy-a-podnety">Nahlásiť chybu alebo požiadať o opravu.</Link></p>
            <div className={styles.endActions} id="zdielat-clanok">
              <ShareButton title={article.title} label={shareLabel} url={canonical} />
            </div>
            <ArticleFeedback articlePath={articleHref(article)} articleTitle={article.title} />
          </article>

          {magazine.sidebarItems.length > 0 ? (
            <aside className={styles.sidebar} aria-label={sidebarLabel}>
              <div className={styles.sidebarSticky}>
                <span className={styles.sidebarHeading}>{sidebarLabel}</span>
                <ol>
                  {magazine.sidebarItems.map((item, index) => (
                    <li key={item.slug}>
                      <span className={styles.sidebarRank} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <Link href={articleHref(item)}>
                        <strong>{item.title}</strong>
                        <small>{recommendationTopicLabel(item)} · <time dateTime={item.dateIso}>{item.date}</time></small>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {relatedItems.length > 0 ? (
        <section className={`${styles.relatedSection} related-section`}>
          <div className="shell">
            <span className="eyebrow">Pokračovať v čítaní</span>
            <h2>Ďalšie články k téme</h2>
            <PublicContentList label="Ďalšie články k téme" className={styles.relatedList}>
              {relatedItems.map((item) => (
                <ArticleListItem
                  key={item.slug}
                  article={item}
                  topicLabel={recommendationTopicLabel(item)}
                />
              ))}
            </PublicContentList>
          </div>
        </section>
      ) : null}
    </main>
  );
}
