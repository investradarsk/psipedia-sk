import type { DynamicUrlKind } from "@/lib/visual-library-dynamic-urls-contract";

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
