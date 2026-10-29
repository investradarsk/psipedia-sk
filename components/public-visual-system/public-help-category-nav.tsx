import Link from "next/link";
import { HelpCategoryIcon } from "@/components/help-public-icons";
import type { HelpCategorySlug } from "@/lib/help";
import styles from "./public-help-category-nav.module.css";

export type HelpNavItem = {
  slug: HelpCategorySlug;
  href: string;
  label: string;
  count?: number;
  current?: boolean;
};

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
