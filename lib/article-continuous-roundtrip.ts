/** Stage 4: strict edit-to-existing-fields bridge. It never writes SQL or Notion.
 *
 * The parent article save workflow remains the ONLY write path; no migration,
 * no schema changes, no alternative article format in storage.
 */
import type { ArticleBlock } from "@/lib/article-blocks";
import {
  editorialRichTextPlainText, legacyRichTextToDocument,
  type EditorialRichTextDocument,
} from "@/lib/editorial-content";
import {
  editorialToTiptap, tiptapToEditorial,
  type TiptapEditorialNode,
} from "@/lib/tiptap-editorial-bridge";

export type ContinuousArticleFields = {
  intro: string;
  introRichText: EditorialRichTextDocument;
  takeaway: string;
  takeawayRichText: EditorialRichTextDocument;
  blocks: ArticleBlock[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Neplatný obsah: ${label}.`);
  }
  return value as Record<string, unknown>;
}
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function makeId(): string {
  return crypto.randomUUID();
}
function provenancedBlock(node: TiptapEditorialNode): ArticleBlock | null {
  if (node.attrs?.sourceBlock == null) return null;
  const original = record(node.attrs.sourceBlock, "pôvodný blok");
  if (typeof original.id !== "string" || !original.id.trim() || typeof original.type !== "string") {
    throw new Error("Blok stratil svoju pôvodnú identitu.");
  }
  return snapshot(original) as ArticleBlock;
}
function proseDocument(nodes: TiptapEditorialNode[]): EditorialRichTextDocument {
  return tiptapToEditorial({ type: "doc", content: nodes });
}
function nodeContent(node: TiptapEditorialNode): string {
  return (node.content ?? []).map(child =>
    child.type === "text" ? child.text ?? "" : child.type === "hardBreak" ? "\n" : "").join("");
}
function stableProseNode(node: TiptapEditorialNode): TiptapEditorialNode {
  const { type, content, marks, attrs } = node;
  if (type === "heading") return { type, attrs: { level: attrs?.level }, ...(content ? { content } : {}) };
  if (type === "psipediaCallout") return { type, attrs: { tone: attrs?.tone }, ...(content ? { content } : {}) };
  return { type, ...(content ? { content } : {}), ...(marks ? { marks } : {}) };
}
function sameRichText(original: ArticleBlock, nodes: TiptapEditorialNode[]): boolean {
  if (original.type !== "text") return false;
  const source = original.richText ?? legacyRichTextToDocument(original.content);
  return JSON.stringify(editorialToTiptap(source).content)
    === JSON.stringify(nodes.map(stableProseNode));
}

type PendingProse = { key: string; original: ArticleBlock | null; nodes: TiptapEditorialNode[] };

/** Converts one editable Tiptap document back into the *existing* fields.
 *
 * A new or changed paragraph/list stays in a text ArticleBlock; unchanged body
 * widgets return their exact JSON snapshots; headings remain native h2/h3.
 * Unknown node types, missing boundary, removed protected widgets and invalid
 * rich-text marks cause a visible error rather than a partial save.
 */
export function continuousDocumentToArticleFields(
  value: unknown,
  options: {
    requiredNativeBlockIds?: string[];
    originalIntro?: { intro: string; introRichText: EditorialRichTextDocument };
  } = {},
): ContinuousArticleFields {
  const doc = record(value, "Tiptap dokument");
  if (doc.type !== "doc" || !Array.isArray(doc.content)) throw new Error("Neplatný dokument článku.");
  const nodes = doc.content as TiptapEditorialNode[];
  const boundaries = nodes.flatMap((node, index) =>
    node.type === "psipediaArticleWidget" && node.attrs?.kind === "boundary" ? [index] : []);
  if (boundaries.length !== 1) throw new Error("Editor stratil hranicu medzi úvodom a článkom.");
  const boundary = boundaries[0];
  if (nodes[boundary].attrs?.sourceField !== "intro-end") throw new Error("Neplatná hranica úvodu.");
  const takeawayNode = nodes[boundary + 1];
  if (takeawayNode?.type !== "psipediaArticleWidget" || takeawayNode.attrs?.kind !== "takeaway") {
    throw new Error("Editor stratil blok To najdôležitejšie.");
  }
  if (nodes.slice(0, boundary).some(node => node.type === "psipediaArticleWidget")) {
    throw new Error("V úvode je nepodporovaný vložený blok.");
  }
  const introNodes = nodes.slice(0, boundary);
  const parsedIntro = proseDocument(introNodes);
  const originalIntro = options.originalIntro;
  const originalIntroNodes = originalIntro ? editorialToTiptap(originalIntro.introRichText).content : null;
  const keepOriginalIntro = !!originalIntroNodes && JSON.stringify(introNodes.map(stableProseNode))
    === JSON.stringify(originalIntroNodes.length ? originalIntroNodes : [{ type: "paragraph", content: [] }]);
  const introRichText = keepOriginalIntro ? snapshot(originalIntro!.introRichText) : parsedIntro;
  const takeawayRichText = record(takeawayNode.attrs?.document, "To najdôležitejšie") as EditorialRichTextDocument;
  editorialToTiptap(takeawayRichText);
  const takeaway = typeof takeawayNode.attrs?.rawTakeaway === "string"
    ? takeawayNode.attrs.rawTakeaway
    : editorialRichTextPlainText(takeawayRichText);

  const blocks: ArticleBlock[] = [];
  let pending: PendingProse | null = null;
  const flush = () => {
    if (!pending) return;
    const { nodes: content, original } = pending;
    const richText = proseDocument(content);
    if (original?.type === "text" && sameRichText(original, content)) {
      blocks.push(snapshot(original));
    } else if (content.length === 1 && content[0].type === "heading") {
      const level = content[0].attrs?.level;
      if (level !== 2 && level !== 3) throw new Error("Nepodporovaná úroveň nadpisu.");
      const text = nodeContent(content[0]);
      const id = original?.id ?? makeId();
      blocks.push({
        ...(original && (original.type === "h2" || original.type === "h3") ? original : {}),
        id, type: level === 2 ? "h2" : "h3", text,
      });
    } else {
      const id = original?.id ?? makeId();
      const inherited = original?.type === "text" ? original : null;
      blocks.push({
        ...(inherited ?? {}), id, type: "text",
        content: editorialRichTextPlainText(richText), richText,
      });
    }
    pending = null;
  };

  const encounteredNative: string[] = [];
  for (const [bodyIndex, node] of nodes.slice(boundary + 2).entries()) {
    if (node.type === "psipediaArticleWidget") {
      flush();
      if (node.attrs?.kind !== "block") throw new Error("Nepodporovaný vložený prvok článku.");
      const block = record(node.attrs.block, "vložený blok") as ArticleBlock;
      const previous = provenancedBlock(node);
      if (!previous || previous.id !== block.id || previous.type !== block.type) {
        throw new Error("Identita vloženého bloku sa zmenila. Ukladanie bolo zastavené.");
      }
      blocks.push(snapshot(block));
      encounteredNative.push(block.id);
      continue;
    }
    if (!["paragraph", "heading", "bulletList", "orderedList", "blockquote", "psipediaCallout"].includes(node.type)) {
      throw new Error(`Nepodporovaný uzol: ${node.type}.`);
    }
    const original = provenancedBlock(node);
    const originIndex = typeof node.attrs?.sourceBlockIndex === "number"
      ? node.attrs.sourceBlockIndex : null;
    const key = original ? `${originIndex ?? "-"}:${original.id}`
      : node.type === "heading" ? `new-heading:${bodyIndex}` : "new";
    if (pending && pending.key !== key) flush();
    if (!pending) pending = { key, original, nodes: [] };
    pending.nodes.push(node);
  }
  flush();
  // Native atoms must be deleted through an explicit confirmed UI action.
  // Accidental Backspace/drag mutations are never allowed to drop media/CTA.
  for (const id of options.requiredNativeBlockIds ?? []) {
    if (!encounteredNative.includes(id)) throw new Error(`Chýba pôvodný vložený blok ${id}. Uloženie bolo zastavené.`);
  }
  return {
    intro: keepOriginalIntro ? originalIntro!.intro : editorialRichTextPlainText(introRichText), introRichText,
    takeaway, takeawayRichText, blocks,
  };
}
