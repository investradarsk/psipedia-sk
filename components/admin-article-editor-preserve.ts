import type { ManagedArticle, ManagedArticleInput } from "../lib/article-store";

type EditorMetadata = Pick<
  ManagedArticleInput,
  "portalSubpage" | "sections" | "sources" | "imageDisplay" | "imageFocusX" | "imageFocusY"
>;

/**
 * Fields that the current editor does not independently expose must survive a
 * regular save. Changing the hero picture resets its old legacy crop only.
 * Do not carry an area's slug into a different portal section.
 */
export function preservedEditorArticleMetadata(
  original: ManagedArticle | undefined,
  edited: { portalSection: string; portalSubpage: string | null; imageUrl: string | null },
): EditorMetadata {
  const sameHeroImage = Boolean(original?.image && original.image === edited.imageUrl);
  const preserveHiddenArea = edited.portalSection === original?.portalSection
    && !edited.portalSubpage && Boolean(original?.portalSubpage);

  return {
    portalSubpage: preserveHiddenArea ? original?.portalSubpage ?? null : edited.portalSubpage,
    sections: original?.sections ?? [],
    sources: original?.sources ?? [],
    imageDisplay: sameHeroImage ? original?.imageDisplay ?? "auto" : "auto",
    imageFocusX: sameHeroImage ? original?.imageFocusX ?? null : null,
    imageFocusY: sameHeroImage ? original?.imageFocusY ?? null : null,
  };
}
