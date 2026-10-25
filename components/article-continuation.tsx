import { PublicActionLink } from "@/components/public-visual-system";
import { ArrowIcon } from "@/components/icons";
import type { ArticleContinuationDecision } from "@/lib/article-continuation";
import styles from "./article-continuation.module.css";

/** One quiet editorial step after the article and its existing recommendations. */
export function ArticleContinuation({ next }: { next: ArticleContinuationDecision }) {
  return (
    <nav className={styles.outer} aria-label="Pokračovanie po článku" data-content-discovery-v3>
      <div className={`${styles.inner} shell`}>
        <span className={styles.copy}>{next.context === "cross-section" ? "Ďalší praktický krok" : "Pokračovať v téme"}</span>
        <PublicActionLink href={next.href} variant="tertiary" className={styles.link} icon={<ArrowIcon size={16} />}>
          {next.label}
        </PublicActionLink>
      </div>
    </nav>
  );
}
