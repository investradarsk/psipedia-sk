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
}: {
  article: Article;
  topicLabel?: string;
  className?: string;
}) {
  return (
    <PublicArticleListItem
      href={articleHref(article)}
      title={article.title}
      topic={topicLabel ?? articleTopicLabel(article)}
      date={article.date}
      dateTime={article.dateIso}
      className={className}
    />
  );
}
