import {
  EDITORIAL_RICH_TEXT_VERSION,
  sanitizeEditorialHref,
  type EditorialRichTextDocument,
  type EditorialRichTextInline,
  type EditorialRichTextMark,
} from "./editorial-content";
import { safeEventLink } from "./event-markdown";

/**
 * Keep the existing event Markdown API and D1/Notion format unchanged.
 * Return null for non-canonical/unsupported legacy source instead of silently
 * rewriting it; those records remain editable in source mode.
 */
function parseInline(value: string, inherited: EditorialRichTextMark[] = []): EditorialRichTextInline[] | null {
  const nodes: EditorialRichTextInline[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let cursor = 0;
  const add = (text: string, marks = inherited) => {
    if (text) nodes.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
  };
  for (const match of value.matchAll(pattern)) {
    add(value.slice(cursor, match.index));
    if (match[1] !== undefined) {
      add(match[1], [...inherited, { type: "bold" }]);
    } else if (match[2] !== undefined) {
      add(match[2], [...inherited, { type: "italic" }]);
    } else {
      const href = match[4];
      // Lexical uses the existing article link sanitizer. URLs whose spelling
      // it would change (or mailto/hash links it doesn't support) stay in source mode.
      if (safeEventLink(href) !== href || sanitizeEditorialHref(href) !== href) return null;
      const inside = parseInline(match[3], [...inherited, { type: "link", href }]);
      if (!inside) return null;
      nodes.push(...inside);
    }
    cursor = match.index! + match[0].length;
  }
  add(value.slice(cursor));
  return nodes;
}

function serializeInline(inline: EditorialRichTextInline[]): string {
  return inline.map((node) => {
    if (node.type === "hardBreak") return "\n";
    let text = node.text;
    const marks = node.marks ?? [];
    // Links wrap already-formatted labels; the existing public renderer handles this.
    if (marks.some((mark) => mark.type === "bold")) text = "**" + text + "**";
    if (marks.some((mark) => mark.type === "italic")) text = "*" + text + "*";
    const link = marks.find((mark) => mark.type === "link");
    if (link?.type === "link") text = "[" + text + "](" + link.href + ")";
    return text;
  }).join("");
}

export function editorialToEventMarkdown(document: EditorialRichTextDocument): string {
  return document.content.map((block) => {
    if (block.type === "heading") return (block.level === 3 ? "### " : "## ") + serializeInline(block.content);
    if (block.type === "bulletList") return block.items.map((item) => "- " + serializeInline(item)).join("\n");
    if (block.type === "orderedList") return block.items.map((item, i) => (i + 1) + ". " + serializeInline(item)).join("\n");
    if (block.type === "paragraph") return serializeInline(block.content);
    // Quotes and callouts are deliberately not offered in event editing:
    // the public event Markdown renderer does not support those node types.
    return serializeInline(block.content);
  }).join("\n\n");
}

export function eventMarkdownToEditorial(source: string): EditorialRichTextDocument | null {
  if (source.length > 20_000 || source.includes("\r")) return null;
  const content: EditorialRichTextDocument["content"] = [];
  if (!source) return { version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content };
  const lines = source.split("\n");
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue; }
    if (/^#{2,3} /.test(lines[index])) {
      const line = lines[index++];
      const inline = parseInline(line.replace(/^#{2,3} /, ""));
      if (!inline?.length) return null;
      content.push({ type: "heading", level: line.startsWith("### ") ? 3 : 2, content: inline });
      continue;
    }
    const listMarker = /^(?:[-*] |[0-9]+\. )/;
    if (listMarker.test(lines[index])) {
      const ordered = /^[0-9]+\. /.test(lines[index]);
      const items: EditorialRichTextInline[][] = [];
      while (index < lines.length && listMarker.test(lines[index]) && ordered === /^[0-9]+\. /.test(lines[index])) {
        const inline = parseInline(lines[index++].replace(listMarker, ""));
        if (!inline?.length) return null;
        items.push(inline);
      }
      content.push({ type: ordered ? "orderedList" : "bulletList", items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^#{2,3} /.test(lines[index]) && !listMarker.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    const inline: EditorialRichTextInline[] = [];
    for (const [position, line] of paragraph.entries()) {
      if (position > 0) inline.push({ type: "hardBreak" });
      const parsed = parseInline(line);
      if (!parsed) return null;
      inline.push(...parsed);
    }
    if (!inline.length) return null;
    content.push({ type: "paragraph", content: inline });
    if (content.length > 250) return null;
  }
  const doc: EditorialRichTextDocument = { version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content };
  // The only safe way to move old Markdown to a WYSIWYG editor is a
  // lossless source round trip. Other spellings/structures remain editable
  // in the original source, without mutation on read or save.
  if (editorialToEventMarkdown(doc) !== source) return null;
  return doc;
}
