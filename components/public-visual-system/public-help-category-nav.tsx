import Link from "next/link";
import { HelpCategoryIcon } from "@/components/help-public-icons";
import { helpCategories, helpCategoryHref, type HelpCategorySlug } from "@/lib/help";
import styles from "./public-help-category-nav.module.css";

export type HelpNavItem = {
  slug: HelpCategorySlug;
  href: string;
  label: string;
  count?: number;
  current?: boolean;
};

/** Canonical navigation for every public Help subcategory. */
export function publicHelpCategoryItems(current?: HelpCategorySlug): HelpNavItem[] {
  return helpCategories.map((category) => ({
    slug: category.slug,
    label: category.label,
    href: category.slug === "adopcia"
      ? "/pomoc-psom/adopcia"
      : category.slug === "stratene-a-najdene"
        ? "/pomoc-psom/stratene-a-najdene"
        : helpCategoryHref({ slug: category.slug as Exclude<HelpCategorySlug, "urgentne-pripady"> }),
    current: current === category.slug,
  }));
}

export function PublicHelpCategoryNav({
  items,
  label = "Kategórie pomoci",
}: {
  items: readonly HelpNavItem[];
  label?: string;
}) {
  return (
    <nav className={styles.nav} aria-label={label} data-help-category-nav data-public-category-navigation>
      {items.map((item) => (
        <Link
          key={item.slug}
          className={styles.item}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
        >
          <HelpCategoryIcon category={item.slug} size={19} />
          <span className={styles.label}>{item.label}</span>
          {typeof item.count === "number" && <span className={styles.count}>{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
