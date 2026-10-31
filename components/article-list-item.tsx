import type { ArticleListingCard } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { PublicArticleListItem } from "@/components/public-visual-system";

export function articleTopicLabel(article: Pick<ArticleListingCard, "category" | "portalSection" | "newsCategory">) {
  if (articlePortalSection(article) === "novinky") {
    return getNewsCategory(article.newsCategory)?.shortLabel ?? "Zo sveta psov";
  }
  return article.category;
}

export function ArticleListItem({
  article,
  topicLabel,
  className,
  listItem = true,
  anchorId,
}: {
  article: ArticleListingCard;
  topicLabel?: string;
  className?: string;
  listItem?: boolean;
  anchorId?: string;
}) {
  const date = article.date?.trim() || undefined;
  const dateTime = date && article.dateIso?.trim() ? article.dateIso.trim() : undefined;
  const imageAlt = article.imageAlt?.trim() || `Ilustračná fotografia k článku: ${article.title}`;

  return (
    <PublicArticleListItem
      anchorId={anchorId}
      href={articleHref(article)}
      title={article.title}
      topic={topicLabel ?? articleTopicLabel(article)}
      date={date}
      dateTime={dateTime}
      image={article.image ? { src: article.image, alt: imageAlt, mode: article.imageDisplay, focusX: article.imageFocusX, focusY: article.imageFocusY, config: article.thumbnailImageDisplay } : undefined}
      className={className}
      listItem={listItem}
    />
  );
}
