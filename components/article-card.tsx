import Link from "next/link";
import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel, articlePortalSection } from "@/lib/portal";
import { ArticleListItem } from "./article-list-item";
import { PawMark } from "./icons";
import { FavoriteButton } from "./favorite-button";

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
}: {
  article: Article;
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
}) {
  const resolvedVariant = variant ?? (large ? "featured" : "grid");
  const href = articleHref(article);
  const section = articlePortalSection(article);
  const newsCategory = section === "novinky" ? getNewsCategory(article.newsCategory) : null;
  const topicHref = topicHrefOverride ?? (newsCategory ? `/novinky/${newsCategory.slug}` : `/tema/${categorySlug(article.category)}`);
  const topicLabel = topicLabelOverride ?? (newsCategory ? newsCategory.shortLabel : article.category);
  const sectionLabel = portalSectionLabel(section);
  const metaLabel = section === "novinky" ? `${sectionLabel} · ${topicLabel}` : topicLabel;
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
      data-article-variant={resolvedVariant}
    >
      <Link
        href={href}
        className="article-card-media"
        aria-label={actionLabel ? `${actionLabel}: ${article.title}` : article.title}
      >
        {article.image ? (
          <img
            src={article.image}
            alt={imageAlt}
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : "auto"}
            decoding="async"
          />
        ) : (
          <span className="article-placeholder" aria-hidden="true"><PawMark size={64} /></span>
        )}
      </Link>
      <div className="article-card-body">
        <div className="article-card-meta">
          <Link href={topicHref} className="article-card-topic">{metaLabel}</Link>
          {date ? (dateIso ? <time dateTime={dateIso}>{date}</time> : <span>{date}</span>) : null}
        </div>
        <Heading className="article-card-title">
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

export function categorySlug(category: Article["category"]) {
  return {
    "Výcvik": "vycvik",
    "Zdravie": "zdravie",
    "Výživa": "vyziva",
    "Život so psom": "zivot-so-psom",
  }[category];
}
