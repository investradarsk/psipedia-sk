import { HelpCategoryIcon } from "@/components/help-public-icons";
import { helpCategories, helpCategoryHref, type HelpCategorySlug } from "@/lib/help";
import { PublicSubcategoryNavigator } from "./public-subcategory-navigator";
import styles from "./public-help-category-nav.module.css";

export type HelpNavItem = {
  slug: HelpCategorySlug;
  href: string;
  label: string;
  count?: number;
  current?: boolean;
};

/** All Help category links use the same public navigator as editorial subcategories. */
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

/** One compact category presentation across Help root and all Help subcategories. */
export function PublicHelpCategoryNav({
  items,
  label = "Kategórie pomoci",
}: {
  items: readonly HelpNavItem[];
  label?: string;
}) {
  return (
    <div className={styles.nav} data-help-category-nav data-public-category-navigation>
      <PublicSubcategoryNavigator
        label={label}
        mode="compact"
        mobileLayout="grid"
        items={items.map((item) => ({
          href: item.href,
          title: item.label,
          icon: <HelpCategoryIcon category={item.slug} size={19} />,
          meta: typeof item.count === "number"
            ? <span aria-label={`Počet profilov: ${item.count}`}>{item.count}</span>
            : undefined,
          current: item.current,
        }))}
      />
    </div>
  );
}
