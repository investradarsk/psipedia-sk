import type { HTMLAttributes, ReactNode } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("shell", "page-container", className)} />;
}

export function Breadcrumbs({
  children,
  label = "Navigácia",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return <nav className={cx("article-breadcrumbs", "page-breadcrumbs", className)} aria-label={label}>{children}</nav>;
}

export function SectionHero({
  children,
  image,
  className,
  imageClassName,
  containerClassName,
}: {
  children: ReactNode;
  image?: string | null;
  className?: string;
  imageClassName?: string;
  containerClassName?: string;
}) {
  return (
    <header className={cx("section-hero", image && "section-hero--photo", className)}>
      {image && <img className={cx("section-hero-photo", imageClassName)} src={image} alt="" aria-hidden="true" decoding="async" />}
      <PageContainer className={containerClassName}>{children}</PageContainer>
    </header>
  );
}

export function MediaFrame({
  children,
  variant = "landscape",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: "landscape" | "portrait" | "article" | "auto";
}) {
  return <div {...props} className={cx("media-frame", `media-frame--${variant}`, className)}>{children}</div>;
}

export function SectionTabs({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return <nav className={cx("section-tabs", className)} aria-label={label}><PageContainer className="section-tabs-inner">{children}</PageContainer></nav>;
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("filter-bar", className)}>{children}</div>;
}

export const cardShellClassName = "card-shell";
