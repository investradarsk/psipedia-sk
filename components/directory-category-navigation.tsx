"use client";

import { useRouter } from "next/navigation";
import {
  PublicSubcategoryNavigator,
  type PublicSubcategoryItem,
} from "@/components/public-visual-system";
import styles from "./directory-public.module.css";

/** Mobile has a labeled native list of all categories: nothing is cut off
 * horizontally and no visitor needs to discover a hidden swipe gesture.
 * Desktop continues to use the canonical SEO-friendly linked category tabs. */
export function DirectoryCategoryNavigation({ items }: { items: PublicSubcategoryItem[] }) {
  const router = useRouter();
  const currentHref = items.find((item) => item.current)?.href ?? "";
  return (
    <div className={styles.categorySwitcherWrap} data-directory-category-navigation>
      <div className={styles.categoryNavTop}>
        <label htmlFor="directory-category-select">Kategória služby</label>
      </div>
      <select
        id="directory-category-select"
        className={styles.categoryMobileSelect}
        value={currentHref}
        onChange={(event) => {
          if (event.target.value) router.push(event.target.value);
        }}
        aria-label="Vyber kategóriu služby"
      >
        {!currentHref && <option value="">Vyber kategóriu</option>}
        {items.map((item) => (
          <option key={item.href} value={item.href}>
            {typeof item.title === "string" ? item.title : item.href.split("/").filter(Boolean).pop() ?? "Kategória"}
          </option>
        ))}
      </select>
      <div className={styles.categoryDesktopTabs}>
        <PublicSubcategoryNavigator
          mode="compact"
          items={items}
          label="Prepnúť kategóriu služby"
          className={styles.categorySwitcher}
        />
      </div>
    </div>
  );
}
