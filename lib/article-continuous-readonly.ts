/** Read-only bridge for the first stage of the continuous article editor.
 * This is a presentation model only. Never serialize it back to managed_articles.
 * The original ArticleBlock objects travel in Tiptap node attributes unchanged.
 */
import type { ArticleBlock } from "@/lib/article-blocks";
import type { EditorialRichTextDocument } from "@/lib/editorial-content";
import { articleBlocksToContinuousNodes } from "@/lib/article-continuous-document";
import { planArticleSourceDisplay } from "@/lib/article-source-dedup";
import { editorialToTiptap, type TiptapEditorialDocument, type TiptapEditorialNode } from "@/lib/tiptap-editorial-bridge";

export type ContinuousReadOnlyInput = {
  introRichText: EditorialRichTextDocument;
  takeawayRichText: EditorialRichTextDocument;
  takeaway: string;
  blocks: ArticleBlock[];
  promoUtcDay?: string;
};

function withOrigin(node: TiptapEditorialNode, attrs: Record<string, unknown>): TiptapEditorialNode {
  return { ...node, attrs: { ...node.attrs, ...attrs } };
}

function proseNodes(value: EditorialRichTextDocument, origin: Record<string, unknown>): TiptapEditorialNode[] {
  return editorialToTiptap(value).content.map((node) => withOrigin(node, origin));
}

/** Non-destructive conversion. Unknown block kinds fail visibly, not as missing paragraphs. */
export function articleToContinuousReadOnlyDocument(input: ContinuousReadOnlyInput): TiptapEditorialDocument {
  if (!Array.isArray(input.blocks)) throw new Error("Obsah článku nie je platným zoznamom blokov.");
  const nodes: TiptapEditorialNode[] = proseNodes(input.introRichText, { sourceField: "intro" });
  if (input.takeaway.trim()) {
    // The callout remains a native Psipedia component until edit round-tripping is implemented.
    editorialToTiptap(input.takeawayRichText); // explicit validation, no silent fallback
    nodes.push({ type: "psipediaArticleWidget", attrs: {
      kind: "takeaway", document: input.takeawayRichText,
    } });
  }

  const { contentBlocks, sourceBlocks, hasManualSourceSection } = planArticleSourceDisplay(input.blocks);
  nodes.push(...articleBlocksToContinuousNodes(contentBlocks, { promoUtcDay: input.promoUtcDay }));
  if (sourceBlocks.length) {
    // Same source planning as article-detail.tsx, including manual-source deduplication.
    // Each original source object is retained in the read-only widget attributes.
    nodes.push({ type: "psipediaArticleWidget", attrs: {
      kind: "sources", blocks: sourceBlocks,
      sourceHeading: hasManualSourceSection ? "Ďalšie odborné zdroje" : "Odborné zdroje",
    } });
  }
  return { type: "doc", content: nodes };
}
