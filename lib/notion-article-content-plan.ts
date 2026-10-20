/**
 * Conservative article editor -> Notion adapter. It NEVER silently truncates,
 * drops, or reinterprets a block; incompatible structural edits fail closed.
 * Notion cannot atomically replace a page's ordered child-block collection.
 */
import type { ArticleBlock } from "@/lib/article-blocks";
import type { EditorialRichTextDocument, EditorialRichTextInline } from "@/lib/editorial-content";

type RecordValue = Record<string, unknown>;
export type RemoteArticleBlock = { id: string; type: string; [key: string]: unknown };
export type EditorialArticle = {
  id: number; status: string; title: string; slug: string; intro: string;
  introRichText?: EditorialRichTextDocument | null; blocks: ArticleBlock[];
  seoTitle: string; metaDescription: string; focusKeyword: string;
  ogTitle?: string; ogDescription?: string; image?: string | null;
  imageAlt?: string | null; imageCreditUrl?: string | null;
};
export type NotionEditorialOperation = {
  id: string;
  type: string;
  before: string;
  after: string;
  payload: RecordValue;
};
export type NotionEditorialPlan = {
  properties: RecordValue;
  propertyBefore: Record<string, string>;
  propertyAfter: Record<string, string>;
  blocks: NotionEditorialOperation[];
};
export class EditorialSyncConflict extends Error {
  constructor(public readonly code: string) { super(code); this.name = "EditorialSyncConflict"; }
}
function fail(code: string): never { throw new EditorialSyncConflict(code); }
function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function requireRemoteHttps(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
  } catch { /* invalid URL */ }
  return fail("UNSUPPORTED_EDITORIAL_URL");
}
function notionText(textValue: string) {
  const chunks: string[] = [];
  for (let i = 0; i < textValue.length; i += 1900) chunks.push(textValue.slice(i, i + 1900));
  if (chunks.length > 100) fail("NOTION_TEXT_LIMIT");
  return chunks.map((chunk) => ({ type: "text", text: { content: chunk }, annotations: { bold: false, italic: false } }));
}
function remoteRichText(value: unknown) {
  if (!Array.isArray(value)) fail("INVALID_REMOTE_RICH_TEXT");
  const nodes: RecordValue[] = [];
  for (const raw of value) {
    const node = object(raw);
    if (node.type !== "text" || !object(node.text).content && typeof node.plain_text !== "string") {
      fail("UNSUPPORTED_NOTION_INLINE");
    }
    const annotations = object(node.annotations);
    if (annotations.underline === true || annotations.strikethrough === true ||
      annotations.code === true || (annotations.color && annotations.color !== "default")) {
      fail("UNSUPPORTED_NOTION_MARK");
    }
    const url = text(node.href) || text(object(object(node.text).link).url);
    const content = text(object(node.text).content) || text(node.plain_text);
    nodes.push(...richNodes([{ type: "text", text: content, marks: [
      ...(annotations.bold === true ? [{ type: "bold" as const }] : []),
      ...(annotations.italic === true ? [{ type: "italic" as const }] : []),
      ...(url ? [{ type: "link" as const, href: url }] : []),
    ] }]));
  }
  return nodes;
}
function richNodes(nodes: EditorialRichTextInline[]): RecordValue[] {
  const output: RecordValue[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      if (!output.length) output.push({ type: "text", text: { content: "\n" } });
      else (object(output[output.length - 1].text)).content =
        text(object(output[output.length - 1].text).content) + "\n";
      continue;
    }
    const annotations = { bold: false, italic: false };
    let url = "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") annotations.bold = true;
      if (mark.type === "italic") annotations.italic = true;
      if (mark.type === "link") url = requireRemoteHttps(mark.href);
    }
    if (!node.text) continue;
    for (const part of notionText(node.text)) {
      output.push({
        ...part,
        ...(url ? { text: { ...object(part.text), link: { url } } } : {}),
        annotations,
      });
    }
  }
  if (output.length > 100) fail("NOTION_RICH_TEXT_LIMIT");
  return output;
}
function documentNodes(doc: EditorialRichTextDocument | null | undefined, plain: string, expected: string) {
  if (!doc) return notionText(plain);
  if (doc.type !== "doc" || doc.content.length !== 1 || doc.content[0]?.type !== expected) {
    return fail("UNSUPPORTED_RICH_TEXT_STRUCTURE");
  }
  return richNodes(doc.content[0].content);
}
export function notionEditorialBlockShape(block: RemoteArticleBlock): string {
  return JSON.stringify(shape(block));
}
function shape(block: RemoteArticleBlock): RecordValue {
  const body = object(block[block.type]);
  if (block.has_children && block.type !== "table") fail("UNSUPPORTED_NOTION_CHILDREN");
  if (block.type === "image" || block.type === "embed" || block.type === "video") {
    if (block.type === "image" && body.type !== "external") fail("UNSUPPORTED_NOTION_IMAGE_SOURCE");
    const src = block.type === "embed" ? text(body.url) : text(object(body.external).url);
    return { type: block.type, url: src, caption: remoteRichText(body.caption ?? []) };
  }
  if (block.type === "table") return { type: "table", rows: block.children ?? null, width: body.table_width };
  return { type: block.type, rich_text: remoteRichText(body.rich_text ?? []),
    ...(block.type === "callout" ? { icon: object(body.icon).emoji ?? "" } : {}) };
}
function targetBlocks(article: EditorialArticle, siteUrl: string) {
  const all: RecordValue[] = [{ type: "paragraph",
    rich_text: documentNodes(article.introRichText, article.intro, "paragraph") }];
  for (const block of article.blocks ?? []) {
    if (block.type === "text") all.push({ type: "paragraph", rich_text: documentNodes(block.richText, block.content, "paragraph") });
    else if (block.type === "h2" || block.type === "h3")
      all.push({ type: block.type === "h2" ? "heading_2" : "heading_3", rich_text: notionText(block.text) });
    else if (block.type === "quote") {
      if (block.attribution) fail("UNSUPPORTED_QUOTE_ATTRIBUTION");
      all.push({ type: "quote", rich_text: documentNodes(block.richText, block.content, "blockquote") });
    } else if (block.type === "tip" || block.type === "warning")
      all.push({ type: "callout", rich_text: documentNodes(block.richText, block.content, "callout"),
        icon: block.type === "warning" ? "⚠️" : "💡" });
    else if (block.type === "bullet-list" || block.type === "numbered-list") {
      for (const item of block.items) {
        if (/(\*\*|(?<!\w)_[^_]|]\(|\[[^\]]+\]\()/.test(item)) fail("UNSUPPORTED_LIST_MARKDOWN");
        all.push({ type: block.type === "bullet-list" ? "bulleted_list_item" : "numbered_list_item", rich_text: notionText(item) });
      }
    } else if (block.type === "image") {
      const url = block.url.startsWith("/media/") ? siteUrl + block.url : block.url;
      if (block.alt && block.caption && block.alt !== block.caption) fail("IMAGE_ALT_CAPTION_MISMATCH");
      all.push({ type: "image", url: requireRemoteHttps(url), caption: notionText(block.caption || block.alt || "") });
    } else if (block.type === "embed") {
      if (block.title && block.caption && block.title !== block.caption) fail("EMBED_CAPTION_MISMATCH");
      all.push({ type: "embed", url: requireRemoteHttps(block.url),
        caption: notionText(block.caption || block.title || "") });
    } else if (block.type === "table") {
      all.push({ type: "table", rows: { headers: block.headers, rows: block.rows } });
    } else fail("UNSUPPORTED_ADMIN_BLOCK_" + block.type);
  }
  return all;
}
export function notionEditorialPropertyText(rawValue: unknown, type: "title" | "rich_text" | "url") {
  const raw = object(rawValue);
  return type === "url" ? text(raw.url) : (Array.isArray(raw[type])
    ? raw[type].map((record: unknown) => text(object(record).plain_text) || text(object(object(record).text).content)).join("") : "");
}
export function buildNotionEditorialPlan(args: {
  article: EditorialArticle;
  remoteBlocks: RemoteArticleBlock[];
  pageProperties: Record<string, unknown>;
  siteUrl: string;
}): NotionEditorialPlan {
  const { article, remoteBlocks, pageProperties } = args;
  if (article.status !== "draft") fail("NOT_A_DRAFT");
  const desired = targetBlocks(article, args.siteUrl);
  if (desired.length !== remoteBlocks.length) fail("UNSUPPORTED_BLOCK_INSERT_DELETE");
  const operations: NotionEditorialOperation[] = [];
  for (let i = 0; i < desired.length; i++) {
    const block = remoteBlocks[i];
    const before = shape(block);
    const after = desired[i];
    if (before.type !== after.type) fail("UNSUPPORTED_BLOCK_REORDER_OR_TYPE");
    if (after.type === "table") {
      // Table row updates require separate child operations, and must not be
      // silently flattened or overwritten.
      const converted = {
        headers: object(after.rows).headers,
        rows: object(after.rows).rows,
      };
      const remoteRows = Array.isArray(before.rows) ? before.rows : [];
      const cells = remoteRows.map((row: unknown) => object(object(row)[text(object(row).type)]).cells);
      const normalized = {
        headers: cells.length ? (Array.isArray(cells[0]) ? cells[0].map((c: unknown) => text(object((c as unknown[])[0]).plain_text)) : []) : [],
        rows: cells.slice(1).map((r: unknown) => Array.isArray(r) ? r.map((c: unknown) => Array.isArray(c) ? c.map((n) => text(object(n).plain_text)).join("") : "") : []),
      };
      if (JSON.stringify(converted) !== JSON.stringify(normalized)) fail("UNSUPPORTED_TABLE_CHANGE");
      continue;
    }
    const left = JSON.stringify(before);
    const right = JSON.stringify(after);
    if (left !== right) {
      let payload: RecordValue;
      if (block.type === "image" || block.type === "embed") {
        payload = block.type === "embed"
          ? { embed: { url: after.url, caption: after.caption } }
          : { image: { type: "external", external: { url: after.url }, caption: after.caption } };
      } else {
        payload = { [block.type]: { rich_text: after.rich_text,
          ...(block.type === "callout" ? { icon: { type: "emoji", emoji: after.icon } } : {}) } };
      }
      operations.push({ id: block.id, type: block.type, before: left, after: right, payload });
    }
  }
  const properties: RecordValue = {};
  const propertyBefore: Record<string, string> = {};
  const propertyAfter: Record<string, string> = {};
  const fields: Array<[string, "title" | "rich_text" | "url", string]> = [
    ["Názov", "title", article.title],
    ["SEO title", "rich_text", article.seoTitle],
    ["Meta description", "rich_text", article.metaDescription],
    ["Hlavné kľúčové slovo", "rich_text", article.focusKeyword],
    ["Hlavný obrázok URL", "url", article.image ? (article.image.startsWith("/") ? args.siteUrl + article.image : article.image) : ""],
    ["Alt text obrázka", "rich_text", article.imageAlt ?? ""],
    ["Zdroj obrázka", "url", article.imageCreditUrl ?? ""],
  ];
  if ("OG title" in pageProperties) fields.push(["OG title", "rich_text", article.ogTitle ?? ""]);
  if ("OG description" in pageProperties) fields.push(["OG description", "rich_text", article.ogDescription ?? ""]);
  for (const [name, type, value] of fields) {
    if (!(name in pageProperties)) {
      if (value && name !== "Hlavný obrázok URL") fail("MISSING_NOTION_PROPERTY_" + name);
      continue;
    }
    if (type === "url" && value) requireRemoteHttps(value);
    const raw = object(pageProperties[name]);
    const before = notionEditorialPropertyText(raw, type);
    propertyBefore[name] = before;
    propertyAfter[name] = value;
    if (before !== value) properties[name] = type === "url" ? { url: value || null } : {
      [type]: notionText(value),
    };
  }
  return { properties, propertyBefore, propertyAfter, blocks: operations };
}
