/** Read-only bridge for the first stage of the continuous article editor.
 * This is a presentation model only. Never serialize it back to managed_articles.
 * The original ArticleBlock objects travel in Tiptap node attributes unchanged.
 */
import type { ArticleBlock } from "@/lib/article-blocks";
import { legacyRichTextToDocument, type EditorialRichTextDocument } from "@/lib/editorial-content";
import { planArticleSourceDisplay } from "@/lib/article-source-dedup";
import { editorialToTiptap, type TiptapEditorialDocument, type TiptapEditorialNode } from "@/lib/tiptap-editorial-bridge";

export type ContinuousReadOnlyInput = {
  introRichText: EditorialRichTextDocument;
  takeawayRichText: EditorialRichTextDocument;
  takeaway: string;
  blocks: ArticleBlock[];
  promoUtcDay?: string;
};

const WIDGET_TYPES = new Set<ArticleBlock["type"]>([
  "image", "gallery", "bullet-list", "numbered-list", "tip", "warning",
  "quote", "table", "related", "psipedia-promo", "cta", "embed",
]);

function withOrigin(node: TiptapEditorialNode, attrs: Record<string, unknown>): TiptapEditorialNode {
  return { ...node, attrs: { ...node.attrs, ...attrs } };
}

function proseNodes(value: EditorialRichTextDocument, origin: Record<string, unknown>): TiptapEditorialNode[] {
  return editorialToTiptap(value).content.map((node) => withOrigin(node, origin));
}

function widget(block: ArticleBlock, promoUtcDay?: string): TiptapEditorialNode {
  return { type: "psipediaArticleWidget", attrs: {
    kind: "block", block, promoUtcDay: promoUtcDay ?? null,
  } };
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
  for (const block of contentBlocks) {
    if (!block || typeof block !== "object" || typeof block.id !== "string") {
      throw new Error("Obsah obsahuje neplatný blok, ktorý sa nesmie skryť.");
    }
    if (block.type === "text") {
      const textNodes = proseNodes(block.richText ?? legacyRichTextToDocument(block.content), {
        sourceBlockId: block.id, sourceBlock: block,
      });
      // Preserve empty text blocks as identifiable placeholders, not omitted nodes.
      nodes.push(...(textNodes.length ? textNodes : [{
        type: "paragraph", attrs: { sourceBlockId: block.id, sourceBlock: block },
      }]));
    } else if (block.type === "h2" || block.type === "h3") {
      nodes.push({ type: "heading", attrs: {
        level: block.type === "h2" ? 2 : 3, sourceBlockId: block.id, sourceBlock: block,
      }, ...(block.text ? { content: [{ type: "text", text: block.text }] } : {}) });
    } else if (WIDGET_TYPES.has(block.type)) {
      nodes.push(widget(block, input.promoUtcDay));
    } else {
      throw new Error(`Nepodporovaný typ bloku: ${String(block.type)}. Pôvodný obsah zostáva nezmenený.`);
    }
  }
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
