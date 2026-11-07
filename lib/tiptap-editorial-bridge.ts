/** Strict JSON bridge for v1 legacy and v2 styled Psipedia rich text.
 * Reject unknown marks and nodes instead of losing content on save. */
import {
  EDITORIAL_RICH_TEXT_VERSION,
  normalizeEditorialRichText,
  sanitizeEditorialHref,
  sanitizeEditorialColor,
  type EditorialRichTextDocument,
  type EditorialRichTextInline,
  type EditorialRichTextMark,
} from "@/lib/editorial-content";

export type TiptapEditorialNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: TiptapEditorialNode[];
};
export type TiptapEditorialDocument = { type: "doc"; content: TiptapEditorialNode[] };

function fromInline(inline: EditorialRichTextInline[]): TiptapEditorialNode[] {
  return inline.map((node) => {
    if (node.type === "hardBreak") return { type: "hardBreak" };
    const marks = node.marks?.map((mark) => {
      if (mark.type === "link") return { type: "link", attrs: { href: mark.href } };
      if (mark.type === "color") return { type: "textStyle", attrs: { color: mark.color } };
      if (mark.type === "highlight") return { type: "highlight", attrs: { color: mark.color } };
      return { type: mark.type };
    });
    return { type: "text", text: node.text, ...(marks?.length ? { marks } : {}) };
  });
}

export function editorialToTiptap(value: EditorialRichTextDocument): TiptapEditorialDocument {
  const doc = normalizeEditorialRichText(value);
  if (!doc) throw new Error("Unsupported Psipedia editorial document");
  return { type: "doc", content: doc.content.map((block): TiptapEditorialNode => {
    if (block.type === "paragraph") return { type: "paragraph", content: fromInline(block.content) };
    if (block.type === "heading") return {
      type: "heading", attrs: { level: block.level }, content: fromInline(block.content),
    };
    if (block.type === "bulletList" || block.type === "orderedList") return {
      type: block.type,
      content: block.items.map((item) => ({
        type: "listItem", content: [{ type: "paragraph", content: fromInline(item) }],
      })),
    };
    if (block.type === "blockquote") return {
      type: "blockquote", content: [{ type: "paragraph", content: fromInline(block.content) }],
    };
    return { type: "psipediaCallout", attrs: { tone: block.tone }, content: fromInline(block.content) };
  }) };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Tiptap node");
  }
  return value as Record<string, unknown>;
}
function asArray(value: unknown, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid Tiptap content length");
  return value;
}
function parseInline(value: unknown): EditorialRichTextInline[] {
  return asArray(value, 500).map((raw): EditorialRichTextInline => {
    const node = asRecord(raw);
    if (node.type === "hardBreak") return { type: "hardBreak" };
    if (node.type !== "text" || typeof node.text !== "string" || node.text.length > 20000) {
      throw new Error("Unsupported Tiptap inline node");
    }
    const marks: EditorialRichTextMark[] = asArray(node.marks, 8).map((entry) => {
      const mark = asRecord(entry);
      if (mark.type === "bold" || mark.type === "italic") return { type: mark.type };
      if (mark.type === "link") {
        const href = sanitizeEditorialHref(asRecord(mark.attrs).href);
        if (!href) throw new Error("Unsafe Tiptap link");
        return { type: "link", href };
      }
      if (mark.type === "underline") return { type: "underline" };
      if (mark.type === "textStyle" || mark.type === "highlight") {
        const color = sanitizeEditorialColor(asRecord(mark.attrs).color);
        if (!color) throw new Error("Invalid Tiptap color");
        return mark.type === "textStyle" ? { type: "color", color } : { type: "highlight", color };
      }
      throw new Error("Unsupported Tiptap mark: " + String(mark.type));
    });
    return { type: "text", text: node.text, ...(marks.length ? { marks } : {}) };
  });
}

/** Only the versioned supported subset is accepted. Unknown content never gets dropped. */
export function tiptapToEditorial(value: unknown): EditorialRichTextDocument {
  const doc = asRecord(value);
  if (doc.type !== "doc") throw new Error("Expected Tiptap doc");
  const content: EditorialRichTextDocument["content"] = asArray(doc.content, 250).map((entry) => {
    const node = asRecord(entry);
    if (node.type === "paragraph") return { type: "paragraph", content: parseInline(node.content) };
    if (node.type === "heading") {
      const level = asRecord(node.attrs).level;
      if (level !== 2 && level !== 3) throw new Error("Unsupported heading level");
      return { type: "heading", level, content: parseInline(node.content) };
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      const items = asArray(node.content, 100).map((listEntry) => {
        const item = asRecord(listEntry);
        if (item.type !== "listItem") throw new Error("Unexpected list child");
        const paragraphs = asArray(item.content, 1);
        if (paragraphs.length !== 1 || asRecord(paragraphs[0]).type !== "paragraph") {
          throw new Error("Unsupported list item content");
        }
        return parseInline(asRecord(paragraphs[0]).content);
      });
      return { type: node.type, items };
    }
    if (node.type === "blockquote") {
      const children = asArray(node.content, 1);
      if (children.length !== 1 || asRecord(children[0]).type !== "paragraph") {
        throw new Error("Unsupported blockquote content");
      }
      return { type: "blockquote", content: parseInline(asRecord(children[0]).content) };
    }
    if (node.type === "psipediaCallout") {
      const tone = asRecord(node.attrs).tone;
      if (tone !== "info" && tone !== "tip" && tone !== "warning") {
        throw new Error("Unsupported callout tone");
      }
      return { type: "callout", tone, content: parseInline(node.content) };
    }
    throw new Error("Unsupported Tiptap block: " + String(node.type));
  });
  const hasV2Style = content.some((block) => {
    const inline = "items" in block ? block.items.flat() : block.content;
    return inline.some((node) => node.type === "text" &&
      node.marks?.some((mark) => mark.type === "color" || mark.type === "highlight" || mark.type === "underline"));
  });
  const normalized = normalizeEditorialRichText({
    version: hasV2Style ? EDITORIAL_RICH_TEXT_VERSION : 1, type: "doc", content,
  });
  if (!normalized) throw new Error("Cannot normalize Tiptap document");
  return normalized;
}
