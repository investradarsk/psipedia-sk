import Link from "next/link";
import { SectionTabs } from "@/components/page-system";
import { portalSubpageHref, type PortalSection } from "@/lib/portal";

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
    <SectionTabs label={`Navigácia v sekcii ${section.label}`} className={`portal-section-tabs portal-section-tabs--${section.accent}`}>
      <Link
        className={`section-tab${activeSlug ? "" : " is-active"}`}
        href={`/${section.slug}`}
        aria-current={activeSlug ? undefined : "page"}
      >
        Prehľad
      </Link>
      {subpages.map((subpage) => {
        const active = activeSlug === subpage.slug;
        return (
          <Link
            className={`section-tab${active ? " is-active" : ""}`}
            href={portalSubpageHref(section, subpage)}
            aria-current={active ? "page" : undefined}
            key={subpage.slug}
          >
            {subpage.label}
          </Link>
        );
      })}
    </SectionTabs>
  );
}
