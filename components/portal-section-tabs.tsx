import { PublicSubcategoryNavigator } from "@/components/public-visual-system";
import { portalSubpageHref, type PortalSection } from "@/lib/portal";
import styles from "./portal-section-tabs.module.css";
import { PortalMobileCategorySelect } from "./portal-mobile-category-select";

export function PortalSectionTabs({
  section,
  activeSlug,
}: {
  section: PortalSection;
  activeSlug?: string;
}) {
  const subpages = section.subpages.filter((subpage) => subpage.visible !== false);
  if (!subpages.length) return null;

  const items = [
    { href: `/${section.slug}`, title: "Prehľad", current: !activeSlug },
    ...subpages.map((subpage) => ({
      href: portalSubpageHref(section, subpage),
      title: subpage.label,
      current: activeSlug === subpage.slug,
    })),
  ];
  return (
    <nav className={`portal-section-tabs portal-section-tabs--${section.accent} ${styles.nav}`}
      aria-label={`Navigácia v sekcii ${section.label}`}>
      <PortalMobileCategorySelect sectionLabel={section.label}
        items={items.map((item) => ({ href: item.href, label: item.title, current: item.current }))} />
      <div className={styles.desktopTabs}>
        <PublicSubcategoryNavigator
          mode="compact"
          label={`Kategórie v sekcii ${section.label}`}
          items={items}
        />
      </div>
    </nav>
  );
}
