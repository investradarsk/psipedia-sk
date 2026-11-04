import {
  PublicSubcategoryNavigator,
  type PublicSubcategoryItem,
} from "@/components/public-visual-system";
import styles from "./directory-public.module.css";

/** Same fully visible category navigation as Help and Events on every viewport. */
export function DirectoryCategoryNavigation({ items }: { items: PublicSubcategoryItem[] }) {
  return (
    <div className={styles.sharedCategoryNavigation} data-directory-category-navigation data-directory-category-nav>
      <PublicSubcategoryNavigator
        mode="compact"
        mobileLayout="grid"
        columns={6}
        items={items}
        label="Kategórie služieb pre psov"
      />
    </div>
  );
}
