import type { HTMLAttributes } from "react";
import styles from "./public-help-card-surface.module.css";

/** One visual card surface used by adoption, shelter, foster and report lists.
 * The content, accessibility labels, status and navigation remain specialized.
 */
export function PublicHelpCardSurface({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...props}
      className={[styles.card, className].filter(Boolean).join(" ")}
      data-public-help-card-surface
    >
      {children}
    </article>
  );
}
