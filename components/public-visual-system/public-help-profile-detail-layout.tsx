import type { HTMLAttributes, ReactNode } from "react";
import { PublicDetailLayout } from "@/components/detail-primitives/detail-primitives";
import styles from "./public-help-profile-detail-layout.module.css";

/**
 * Help-specific adapter to the SAME canonical content shell as events,
 * services and organizations. It does not own separate layout geometry.
 * Inline mode preserves the original semantic article/aside order for
 * adoption and lost/found details, including their contact privacy rules.
 */
export function PublicHelpProfileDetailLayout({
  children, aside, asideLabel = "Informácie a kontakty", className, ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return <PublicDetailLayout
    {...props}
    mode={aside ? "split" : "inline"}
    aside={aside}
    asideLabel={asideLabel}
    contentClassName={styles.content}
    asideClassName={styles.aside}
    className={[styles.layout, className].filter(Boolean).join(" ")}
    data-public-help-detail-layout
  >{children}</PublicDetailLayout>;
}
