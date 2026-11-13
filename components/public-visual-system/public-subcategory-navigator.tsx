import Link from "next/link";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { ArrowIcon } from "@/components/icons";
import { PageContainer } from "@/components/page-system";
import { PublicIcon } from "./public-visual-system";
import { PublicMediaFallback } from "./public-media-fallback";
import styles from "./public-subcategory-navigator.module.css";
import { PublicSubcategoryPagedTrack } from "./public-subcategory-paged-track";
import { publicSubcategoryPageGroups, PUBLIC_SUBCATEGORY_PAGE_SIZE } from "@/lib/public-subcategory-paging";

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
      <span className={cx(styles.landingMedia, !item.image?.src.trim() && styles.landingMediaFallback)}>
        {item.image?.src.trim() ? (
          <img
            src={item.image.src}
            alt={item.image.alt ?? ""}
            width={item.image.width ?? 640}
            height={item.image.height ?? 360}
            loading={item.image.loading ?? "lazy"}
            decoding="async"
          />
        ) : <span className={styles.landingPlaceholder} aria-hidden="true"><PublicMediaFallback /></span>}
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

function CompactItem({ item, onSelect }: {
  item: PublicSubcategoryItem;
  onSelect?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      className={cx("section-tab", item.current && "is-active", styles.compactItem, item.current && styles.compactItemCurrent)}
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      rel={item.rel}
      prefetch={item.prefetch}
      onClick={onSelect}
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
  mobileLayout = "wrap",
  columns,
  onSelect,
  className,
}: {
  items: PublicSubcategoryItem[];
  label: string;
  mode?: PublicSubcategoryNavigatorMode;
  mobileLayout?: "wrap" | "grid";
  columns?: 4 | 6;
  onSelect?: (event: MouseEvent<HTMLAnchorElement>, index: number) => void;
  className?: string;
}) {
  if (!items.length) return null;

  if (mode === "compact") {
    const paged = mobileLayout === "grid" && items.length > PUBLIC_SUBCATEGORY_PAGE_SIZE;
    const initialPage = Math.max(0, Math.floor(items.findIndex((item) => item.current) / PUBLIC_SUBCATEGORY_PAGE_SIZE));
    const pages = paged
      ? publicSubcategoryPageGroups(items).map((group, page) =>
          group.map((item, index) => (
            <CompactItem
              item={item}
              key={item.href + "-" + (page * PUBLIC_SUBCATEGORY_PAGE_SIZE + index)}
              onSelect={onSelect ? (event) => onSelect(event, page * PUBLIC_SUBCATEGORY_PAGE_SIZE + index) : undefined}
            />
          )))
      : [];
    return (
      <nav
        className={cx(styles.navigator, styles.compact, mobileLayout === "grid" && styles.compactGridMobile, columns === 6 && styles.compactSix, columns === 4 && styles.compactFour, className)}
        aria-label={label}
        data-public-subcategory-navigator
        data-public-subcategory-mode="compact"
      >
        {paged ? (
          <PageContainer className={styles.compactPagerFrame}>
            <PublicSubcategoryPagedTrack pages={pages} initialPage={initialPage} label={label} />
          </PageContainer>
        ) : (
          <PageContainer className={cx("section-tabs-inner", styles.compactTrack)} data-public-subcategory-track>
            {items.map((item, index) => (
              <CompactItem
                item={item}
                key={item.href + "-" + index}
                onSelect={onSelect ? (event) => onSelect(event, index) : undefined}
              />
            ))}
          </PageContainer>
        )}
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
