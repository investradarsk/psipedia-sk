import { PublicSubcategoryNavigator } from "@/components/public-visual-system";
import { portalSubpageHref, type PortalSection } from "@/lib/portal";
import styles from "./portal-section-tabs.module.css";

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
    <div className={`portal-section-tabs portal-section-tabs--${section.accent} ${styles.nav}`}
      data-public-editorial-category-navigation>
      <PublicSubcategoryNavigator
        mode="compact"
        mobileLayout="grid"
        columns={6}
        label={`Kategórie v sekcii ${section.label}`}
        items={items}
      />
    </div>
  );
}
