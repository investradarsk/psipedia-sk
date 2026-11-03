import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { PublicHeading } from "./public-heading";
import styles from "./public-filters.module.css";

/** One desktop listing layout; existing mobile disclosures and dialogs stay in their slots. */
export function PublicFilterLayout({
  children,
  className,
  extra = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { extra?: boolean }) {
  return (
    <div
      {...props}
      className={[styles.layout, extra && styles.withExtra, className].filter(Boolean).join(" ")}
      data-public-filter-layout
    >
      {children}
    </div>
  );
}
export function PublicFilterPanel({
  children,
  title = "Filtre",
  resetHref,
  variant = "sidebar",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: string;
  resetHref?: string;
  variant?: "sidebar" | "inline" | "collapsible";
}) {
  return (
    <aside
      {...props}
      aria-label={props["aria-label"] ?? title}
      className={[styles.panel, className].filter(Boolean).join(" ")}
      data-public-filter-panel
      data-filter-variant={variant}
    >
      <header className={styles.heading}>
        <PublicHeading role="panel" as="h2">
          {title}
        </PublicHeading>
        {resetHref ? <Link href={resetHref}>Zrušiť filtre</Link> : null}
      </header>
      {children}
    </aside>
  );
}
export function PublicFilterField({
  label,
  children,
  ...props
}: HTMLAttributes<HTMLLabelElement> & { label: ReactNode }) {
  return (
    <label {...props} className={[styles.field, props.className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function PublicActiveFilters({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={[styles.active, className].filter(Boolean).join(" ")}
      aria-label={props["aria-label"] ?? "Aktívne filtre"}
      data-public-active-filters
    >
      <span data-public-active-filter-label>Aktívne filtre</span>
      {children}
    </div>
  );
}
export function PublicResultsToolbar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={[styles.toolbar, className].filter(Boolean).join(" ")}
      data-public-results-toolbar
    >
      {children}
    </div>
  );
}
