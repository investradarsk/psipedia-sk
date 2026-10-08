import Link from "next/link";
import type { ArticleContinuationDecision } from "@/lib/article-continuation";
import styles from "./article-continuation.module.css";

/** One quiet editorial step after the article and its existing recommendations. */
export function ArticleContinuation({ next }: { next: ArticleContinuationDecision }) {
  return (
    <nav className={styles.outer} aria-label="Pokračovanie po článku" data-content-discovery-v3>
      <div className={`${styles.inner} shell`}>
        <span className={styles.copy}>{next.context === "cross-section" ? "Ďalší praktický krok" : "Pokračovať v téme"}</span>
        <Link href={next.href} className={styles.link}>
          {next.label}<span aria-hidden="true">→</span>
        </Link>
      </div>
    </nav>
  );
}
