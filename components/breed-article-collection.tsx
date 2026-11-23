import Link from "next/link";
import type { Article } from "@/lib/content";
import { EditorialTopicArticleGrid } from "@/components/editorial-topic-article-grid";
import { PublicLandingSectionHeading } from "@/components/public-visual-system";
import styles from "./breed-article-collection.module.css";

/** Atlas, FCI-group and archive previews share the exact topic card grid
 * from Šteniatka → Pred kúpou psa. No separate cards or white outer panel. */
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
      {headingLevel === 2 ? (
        <PublicLandingSectionHeading
          eyebrow="Články v oblasti"
          title={title}
          id={headingId}
        />
      ) : (
        <div className={styles.groupHeading}>
          <span className={styles.eyebrow}>Články v oblasti</span>
          <h3 id={headingId}>{title}</h3>
        </div>
      )}
      <EditorialTopicArticleGrid
        articles={articles}
        label={title}
        limit={3}
        constrained
      />
      <Link className={styles.link} href={href}>
        {actionLabel} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
