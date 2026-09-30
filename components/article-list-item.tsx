import type { Article } from "@/lib/content";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { PublicArticleListItem } from "@/components/public-visual-system";

export function articleTopicLabel(article: Article) {
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
}: {
  article: Article;
  topicLabel?: string;
  className?: string;
  listItem?: boolean;
}) {
  const date = article.date?.trim() || undefined;
  const dateTime = date && article.dateIso?.trim() ? article.dateIso.trim() : undefined;
  const imageAlt = article.imageAlt?.trim() || `Ilustračná fotografia k článku: ${article.title}`;

  return (
    <PublicArticleListItem
      href={articleHref(article)}
      title={article.title}
      topic={topicLabel ?? articleTopicLabel(article)}
      date={date}
      dateTime={dateTime}
      image={article.image ? { src: article.image, alt: imageAlt } : undefined}
      className={className}
      listItem={listItem}
    />
  );
}
