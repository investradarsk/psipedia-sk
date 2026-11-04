import type { Article, ArticleListingCard } from "@/lib/content";
import { articleCategorySlug } from "@/lib/article-category-routes";
import { articleCardPresentation } from "@/lib/article-card-presentation";
import {
  PublicArticleCard,
  type PublicArticleCardVariant,
} from "@/components/public-visual-system/public-article-card";
import { FavoriteButton } from "./favorite-button";

/** compact remains a compatibility alias for the single row variant. */
export type ArticleCardVariant = PublicArticleCardVariant | "compact";

export function ArticleCard({
  article,
  variant,
  large = false,
  topicHref,
  topicLabel,
  actionLabel,
  headingLevel = 3,
  showFavorite,
  imagePriority = false,
  className,
  listItem = true,
  omitMissingImage = false,
  anchorId,
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
  anchorId?: string;
}) {
  const resolvedVariant =
    variant === "compact" ? "row" : (variant ?? (large ? "featured" : "grid"));
  const presentation = articleCardPresentation(article);
  return (
    <PublicArticleCard
      {...presentation}
      variant={resolvedVariant}
      title={article.title}
      topic={
        topicLabel ?? (resolvedVariant === "row" ? presentation.topic : presentation.sectionTopic)
      }
      topicHref={topicHref ?? presentation.topicHref}
      actionLabel={actionLabel ?? presentation.actionLabel}
      excerpt={article.excerpt?.trim()}
      accent={article.accent}
      headingLevel={headingLevel}
      footer={
        (showFavorite ?? large) && resolvedVariant !== "row" ? (
          <FavoriteButton slug={article.slug} compact />
        ) : undefined
      }
      imagePriority={imagePriority}
      className={className}
      listItem={listItem}
      omitMissingImage={omitMissingImage}
      anchorId={anchorId}
    />
  );
}

export function categorySlug(category: Article["category"]) {
  return articleCategorySlug(category);
}
