import Link from "next/link";
import { Fragment, type ComponentPropsWithRef, type HTMLAttributes, type ReactNode } from "react";
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
  variant?: "default" | "reports" | "context";
  currentPageAsText?: boolean;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  /** Retain the existing search layout without changing its summary typography. */
  summaryAs?: "strong" | "span";
  emptyDisabledControls?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      className={classes(
        variant === "reports"
          ? styles.reportPagination
          : variant === "default"
            ? styles.pagination
            : undefined,
        className,
      )}
      aria-label={label}
      data-public-pagination
    >
      {previousHref ? (
        <Link href={previousHref} rel="prev" aria-label={previousAriaLabel}>
          {previousLabel}
        </Link>
      ) : showDisabledControls ? (
        emptyDisabledControls ? (
          <span />
        ) : (
          <span aria-disabled="true">{previousLabel}</span>
        )
      ) : null}
      {numberedPages && pageHref ? (
        numberedPages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page > numberedPages[index - 1] + 1 ? (
              <span aria-hidden="true">…</span>
            ) : null}
            {currentPageAsText && page === currentPage ? (
              <span aria-current="page">{page}</span>
            ) : (
              <Link href={pageHref(page)} aria-current={page === currentPage ? "page" : undefined}>
                {page}
              </Link>
            )}
          </Fragment>
        ))
      ) : (
        <Summary aria-current="page">
          Strana {currentPage} z {totalPages}
        </Summary>
      )}
      {nextHref ? (
        <Link href={nextHref} rel="next" aria-label={nextAriaLabel}>
          {nextLabel}
        </Link>
      ) : showDisabledControls ? (
        emptyDisabledControls ? (
          <span />
        ) : (
          <span aria-disabled="true">{nextLabel}</span>
        )
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
