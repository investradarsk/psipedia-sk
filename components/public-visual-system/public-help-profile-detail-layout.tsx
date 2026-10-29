import type { HTMLAttributes, ReactNode } from "react";
import styles from "./public-help-profile-detail-layout.module.css";

/**
 * Shared two-column body for all Help profile detail types. Each domain keeps
 * its verified facts, contacts and safety messaging, but not its own layout.
 * Hero is already shared through DetailHero.
 */
export function PublicHelpProfileDetailLayout({
  children, aside, className, ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; aside?: ReactNode }) {
  return (
    <div {...props} className={[styles.layout, className].filter(Boolean).join(" ")} data-public-help-detail-layout>
      <div className={styles.content} data-help-profile-content>{children}</div>
      {aside ? <aside className={styles.aside} data-help-profile-aside aria-label="Informácie a kontakty">{aside}</aside> : null}
    </div>
  );
}
