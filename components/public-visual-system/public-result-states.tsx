import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import styles from "./public-result-states.module.css";

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function PublicEmptyState({
  title,
  description,
  children,
  className,
  headingLevel = "h2",
  variant = "default",
  icon,
  role = variant === "listing" ? undefined : "status",
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
  variant?: "default" | "listing";
  icon?: ReactNode;
  role?: "status" | "alert";
}) {
  const Heading = headingLevel;
  return (
    <div className={classes(variant === "listing" ? "empty-state" : styles.empty, className)} role={role} data-public-empty-state>
      {icon ? <span>{icon}</span> : null}
      <Heading>{title}</Heading>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}

/** Server-rendered, native anchor pagination. Callers keep their canonical URL builders. */
export function PublicPagination({
  currentPage,
  totalPages,
  previousHref,
  nextHref,
  className,
  label = "Stránkovanie výsledkov",
  previousLabel = "← Predchádzajúca",
  nextLabel = "Ďalšia →",
  numberedPages,
  pageHref,
  showDisabledControls = true,
  variant = "default",
  currentPageAsText = false,
  previousAriaLabel,
  nextAriaLabel,
}: {
  currentPage: number;
  totalPages: number;
  previousHref?: string;
  nextHref?: string;
  className?: string;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  numberedPages?: number[];
  pageHref?: (page: number) => string;
  showDisabledControls?: boolean;
  variant?: "default" | "reports";
  currentPageAsText?: boolean;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={classes(variant === "reports" ? styles.reportPagination : styles.pagination, className)} aria-label={label} data-public-pagination>
      {previousHref
        ? <Link href={previousHref} rel="prev" aria-label={previousAriaLabel}>{previousLabel}</Link>
        : showDisabledControls ? <span aria-disabled="true">{previousLabel}</span> : null}
      {numberedPages && pageHref ? (
        numberedPages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page > numberedPages[index - 1] + 1 ? <span aria-hidden="true">…</span> : null}
            {currentPageAsText && page === currentPage
              ? <span aria-current="page">{page}</span>
              : <Link href={pageHref(page)} aria-current={page === currentPage ? "page" : undefined}>{page}</Link>}
          </Fragment>
        ))
      ) : (
        <strong aria-current="page">Strana {currentPage} z {totalPages}</strong>
      )}
      {nextHref
        ? <Link href={nextHref} rel="next" aria-label={nextAriaLabel}>{nextLabel}</Link>
        : showDisabledControls ? <span aria-disabled="true">{nextLabel}</span> : null}
    </nav>
  );
}

export type PublicNoticeTone = "info" | "success" | "warning" | "error";

export function PublicNotice({
  children,
  tone = "info",
  className,
  role = tone === "error" ? "alert" : "status",
}: {
  children: ReactNode;
  tone?: PublicNoticeTone;
  className?: string;
  role?: "alert" | "status";
}) {
  return <p className={classes(styles.notice, styles[tone], className)} role={role} data-public-notice={tone}>{children}</p>;
}

export function PublicFilterTag({ children, className, href, removeLabel }: {
  children: ReactNode;
  className?: string;
  href?: string;
  removeLabel?: string;
}) {
  // Keep removal as native GET navigation, including before client hydration.
  if (href !== undefined) {
    return <a className={classes(styles.removableFilterTag, className)} href={href} aria-label={removeLabel} data-public-filter-tag>{children}</a>;
  }
  return <span className={classes(styles.filterTag, className)} data-public-filter-tag>{children}</span>;
}

export function PublicLoadingState({
  label = "Načítavam…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={classes(styles.loading, className)} role="status" aria-live="polite" data-public-loading>
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
