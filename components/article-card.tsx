import Link from "next/link";
import type { Article, ArticleListingCard } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel, articlePortalSection } from "@/lib/portal";
import { articleCategoryHref, articleCategorySlug } from "@/lib/article-category-routes";
import { ArticleListItem } from "./article-list-item";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { FavoriteButton } from "./favorite-button";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { ImageDisplay } from "@/components/image-display";

export type ArticleCardVariant = "featured" | "grid" | "compact";

export function ArticleCard({
  article,
  variant,
  large = false,
  topicHref: topicHrefOverride,
  topicLabel: topicLabelOverride,
  actionLabel,
  headingLevel = 3,
  showFavorite,
  imagePriority = false,
  className,
  listItem = true,
  omitMissingImage = false,
}: {
  article: ArticleListingCard;
  variant?: ArticleCardVariant;
  large?: boolean;
  topicHref?: string;
  topicLabel?: string;
  actionLabel?: string;
  headingLevel?: 2 | 3 | 4;
  showFavorite?: boolean;
  imagePriority?: boolean;
  className?: string;
  listItem?: boolean;
  omitMissingImage?: boolean;
}) {
  const resolvedVariant = variant ?? (large ? "featured" : "grid");
  const href = articleHref(article);
  const section = articlePortalSection(article);
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topicHref = topicHrefOverride ?? (newsCategory ? `/novinky/${newsCategory.slug}` : articleCategoryHref(article.category));
  const topicLabel = topicLabelOverride ?? (newsCategory ? newsCategory.shortLabel : article.category);
  const sectionLabel = portalSectionLabel(section);
  const metaLabel = section === "novinky" ? `${sectionLabel} · ${topicLabel}` : topicLabel;
  const resolvedActionLabel = actionLabel ?? (section === "novinky" ? "Čítať novinku" : "Čítať článok");
  const date = article.date?.trim();
  const dateIso = article.dateIso?.trim();
  const excerpt = article.excerpt?.trim();
  const imageAlt = article.imageAlt?.trim() || `Ilustračná fotografia k článku: ${article.title}`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const renderFavorite = showFavorite ?? large;

  if (resolvedVariant === "compact") {
    return (
      <ArticleListItem
        article={article}
        topicLabel={topicLabel}
        className={className}
        listItem={listItem}
      />
    );
  }

  return (
    <article
      className={[`article-card article-card--${article.accent} article-card--${resolvedVariant}`, className].filter(Boolean).join(" ")}
      data-article-card
      data-public-card="article"
      data-article-variant={resolvedVariant}
    >
      {(article.image || !omitMissingImage) ? <Link
        href={href}
        className="article-card-media"
        aria-label={`${resolvedActionLabel}: ${article.title}`}
      >
        {article.image ? (
          <ImageDisplay
            context="thumbnail"
            config={article.thumbnailImageDisplay}
            legacyMode={article.imageDisplay}
            legacyFocusX={article.imageFocusX}
            legacyFocusY={article.imageFocusY}
            src={article.image}
            srcSet={responsiveMediaSrcSet(article.image, [320, 480, 640, 768, 960, 1280])}
            sizes={resolvedVariant === "featured" ? "(max-width: 980px) 100vw, 55vw" : "(max-width: 620px) 100vw, 33vw"}
            alt={imageAlt}
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : "auto"}
            decoding="async"
          />
        ) : (
          <span className="article-placeholder" aria-hidden="true"><PublicMediaFallback /></span>
        )}
      </Link> : null}
      <div className="article-card-body">
        <div className="article-card-meta" data-public-card-meta>
          <Link href={topicHref} className="article-card-topic">{metaLabel}</Link>
          {date ? (dateIso ? <time dateTime={dateIso}>{date}</time> : <span>{date}</span>) : null}
        </div>
        <Heading className="article-card-title" data-public-card-title>
          <Link href={href}>{article.title}</Link>
        </Heading>
        {excerpt ? <p className="article-card-excerpt">{excerpt}</p> : null}
        {renderFavorite ? (
          <div className="article-card-footer">
            <FavoriteButton slug={article.slug} compact />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Kept for callers that still need the short filter slug. */
export function categorySlug(category: Article["category"]) {
  return articleCategorySlug(category);
}
