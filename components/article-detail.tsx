import Link from "next/link";
import { categorySlug } from "@/components/article-card";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import { ArticleFeedback } from "@/components/article-feedback";
import { ArticleReadTracker } from "@/components/article-read-tracker";
import { ArticleReadingProgress } from "@/components/article-reading-progress";
import { ArticlePopularitySidebar } from "@/components/article-popularity-sidebar";
import { ArticlePromo } from "@/components/article-promo";
import { ArticleContinuation } from "@/components/article-continuation";
import { FavoriteButton } from "@/components/favorite-button";
import { Breadcrumbs, MediaFrame } from "@/components/page-system";
import { PublicContentList } from "@/components/public-visual-system";
import { ArticleListItem } from "@/components/article-list-item";
import { ShareButton } from "@/components/share-button";
import { RelatedBreedList } from "@/components/related-entity-list";
import { AdSlot } from "@/components/ad-slot";
import type { Article } from "@/lib/content";
import type { ArticleMagazineData } from "@/lib/article-magazine";
import type { ArticleDiscoveryData } from "@/lib/article-discovery";
import { resolveArticleContinuation } from "@/lib/article-continuation";
import type { EditorialAuthorProfile } from "@/lib/editorial-authors";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection, portalSectionLabel, portalSubpageHref, type PortalSection } from "@/lib/portal";
import { absoluteUrl, articleAuthorJsonLd, buildWebPageJsonLd, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { articleBlockHeadings, articleBlockPlainText, legacyArticleBlocks } from "@/lib/article-blocks";
import { editorialRichTextPlainText, legacyRichTextToDocument } from "@/lib/editorial-content";
import { AD_PLACEMENTS } from "@/lib/monetization";
import type { PublicRelatedBreed } from "@/lib/content-relations";
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
  discovery,
  portalSection,
  authorProfile,
  relatedBreeds = [],
}: {
  article: Article;
  magazine: ArticleMagazineData;
  discovery: ArticleDiscoveryData;
  portalSection?: PortalSection;
  authorProfile?: EditorialAuthorProfile | null;
  relatedBreeds?: PublicRelatedBreed[];
}) {
  const section = articlePortalSection(article);
  const sectionHref = section === "clanky" ? "/clanky" : `/${section}`;
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const reviewCategory = section === "recenzie" && portalSection?.slug === "recenzie" && article.portalSubpage
    ? portalSection.subpages.find((item) => item.slug === article.portalSubpage && item.visible !== false) ?? null
    : null;
  const topicHref = newsCategory ? `/novinky/${newsCategory.slug}` : reviewCategory ? portalSubpageHref(portalSection!, reviewCategory) : `/tema/${categorySlug(article.category)}`;
  const topicLabel = newsCategory?.label ?? reviewCategory?.label ?? article.category;
  const canonical = absoluteUrl(article.seo?.canonicalUrl || articleHref(article));
  const image = article.image ? absoluteUrl(article.image) : undefined;
  const imageCreditHref = safeExternalImageCreditUrl(article.imageCreditUrl);
  const showImageMeta = Boolean(article.image && (article.imageCaption || article.imageCredit || imageCreditHref));
  const authorName = authorProfile?.displayName || article.author;
  const authorRole = authorProfile?.role?.trim();
  const showAuthorRole = Boolean(
    authorRole && !authorName.toLocaleLowerCase("sk").includes(authorRole.toLocaleLowerCase("sk")),
  );
  const blocks = article.blocks?.length
    ? article.blocks
    : legacyArticleBlocks(article.sections, article.sources);
  const contentBlocks = blocks.filter((block) => block.type !== "source");
  const sourceBlocks = blocks.filter((block) => block.type === "source");
  const introDocument = article.introRichText ?? legacyRichTextToDocument(article.intro);
  const takeawayDocument = article.takeawayRichText ?? legacyRichTextToDocument(article.takeaway);
  const showTakeaway = editorialRichTextPlainText(takeawayDocument).length > 0;
  const headings = articleBlockHeadings(blocks);
  const tocHeadings = headings.filter((heading) => heading.level === 2);
  const showTableOfContents = tocHeadings.length >= 3;
  const showUpdated = article.showUpdated ?? article.updatedDateIso !== article.dateIso;
  const wordCount = [editorialRichTextPlainText(introDocument), editorialRichTextPlainText(takeawayDocument), articleBlockPlainText(blocks)]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const endRecommendationPool = [
    ...(!magazine.manualRelatedResolved && magazine.midRelated ? [magazine.midRelated] : []),
    ...magazine.endRelated,
  ];
  const relatedItems = endRecommendationPool.filter((item, index, items) =>
    item.slug !== article.slug && items.findIndex((candidate) => candidate.slug === item.slug) === index
  ).slice(0, 3);
  const continuation = resolveArticleContinuation({
    article,
    topicHref,
    topicLabel,
    sidebarPromoKey: discovery.promo?.promoKey,
    relatedHrefs: relatedItems.map((item) => articleHref(item)),
  });
  const hasPopularity = discovery.popularity["24h"].length > 0 || discovery.popularity["7d"].length > 0;
  const showDiscoverySidebar = hasPopularity || Boolean(discovery.promo);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": section === "novinky" ? "NewsArticle" : "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { "@id": canonical },
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
        publisher: { "@id": ORGANIZATION_ID },
        image: image ? [image] : undefined,
        thumbnailUrl: image,
      },
      buildWebPageJsonLd({
        canonical,
        name: article.title,
        description: article.excerpt,
        mainEntityId: `${canonical}#article`,
        breadcrumbId: `${canonical}#breadcrumb`,
        datePublished: article.dateIso,
        dateModified: article.updatedDateIso,
      }),
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

  return (
    <main id="obsah" className={styles.modernArticle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <ArticleReadTracker articleSlug={article.slug} />
      <ArticleReadingProgress />
      <div className={`${styles.articleLayout} shell`} data-article-layout>
        <div className={styles.articleMainColumn}>
          <header className={styles.hero} data-article-reading-start>
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
                    {showAuthorRole ? <small>{authorRole}</small> : null}
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
          {article.image ? (
            <figure className={styles.heroFigure}>
              <MediaFrame className={styles.heroMedia} variant="article">
                <img className="article-hero-image" src={article.image} alt={article.imageAlt || article.title} loading="eager" fetchPriority="high" decoding="async" />
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
          ) : null}
        </div>
          </header>

          <div className={styles.readingShell}>
            <article className="article-prose" data-article-reading-end>
            <EditorialRichText className="article-intro" document={introDocument} keyPrefix="article-intro" />
            {showTakeaway ? <aside className="takeaway-box" aria-label="To najdôležitejšie"><strong>To najdôležitejšie</strong><EditorialRichText document={takeawayDocument} keyPrefix="article-takeaway" /></aside> : null}
            {showTableOfContents ? (
              <details className={styles.toc}>
                <summary>Obsah článku</summary>
                <nav aria-label="Obsah článku">
                  <ol>
                    {tocHeadings.map((heading) => (
                      <li key={heading.blockId}>
                        <a href={`#${heading.id}`}>{heading.text}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </details>
            ) : null}
            <ArticleBlocks blocks={contentBlocks} promoUtcDay={discovery.utcDay} />
            {sourceBlocks.length > 0 ? <ArticleBlocks blocks={sourceBlocks} promoUtcDay={discovery.utcDay} /> : null}
            <AdSlot placementId={AD_PLACEMENTS.ARTICLE_END.id} />
            <p className="article-disclaimer">{section === "novinky" ? (sourceBlocks.length > 0 ? "Správa vychádza z uvedených zdrojov a pri ďalšom vývoji udalosti ju aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku." : "Správu pri ďalšom vývoji udalosti priebežne aktualizujeme. Dátum poslednej úpravy je uvedený pri titulku.") : section === "recenzie" ? "Ak obsah obsahuje partnerský alebo affiliate odkaz, je označený priamo pri príslušnom odkaze." : "Obsah je informačný a nenahrádza individuálne vyšetrenie veterinárom ani prácu s kvalifikovaným trénerom, ak ju situácia vyžaduje."} <Link href="/opravy-a-podnety">Nahlásiť chybu alebo požiadať o opravu.</Link></p>
            <div className={styles.endActions} id="zdielat-clanok">
              <ShareButton title={article.title} label={shareLabel} url={canonical} />
            </div>
            <ArticleFeedback articlePath={articleHref(article)} articleTitle={article.title} />
            </article>
          </div>
        </div>

        {showDiscoverySidebar ? (
            <aside
              className={styles.sidebar}
              aria-label="Objavte ďalší obsah"
              data-article-discovery-sidebar
            >
              <div className={styles.sidebarSticky}>
                <ArticlePopularitySidebar
                  popularity={discovery.popularity}
                  initialWindow={discovery.initialWindow}
                />
                {discovery.promo ? (
                  <div className={styles.sidebarPromo} data-automatic-article-promo>
                    <ArticlePromo
                      promoKey={discovery.promo.promoKey}
                      variant="auto"
                      seed={discovery.promo.seed}
                      utcDay={discovery.utcDay}
                      compact
                    />
                  </div>
                ) : null}
              </div>
            </aside>
        ) : null}
      </div>

      {relatedBreeds.length > 0 ? (
        <section className={styles.relatedSection} aria-labelledby="article-related-breeds-title" data-explicit-content-relation="article-breed">
          <div className={`${styles.relatedInner} shell`}>
            <span className="eyebrow">Súvisiace plemená</span>
            <h2 id="article-related-breeds-title">Plemená prepojené s týmto článkom</h2>
            <RelatedBreedList breeds={relatedBreeds} label="Plemená prepojené s týmto článkom" />
          </div>
        </section>
      ) : null}

      {relatedItems.length > 0 ? (
        <section className={`${styles.relatedSection} related-section`}>
          <div className={`${styles.relatedInner} shell`}>
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

      {continuation ? <ArticleContinuation next={continuation} /> : null}
    </main>
  );
}
