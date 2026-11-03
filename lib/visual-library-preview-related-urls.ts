import type { DynamicUrlKind } from "@/lib/visual-library-dynamic-urls-contract";
import type { ComponentHtmlId } from "@/lib/visual-library-html-evidence";

/**
 * A loose domain association for navigating published records from a preview.
 * It is NOT evidence that the component is rendered on each returned page.
 * Actual component-to-URL evidence is maintained in ownerKnownUsesForGroup.
 */
const GROUP_KINDS: Readonly<Record<string, DynamicUrlKind>> = {
  "directory-card": "directory",
  "directory-services-short": "directory",
  "directory-category-navigation": "directory",
  "breed-card": "breeds",
  "related-breed-list": "breeds",
  "breed-section-nav": "breeds",
  "event-list": "events",
  "event-listing-filtered": "events",
  "help-card": "help",
  "help-profile": "help",
  "help-category-nav": "help",
  "article-list": "articles",
  "article-list-wrapper": "articles",
};

export function relatedDynamicUrlKindForPreview(id: string): DynamicUrlKind | null {
  return GROUP_KINDS[id] ?? null;
}

/**
 * Only source-confirmed markers for published DETAIL URLs.
 * DirectoryServicesList is rendered by DirectoryProfileDetail, which is
 * mounted by app/adresar/[category]/[slug]/page.tsx. By contrast, cards and
 * listing filters belong to listing pages, NOT every individual profile.
 */
export function detailComponentProbeForGroup(
  groupId: string, kind: DynamicUrlKind,
): ComponentHtmlId | null {
  return kind === "directory" && groupId === "directory-services-short"
    ? "directory-services-short" : null;
}
