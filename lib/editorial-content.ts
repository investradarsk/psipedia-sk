export const EDITORIAL_RICH_TEXT_VERSION = 1 as const;

export type EditorialRichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; href: string };

export type EditorialRichTextInline =
  | { type: "text"; text: string; marks?: EditorialRichTextMark[] }
  | { type: "hardBreak" };

export type EditorialRichTextBlock =
  | { type: "paragraph"; content: EditorialRichTextInline[] }
  | { type: "heading"; level: 2 | 3; content: EditorialRichTextInline[] }
  | { type: "bulletList" | "orderedList"; items: EditorialRichTextInline[][] }
  | { type: "blockquote"; content: EditorialRichTextInline[] }
  | { type: "callout"; tone: "info" | "tip" | "warning"; content: EditorialRichTextInline[] };

export type EditorialRichTextDocument = {
  version: typeof EDITORIAL_RICH_TEXT_VERSION;
  type: "doc";
  content: EditorialRichTextBlock[];
};

const MAX_TEXT_LENGTH = 20_000;
const MAX_BLOCKS = 250;
const MAX_LIST_ITEMS = 100;
const MAX_INLINE_NODES = 500;

function safeText(value: unknown, max = MAX_TEXT_LENGTH) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function sanitizeEditorialHref(value: unknown, allowInternal = true) {
  const href = safeText(value, 2_000).trim();
  if (!href) return "";
  if (allowInternal && href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeMarks(value: unknown): EditorialRichTextMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: EditorialRichTextMark[] = [];
  let hasBold = false;
  let hasItalic = false;
  let hasLink = false;

  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const mark = raw as Record<string, unknown>;
    if (mark.type === "bold" && !hasBold) {
      result.push({ type: "bold" });
      hasBold = true;
      continue;
    }
    if (mark.type === "italic" && !hasItalic) {
      result.push({ type: "italic" });
      hasItalic = true;
      continue;
    }
    if (mark.type === "link" && !hasLink) {
      const href = sanitizeEditorialHref(mark.href, true);
      if (href) {
        result.push({ type: "link", href });
        hasLink = true;
      }
    }
  }

  return result.length ? result : undefined;
}

function normalizeInline(value: unknown): EditorialRichTextInline[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_INLINE_NODES).flatMap((raw): EditorialRichTextInline[] => {
    if (!raw || typeof raw !== "object") return [];
    const node = raw as Record<string, unknown>;
    if (node.type === "hardBreak") return [{ type: "hardBreak" }];
    if (node.type !== "text") return [];
    const text = safeText(node.text);
    if (!text) return [];
    const marks = normalizeMarks(node.marks);
    return [{ type: "text", text, ...(marks ? { marks } : {}) }];
  });
}

function normalizeListItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => normalizeInline(item))
    .filter((item) => item.length > 0);
}

export function normalizeEditorialRichText(value: unknown): EditorialRichTextDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Record<string, unknown>;
  if (doc.type !== "doc" || doc.version !== EDITORIAL_RICH_TEXT_VERSION || !Array.isArray(doc.content)) return null;

  const content = doc.content.slice(0, MAX_BLOCKS).flatMap((raw): EditorialRichTextBlock[] => {
    if (!raw || typeof raw !== "object") return [];
    const block = raw as Record<string, unknown>;
    if (block.type === "paragraph") {
      const inline = normalizeInline(block.content);
      return inline.length ? [{ type: "paragraph", content: inline }] : [];
    }
    if (block.type === "heading") {
      const inline = normalizeInline(block.content);
      const level = block.level === 3 ? 3 : block.level === 2 ? 2 : null;
      return level && inline.length ? [{ type: "heading", level, content: inline }] : [];
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      const items = normalizeListItems(block.items);
      return items.length ? [{ type: block.type, items }] : [];
    }
    if (block.type === "blockquote") {
      const inline = normalizeInline(block.content);
      return inline.length ? [{ type: "blockquote", content: inline }] : [];
    }
    if (block.type === "callout") {
      const inline = normalizeInline(block.content);
      const tone = block.tone === "tip" || block.tone === "warning" ? block.tone : "info";
      return inline.length ? [{ type: "callout", tone, content: inline }] : [];
    }
    return [];
  });

  return { version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content };
}

function parseInlineMarkdown(value: string): EditorialRichTextInline[] {
  const normalized = safeText(value);
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\))/g;
  const parts = normalized.split(pattern).filter(Boolean);
  const nodes: EditorialRichTextInline[] = [];

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push({ type: "text", text: part.slice(2, -2), marks: [{ type: "bold" }] });
      continue;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      nodes.push({ type: "text", text: part.slice(1, -1), marks: [{ type: "italic" }] });
      continue;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = sanitizeEditorialHref(link[2], true);
      nodes.push(href
        ? { type: "text", text: link[1], marks: [{ type: "link", href }] }
        : { type: "text", text: link[1] });
      continue;
    }
    nodes.push({ type: "text", text: part });
  }

  return nodes;
}

function inlineWithBreaks(lines: string[]) {
  return lines.flatMap((line, index): EditorialRichTextInline[] => [
    ...(index ? [{ type: "hardBreak" } as const] : []),
    ...parseInlineMarkdown(line),
  ]);
}

export function legacyRichTextToDocument(value: string): EditorialRichTextDocument {
  const lines = safeText(value).replace(/\r\n?/g, "\n").split("\n");
  const content: EditorialRichTextBlock[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let listType: "bulletList" | "orderedList" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const inline = inlineWithBreaks(paragraph);
    if (inline.length) content.push({ type: "paragraph", content: inline });
    paragraph = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const inline = inlineWithBreaks(quote);
    if (inline.length) content.push({ type: "blockquote", content: inline });
    quote = [];
  };
  const flushList = () => {
    if (!listType || !listItems.length) return;
    const items = listItems.map((item) => parseInlineMarkdown(item)).filter((item) => item.length > 0);
    if (items.length) content.push({ type: listType, items });
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushQuote();
      flushList();
      continue;
    }

    const heading = line.match(/^\s*(##|###)\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushQuote();
      flushList();
      content.push({
        type: "heading",
        level: heading[1] === "###" ? 3 : 2,
        content: parseInlineMarkdown(heading[2].trim()),
      });
      continue;
    }

    const blockquote = line.match(/^\s*>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      flushList();
      quote.push(blockquote[1]);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const nextListType = bullet ? "bulletList" : numbered ? "orderedList" : null;
    if (nextListType) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushQuote();
  flushList();

  return { version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content: content.slice(0, MAX_BLOCKS) };
}

export function editorialRichTextPlainText(value: EditorialRichTextDocument | null | undefined) {
  const doc = normalizeEditorialRichText(value);
  if (!doc) return "";
  return doc.content.flatMap((block) => {
    if (block.type === "bulletList" || block.type === "orderedList") return block.items;
    return [block.content];
  }).flatMap((inline) => inline)
    .filter((node): node is Extract<EditorialRichTextInline, { type: "text" }> => node.type === "text")
    .map((node) => node.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
