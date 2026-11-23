import type { Article } from "@/lib/content";
import { ArticleListItem } from "@/components/article-list-item";
import { PublicContentList } from "@/components/public-visual-system";
import styles from "./editorial-topic-article-grid.module.css";

/**
 * Canonical article list used by the Šteniatka / Pred kúpou psa topic page.
 * Atlas Plemená and its article archive reuse the SAME row-card renderer,
 * stacked image layout, responsive grid and flat/unboxed presentation.
 */
export function EditorialTopicArticleGrid({
  articles,
  label,
  limit,
  constrained = false,
}: {
  articles: Article[];
  label: string;
  limit?: number;
  constrained?: boolean;
}) {
  if (!articles.length) return null;
  const visible = limit === undefined ? articles : articles.slice(0, limit);
  return (
    <PublicContentList
      label={label}
      className={`${styles.grid} ${constrained ? styles.constrained : ""}`}
    >
      {visible.map((article) => (
        <ArticleListItem key={article.slug} article={article} desktopLayout="stacked" />
      ))}
    </PublicContentList>
  );
}
