import { HelpCategoryIcon } from "@/components/help-public-icons";
import { helpCategories, helpCategoryHref, type HelpCategorySlug } from "@/lib/help";
import { PublicSubcategoryNavigator } from "./public-subcategory-navigator";
import styles from "./public-help-category-nav.module.css";
import { dogReportBasePath } from "@/lib/lost-found-dogs";
import type { DogReportType } from "@/lib/lost-found-dogs";
import { PublicContentShell } from "./public-landing-layout";

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
      : category.slug === "utulky"
        ? "/organizacie"
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
  reportScope,
}: {
  items: readonly HelpNavItem[];
  label?: string;
  reportScope?: "all" | DogReportType;
}) {
  return (
    <div className={styles.nav} data-help-category-nav data-public-category-navigation>
      <PublicSubcategoryNavigator
        label={label}
        mode="compact"
        mobileLayout="grid"
        columns={6}
        items={items.map((item) => ({
          href: item.href,
          title: item.label,
          icon: <HelpCategoryIcon category={item.slug} size={19} />,
          current: item.current,
        }))}
      />
      {reportScope && <PublicHelpReportNav current={reportScope} />}
    </div>
  );
}

/** Report types remain a subordinate navigation, not a separate portal section. */
export function PublicHelpReportNav({ current }: { current: "all" | DogReportType }) {
  const tabs = [
    { key: "all", href: "/pomoc-psom/stratene-a-najdene", label: "Všetky hlásenia" },
    { key: "LOST", href: dogReportBasePath("LOST"), label: "Stratené psy" },
    { key: "FOUND", href: dogReportBasePath("FOUND"), label: "Nájdené psy" },
  ] as const;
  return (
    <div className={styles.reportNav} data-help-report-nav>
      <PublicSubcategoryNavigator
        label="Typ hlásenia"
        mode="compact"
        mobileLayout="grid"
        items={tabs.map((tab) => ({
          href: tab.href,
          title: tab.label,
          current: current === tab.key,
        }))}
      />
    </div>
  );
}

/** Align the same Help navigation with the content on standalone detail pages. */
export function PublicHelpSectionNav({
  current,
  reportScope,
}: {
  current?: HelpCategorySlug;
  reportScope?: "all" | DogReportType;
}) {
  return (
    <PublicContentShell variant="listing" className={styles.detailNav}>
      <PublicHelpCategoryNav items={publicHelpCategoryItems(current)} reportScope={reportScope} />
    </PublicContentShell>
  );
}
