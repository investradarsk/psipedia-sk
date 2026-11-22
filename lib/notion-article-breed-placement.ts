import { canonicalArticleSubsectionOptions } from "@/lib/article-subsection-taxonomy";

/**
 * An article's editorial category is distinct from the atlas of breed profiles.
 * Returning null means a move cannot be mirrored without choosing a canonical
 * Notion section/subsection explicitly; never invent that destination.
 */
export type BreedArticlePlacement = {
  category: string;
  portalSection: string;
  portalSubpage?: string | null;
};

export type NotionArticleBreedPlacement = {
  category: string;
  subsection: string | null;
};

export function notionArticleBreedPlacement(
  article: BreedArticlePlacement,
): NotionArticleBreedPlacement | null {
  if (article.portalSection === "clanky") {
    return {
      category: article.category === "Plemená" ? "Plemená" : "Všeobecné články",
      subsection: null,
    };
  }
  const match = canonicalArticleSubsectionOptions().find(
    (entry) => entry.portalSection === article.portalSection &&
      entry.portalSubpage === article.portalSubpage,
  );
  return match ? { category: match.section, subsection: match.subsection } : null;
}

/** Only explicit moves into or out of Plemená are part of this feature. */
export function isBreedArticlePlacementChange(
  before: BreedArticlePlacement,
  after: BreedArticlePlacement,
): boolean {
  return (before.category === "Plemená" || after.category === "Plemená") &&
    (before.category !== after.category ||
      before.portalSection !== after.portalSection ||
      (before.portalSubpage ?? null) !== (after.portalSubpage ?? null));
}
