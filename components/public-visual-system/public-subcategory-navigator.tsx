import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";
import { PageContainer } from "@/components/page-system";
import { PublicIcon } from "./public-visual-system";
import styles from "./public-subcategory-navigator.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type PublicSubcategoryNavigatorMode = "landing" | "compact";

export type PublicSubcategoryImage = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
};

export type PublicSubcategoryItem = {
  href: string;
  title: ReactNode;
  description?: ReactNode;
  image?: PublicSubcategoryImage;
  icon?: ReactElement;
  meta?: ReactNode;
  current?: boolean;
  rel?: string;
  prefetch?: boolean;
};

function LandingItem({ item }: { item: PublicSubcategoryItem }) {
  return (
    <Link
      className={cx(styles.landingCard, item.current && styles.landingCardCurrent)}
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      rel={item.rel}
      prefetch={item.prefetch}
      data-public-subcategory-item
    >
      <span className={cx(styles.landingMedia, !item.image && styles.landingMediaFallback)}>
        {item.image ? (
          <img
            src={item.image.src}
            alt={item.image.alt ?? ""}
            width={item.image.width ?? 640}
            height={item.image.height ?? 360}
            loading={item.image.loading ?? "lazy"}
            decoding="async"
          />
        ) : null}
        {item.icon ? <PublicIcon icon={item.icon} size="md" className={styles.landingIcon} /> : null}
      </span>
      <span className={styles.landingCopy}>
        <strong>{item.title}</strong>
        {item.description ? <span className={styles.landingDescription}>{item.description}</span> : null}
        {item.meta ? <small>{item.meta}</small> : null}
        <span className={styles.landingArrow} aria-hidden="true"><ArrowIcon size={18} /></span>
      </span>
    </Link>
  );
}

function CompactItem({ item }: { item: PublicSubcategoryItem }) {
  return (
    <Link
      className={cx("section-tab", item.current && "is-active", styles.compactItem, item.current && styles.compactItemCurrent)}
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      rel={item.rel}
      prefetch={item.prefetch}
      data-public-subcategory-item
    >
      {item.icon ? <PublicIcon icon={item.icon} size="sm" /> : null}
      <span>{item.title}</span>
      {item.meta ? <small>{item.meta}</small> : null}
    </Link>
  );
}

export function PublicSubcategoryNavigator({
  items,
  label,
  mode = "landing",
  className,
}: {
  items: PublicSubcategoryItem[];
  label: string;
  mode?: PublicSubcategoryNavigatorMode;
  className?: string;
}) {
  if (!items.length) return null;

  if (mode === "compact") {
    return (
      <nav
        className={cx(styles.navigator, styles.compact, className)}
        aria-label={label}
        data-public-subcategory-navigator
        data-public-subcategory-mode="compact"
      >
        <PageContainer className={cx("section-tabs-inner", styles.compactTrack)} data-public-subcategory-track>
          {items.map((item, index) => <CompactItem item={item} key={item.href + "-" + index} />)}
        </PageContainer>
      </nav>
    );
  }

  return (
    <nav
      className={cx(styles.navigator, styles.landing, className)}
      aria-label={label}
      data-public-subcategory-navigator
      data-public-subcategory-mode="landing"
    >
      <div className={styles.landingTrack} data-public-subcategory-track>
        {items.map((item, index) => <LandingItem item={item} key={item.href + "-" + index} />)}
      </div>
    </nav>
  );
}
