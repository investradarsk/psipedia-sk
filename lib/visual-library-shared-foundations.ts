/**
 * Verified public component composition (source evidence, not screenshot proof).
 *
 * Different wrappers have different behavior and CSS. Sharing the inner
 * PublicSubcategoryNavigator does NOT make the wrappers safe to delete.
 * Group IDs refer to the owner's canonical visual catalogue, not filenames.
 */
export type VerifiedSharedFoundation = {
  base: string;
  basePath: string;
  sourcePath: string;
  relation: "direct-renderer" | "purpose-specific-wrapper";
  chain: readonly string[];
  distinction: string;
};

const BASE = "components/public-visual-system/public-subcategory-navigator.tsx";

export const VERIFIED_NAVIGATION_FOUNDATIONS: Readonly<Record<string, VerifiedSharedFoundation>> = {
  "subcategory-landing": {
    base: "PublicSubcategoryNavigator",
    basePath: BASE,
    sourcePath: BASE,
    relation: "direct-renderer",
    chain: ["PublicSubcategoryNavigator (landing / compact)"],
    distinction: "Dva výslovne podporované vizuálne režimy jedného komponentu.",
  },
  "help-category-nav": {
    base: "PublicSubcategoryNavigator",
    basePath: BASE,
    sourcePath: "components/public-visual-system/public-help-category-nav.tsx",
    relation: "purpose-specific-wrapper",
    chain: ["PublicHelpCategoryNav", "PublicSubcategoryNavigator (compact, grid mobile)"],
    distinction: "Dopĺňa kategórie Pomoc psom, ikony a počty; nejde o zbytočnú kópiu.",
  },
  "directory-category-navigation": {
    base: "PublicSubcategoryNavigator",
    basePath: BASE,
    sourcePath: "components/directory-category-navigation.tsx",
    relation: "purpose-specific-wrapper",
    chain: ["DirectoryCategoryNavigation", "PublicSubcategoryNavigator (compact)"],
    distinction: "Pridáva výber kategórie a rozbalenie pre širší adresár.",
  },
  "portal-section-tabs": {
    base: "PublicSubcategoryNavigator",
    basePath: BASE,
    sourcePath: "components/portal-section-tabs.tsx",
    relation: "purpose-specific-wrapper",
    chain: ["PortalSectionTabs", "PublicSubcategoryNavigator (compact)"],
    distinction: "Pridáva tematické podstránky a samostatný mobilný výber.",
  },
};

export function verifiedSharedFoundationForGroup(id: string): VerifiedSharedFoundation | null {
  return Object.prototype.hasOwnProperty.call(VERIFIED_NAVIGATION_FOUNDATIONS, id)
    ? VERIFIED_NAVIGATION_FOUNDATIONS[id] : null;
}

export function ownerGroupsShareFoundation(leftId: string, rightId: string): boolean {
  const left = verifiedSharedFoundationForGroup(leftId);
  const right = verifiedSharedFoundationForGroup(rightId);
  return Boolean(left && right && left.basePath === right.basePath);
}
