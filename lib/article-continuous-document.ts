/** Canonical, read-only projection from the existing ArticleBlock[] SQL contract to
 * a single Tiptap document. Stage 2 deliberately adds NO write/back-conversion API.
 *
 * Unlike the public display planner, this bridge never filters, deduplicates,
 * reorders or relocates sources. A complete JSON snapshot travels with every
 * source block so future editing can round-trip fields that have no native
 * Tiptap node (imageKey, gallery, captions, URLs, partner CTAs, etc.).
 */
import type { ArticleBlock } from "@/lib/article-blocks";
import { legacyRichTextToDocument, type EditorialRichTextDocument } from "@/lib/editorial-content";
import { editorialToTiptap, type TiptapEditorialDocument, type TiptapEditorialNode } from "@/lib/tiptap-editorial-bridge";

export type ContinuousArticleInput = {
  introRichText: EditorialRichTextDocument;
  takeawayRichText: EditorialRichTextDocument;
  takeaway: string;
  blocks: ArticleBlock[];
  promoUtcDay?: string;
};

const WIDGET_BLOCK_TYPES = new Set<ArticleBlock["type"]>([
  "image", "gallery", "bullet-list", "numbered-list", "tip", "warning",
  "quote", "table", "source", "related", "psipedia-promo", "cta", "embed",
]);

function snapshotBlock(block: ArticleBlock): ArticleBlock {
  // ArticleBlock and blocks_json are JSON contracts. Copy the complete original
  // object, including unrecognised extra fields; never share mutable form state.
  return JSON.parse(JSON.stringify(block)) as ArticleBlock;
}

function withOrigin(node: TiptapEditorialNode, attrs: Record<string, unknown>): TiptapEditorialNode {
  return { ...node, attrs: { ...node.attrs, ...attrs } };
}

/** 1:1 ordered body projection. All source positions and duplicate IDs survive. */
export function articleBlocksToContinuousNodes(
  blocks: ArticleBlock[],
  options: { promoUtcDay?: string } = {},
): TiptapEditorialNode[] {
  if (!Array.isArray(blocks)) throw new Error("Obsah článku nie je platným zoznamom blokov.");
  return blocks.flatMap((original, sourceBlockIndex): TiptapEditorialNode[] => {
    if (!original || typeof original !== "object" || typeof original.id !== "string" || !original.id.trim()) {
      throw new Error(`Neplatný blok článku na pozícii ${sourceBlockIndex + 1}.`);
    }
    const block = snapshotBlock(original);
    const origin = { sourceField: "body", sourceBlockId: block.id, sourceBlockIndex, sourceBlock: block };
    if (block.type === "text") {
      const parsed = editorialToTiptap(block.richText ?? legacyRichTextToDocument(block.content)).content;
      // Even empty blocks have one anchor for stable identity and later editing.
      const nodes = parsed.length ? parsed : [{ type: "paragraph", content: [] }];
      return nodes.map((node, sourceNodeIndex) => withOrigin(node, {
        ...origin, sourceNodeIndex, sourceNodeCount: nodes.length,
      }));
    }
    if (block.type === "h2" || block.type === "h3") {
      return [{ type: "heading", attrs: {
        level: block.type === "h2" ? 2 : 3,
        ...origin, sourceNodeIndex: 0, sourceNodeCount: 1,
      }, ...(block.text ? { content: [{ type: "text", text: block.text }] } : {}) }];
    }
    if (WIDGET_BLOCK_TYPES.has(block.type)) {
      return [{ type: "psipediaArticleWidget", attrs: {
        kind: "block", block, ...origin, sourceNodeIndex: 0, sourceNodeCount: 1,
        promoUtcDay: options.promoUtcDay ?? null,
      } }];
    }
    throw new Error(`Nepodporovaný typ bloku: ${String(block.type)}. Pôvodný obsah zostáva nezmenený.`);
  });
}

/** Future editor input. Boundary is essential when the intro is empty, so an
 * editor never has to guess which paragraphs belong to the intro vs the body.
 * The takeaway is present even if empty, preserving a stable editable anchor.
 * This document is NOT written to blocks_json or Notion in stage 2.
 */
export function articleToCanonicalContinuousDocument(input: ContinuousArticleInput): TiptapEditorialDocument {
  if (!input || typeof input.takeaway !== "string") throw new Error("Neplatný vstup editora článku.");
  const intro = editorialToTiptap(input.introRichText).content.map((node, sourceNodeIndex) =>
    withOrigin(node, { sourceField: "intro", sourceNodeIndex }));
  editorialToTiptap(input.takeawayRichText); // validate independently of the plain-text field
  return { type: "doc", content: [
    ...intro,
    { type: "psipediaArticleWidget", attrs: { kind: "boundary", sourceField: "intro-end" } },
    { type: "psipediaArticleWidget", attrs: {
      kind: "takeaway", sourceField: "takeaway", rawTakeaway: input.takeaway,
      document: JSON.parse(JSON.stringify(input.takeawayRichText)),
    } },
    ...articleBlocksToContinuousNodes(input.blocks, { promoUtcDay: input.promoUtcDay }),
  ] };
}
