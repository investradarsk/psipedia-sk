import Link from "next/link";
import { Fragment, type ComponentPropsWithRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./public-result-states.module.css";
import { publicPaginationPages } from "@/lib/public-pagination";

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
  role = variant === "default" ? "status" : undefined,
  as: Tag = "div",
  ...props
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
  variant?: "default" | "listing" | "context";
  as?: "div" | "p" | "section";
  icon?: ReactNode;
  role?: "status" | "alert";
} & Omit<HTMLAttributes<HTMLElement>, "title" | "role">) {
  const Heading = headingLevel;
  return (
    <Tag
      {...props}
      className={classes(
        variant === "listing" ? "empty-state" : variant === "default" ? styles.empty : undefined,
        className,
      )}
      role={role}
      data-public-empty-state
    >
      {icon ? <span>{icon}</span> : null}
      {title ? <Heading>{title}</Heading> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </Tag>
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
  summaryAs: Summary = "strong",
  emptyDisabledControls = false,
}: {
  currentPage: number;
  totalPages: number | null;
  previousHref?: string;
  nextHref?: string;
  className?: string;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  numberedPages?: number[];
  pageHref?: (page: number) => string;
  showDisabledControls?: boolean;
  variant?: "default" | "reports" | "context";
  currentPageAsText?: boolean;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  /** Retain the existing search layout without changing its summary typography. */
  summaryAs?: "strong" | "span";
  emptyDisabledControls?: boolean;
}) {
  if (totalPages === null ? !previousHref && !nextHref : totalPages <= 1) return null;
  const displayPages = totalPages === null ? [] : (numberedPages ?? publicPaginationPages(currentPage, totalPages));
  return (
    <nav
      className={classes(styles.pagination, variant === "reports" && styles.reportPagination, className)}
      aria-label={label}
      data-public-pagination
    >
      {previousHref ? (
        <Link className={styles.pageArrow} href={previousHref} rel="prev" aria-label={previousAriaLabel ?? previousLabel}>‹</Link>
      ) : showDisabledControls ? (
        emptyDisabledControls ? <span className={styles.paginationSpacer} /> :
          <span className={styles.pageArrow} aria-disabled="true" aria-label={previousAriaLabel ?? previousLabel}>‹</span>
      ) : null}
      {totalPages === null ? (
        <span className={styles.paginationSummary} aria-current="page">Strana {currentPage}</span>
      ) : displayPages.length && pageHref ? (
        displayPages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page > displayPages[index - 1] + 1 ? (
              <span className={styles.paginationEllipsis} aria-hidden="true">…</span>
            ) : null}
            {currentPageAsText && page === currentPage ? (
              <span className={styles.pageNumber} aria-current="page">{page}</span>
            ) : (
              <Link className={styles.pageNumber} href={pageHref(page)}
                aria-current={page === currentPage ? "page" : undefined}>
                {page}
              </Link>
            )}
          </Fragment>
        ))
      ) : (
        <Summary className={styles.paginationSummary} aria-current="page">
          Strana {currentPage} z {totalPages}
        </Summary>
      )}
      {nextHref ? (
        <Link className={styles.pageArrow} href={nextHref} rel="next" aria-label={nextAriaLabel ?? nextLabel}>›</Link>
      ) : showDisabledControls ? (
        emptyDisabledControls ? <span className={styles.paginationSpacer} /> :
          <span className={styles.pageArrow} aria-disabled="true" aria-label={nextAriaLabel ?? nextLabel}>›</span>
      ) : null}
    </nav>
  );
}

export type PublicNoticeTone = "info" | "success" | "warning" | "error";

export function PublicNotice({
  children,
  tone = "info",
  className,
  role = tone === "error" ? "alert" : "status",
  appearance = "default",
  as: Tag = "p",
  ...props
}: {
  children: ReactNode;
  tone?: PublicNoticeTone;
  className?: string;
  role?: "alert" | "status" | null;
  appearance?: "default" | "context";
} & (
  | ({ as?: "p" } & Omit<ComponentPropsWithRef<"p">, "role">)
  | ({ as: "div" } & Omit<ComponentPropsWithRef<"div">, "role">)
)) {
  return (
    <Tag
      {...props}
      className={classes(
        appearance === "default" && styles.notice,
        appearance === "default" && styles[tone],
        className,
      )}
      role={role ?? undefined}
      data-public-notice={tone}
    >
      {children}
    </Tag>
  );
}

export function PublicFilterTag({
  children,
  className,
  href,
  removeLabel,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  removeLabel?: string;
}) {
  // Keep removal as native GET navigation, including before client hydration.
  if (href !== undefined) {
    return (
      <a
        className={classes(styles.removableFilterTag, className)}
        href={href}
        aria-label={removeLabel}
        data-public-filter-tag
      >
        {children}
      </a>
    );
  }
  return (
    <span className={classes(styles.filterTag, className)} data-public-filter-tag>
      {children}
    </span>
  );
}

export function PublicLoadingState({
  label = "Načítavam…",
  className,
  appearance = "default",
  as: Tag = "div",
  children,
  ...props
}: {
  label?: string;
  className?: string;
  appearance?: "default" | "context";
  as?: "div" | "span";
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      role="status"
      aria-live={appearance === "default" ? "polite" : undefined}
      {...props}
      className={classes(appearance === "default" && styles.loading, className)}
      data-public-loading
    >
      {appearance === "context" ? (
        children
      ) : (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </Tag>
  );
}
