import Link from "next/link";
import type { Article } from "@/lib/content";
import { ArticleCard } from "@/components/article-card";
import styles from "./breed-article-collection.module.css";

export function BreedArticleCollection({
  articles, id, title, href, actionLabel, headingLevel = 2, compact = false,
}: {
  articles: Article[];
  id: string;
  title: string;
  href: string;
  actionLabel: string;
  headingLevel?: 2 | 3;
  compact?: boolean;
}) {
  if (!articles.length) return null;
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId}
      className={`${styles.section} ${compact ? styles.compact : ""}`}
      data-breed-editorial-collection>
      <div className={styles.header}>
        {headingLevel === 2
          ? <h2 id={headingId}>{title}</h2>
          : <h3 id={headingId}>{title}</h3>}
      </div>
      <div className={styles.grid} role="list">
        {articles.slice(0, 3).map(article => (
          <div className={styles.item} role="listitem" key={article.slug}>
            <ArticleCard article={article} variant="grid" headingLevel={4} listItem={false}/>
          </div>
        ))}
      </div>
      <Link className={styles.link} href={href}>{actionLabel} <span aria-hidden="true">→</span></Link>
    </section>
  );
}
