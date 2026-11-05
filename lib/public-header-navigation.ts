import type { NavigationItem } from "./navigation";
import type { PortalSection } from "./portal";

/** Only the fields used by the public header are sent over the RSC boundary.
 * The full portalSections editorial data must remain in the server bundle.
 */
type HeaderPortalSection = Pick<PortalSection, "slug" | "description" | "subpages">;

export type PublicHeaderNavigationItem = NavigationItem & {
  className?: "nav-help" | "nav-news";
  title?: string;
  children: NavigationItem[];
};

/** Preserve the original desktop/mobile menu, including stored child priority. */
export function buildPublicHeaderNavigation(
  navigationItems: readonly NavigationItem[],
  sections: readonly HeaderPortalSection[],
): PublicHeaderNavigationItem[] {
  const visible = navigationItems.filter((item) => item.visible);
  return visible.filter((item) => !item.parentId).map((item) => {
    const slug = item.href.split("/").filter(Boolean)[0] ?? "";
    const sectionSlug = item.id === "novinky" && slug === "clanky" ? "novinky" : slug;
    const section = sections.find((candidate) => candidate.slug === sectionSlug);
    const storedChildren = visible.filter((child) => child.parentId === item.id);
    const fallbackChildren: NavigationItem[] = ["steniatka", "starostlivost", "aktivity"].includes(sectionSlug)
      ? (section?.subpages ?? []).filter((subpage) => subpage.visible !== false).map((subpage, position) => ({
          id: `portal-${sectionSlug}-${subpage.slug}`,
          label: subpage.label,
          href: subpage.href ?? `/${sectionSlug}/${subpage.slug}`,
          parentId: item.id,
          position,
          visible: true,
        }))
      : [];
    return {
      ...item,
      className: sectionSlug === "pomoc-psom" ? "nav-help" as const : sectionSlug === "novinky" ? "nav-news" as const : undefined,
      title: section?.description,
      children: storedChildren.length ? storedChildren : fallbackChildren,
    };
  });
}
