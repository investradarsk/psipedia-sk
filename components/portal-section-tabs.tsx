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

  return (
    <PublicSubcategoryNavigator
      mode="compact"
      label={`Navigácia v sekcii ${section.label}`}
      className={`portal-section-tabs portal-section-tabs--${section.accent} ${styles.nav}`}
      items={[
        {
          href: `/${section.slug}`,
          title: "Prehľad",
          current: !activeSlug,
        },
        ...subpages.map((subpage) => ({
          href: portalSubpageHref(section, subpage),
          title: subpage.label,
          current: activeSlug === subpage.slug,
        })),
      ]}
    />
  );
}
