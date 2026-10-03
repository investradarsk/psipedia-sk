import type { HTMLAttributes, ReactNode } from "react";
import { PageContainer } from "@/components/page-system";
import styles from "./public-landing-layout.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PublicContentShellVariant = "plain" | "landing" | "listing";
export type PublicLandingHeadingTone = "default" | "inverse";

export function PublicContentShell({
  variant = "plain",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: PublicContentShellVariant;
}) {
  return (
    <PageContainer
      {...props}
      className={cx(styles.shell, styles[variant], className)}
      data-public-content-shell
      data-public-content-variant={variant}
    />
  );
}

export function PublicLandingSectionHeading({
  eyebrow,
  title,
  description,
  action,
  id,
  className,
  tone = "default",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
  tone?: PublicLandingHeadingTone;
}) {
  const hasAside = Boolean(description || action);
  return (
    <div
      className={cx(
        styles.heading,
        !hasAside && styles.headingSingle,
        tone === "inverse" && styles.headingInverse,
        className,
      )}
      data-public-landing-section-heading
    >
      <div className={styles.headingCopy}>
        <span className={styles.eyebrow} data-public-landing-eyebrow>{eyebrow}</span>
        <h2 id={id} data-public-landing-heading>{title}</h2>
      </div>
      {hasAside ? (
        <div className={styles.headingAside}>
          {description ? <p className={styles.description} data-public-landing-description>{description}</p> : null}
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
