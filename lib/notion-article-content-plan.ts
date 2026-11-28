/**
 * Conservative article editor -> Notion adapter. It NEVER silently truncates,
 * drops, or reinterprets a block; incompatible structural edits fail closed.
 * Notion cannot atomically replace a page's ordered child-block collection.
 */
import { ARTICLE_NOTION_SEO_PROPERTIES as SEO, type ArticleNotionSeoKey } from "./notion-article-seo-properties";
import type { ArticleBlock } from "@/lib/article-blocks";
import type { EditorialRichTextDocument, EditorialRichTextInline } from "@/lib/editorial-content";

type RecordValue = Record<string, unknown>;
export type RemoteArticleBlock = { id: string; type: string; [key: string]: unknown };
export type EditorialArticle = {
  id: number; status: string; title: string; slug: string; intro: string;
  introRichText?: EditorialRichTextDocument | null; blocks: ArticleBlock[];
  seoTitle: string; metaDescription: string; focusKeyword: string;
  socialCaption?: string;
  ogTitle?: string; ogDescription?: string; image?: string | null;
  imageAlt?: string | null; imageCredit?: string | null; imageCreditUrl?: string | null;
};
export type NotionEditorialOperation = {
  id: string;
  type: string;
  before: string;
  after: string;
  payload: RecordValue;
};
export type EditorialStructure = {
  prefix: {id:string;fingerprint:string}[];
  remove: {id:string;fingerprint:string}[];
  suffix: {id:string;fingerprint:string}[];
  insert: {shape:string;payload:RecordValue}[];
  appendStarted?:boolean;
  insertedIds?:string[];
};
export type NotionEditorialPlan = {
  structure?:EditorialStructure;
  // Immutable page and selected-block baseline. Missing or malformed recovery
  // evidence is a conflict, never permission to force a historic journal.
  pageGuard: string;
  scope?:{properties:string[];body:boolean};
  untouchedProperties?:string;
  untouchedBlocks?:string;
  fullBlockOrder: string[];
  blockSnapshots: Array<{ id: string; type: string; before: string }>;
  properties: RecordValue;
  propertyBefore: Record<string, string>;
  propertyAfter: Record<string, string>;
  blocks: NotionEditorialOperation[];
};
export class EditorialSyncConflict extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "EditorialSyncConflict"; this.code = code; }
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
      // Notion's fixed color vocabulary cannot represent arbitrary hex codes
      // or our underline/highlight combinations losslessly. Fail closed.
      if (mark.type === "color" || mark.type === "highlight" || mark.type === "underline") {
        fail("UNSUPPORTED_NOTION_EDITORIAL_STYLE");
      }
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
  const nodes = (doc.content[0] as { content?: EditorialRichTextInline[] }).content;
  if (!nodes) fail("UNSUPPORTED_RICH_TEXT_STRUCTURE");
  return richNodes(nodes);
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
    } else fail("UNSUPPORTED_ADMIN_BLOCK_" + block.type.toUpperCase().replaceAll("-","_"));
  }
  return all;
}
/** Structural fingerprints include the entire block payload and child rows,
 * excluding volatile top-level provider metadata. */
function structuralFingerprint(block:RemoteArticleBlock):string{
  return JSON.stringify([block.type,block.has_children===true,block[block.type],Array.isArray(block.children)?(block.children as RemoteArticleBlock[]).map(structuralFingerprint):null]);
}
function structuralSnapshot(block:RemoteArticleBlock){return {id:block.id,fingerprint:structuralFingerprint(block)};}
function structuralShape(block:RemoteArticleBlock):string{
  if(block.type!=="table")return notionEditorialBlockShape(block);
  const body=object(block.table),rows=Array.isArray(block.children)?block.children as RemoteArticleBlock[]:[];
  if(!rows.length||body.has_column_header!==true||body.has_row_header===true)fail("UNSUPPORTED_TABLE_STRUCTURE");
  const cells=rows.map(row=>{
    const values=object(row.table_row).cells;
    if(row.type!=="table_row"||!Array.isArray(values)||values.length!==body.table_width)fail("UNSUPPORTED_TABLE_STRUCTURE");
    return values.map(cell=>{
      const rich=remoteRichText(cell);
      if(rich.some(node=>object(node.annotations).bold||object(node.annotations).italic||object(object(node.text).link).url))fail("UNSUPPORTED_TABLE_MARK");
      return rich.map(node=>text(object(node.text).content)).join("");
    });
  });
  return JSON.stringify({type:"table",rows:{headers:cells[0],rows:cells.slice(1)}});
}
function structuralPayload(target:RecordValue):RecordValue{
  const type=String(target.type);
  let value:RecordValue;
  if(type==="table"){
    const rows=object(target.rows),headers=rows.headers,body=rows.rows;
    if(!Array.isArray(headers)||!headers.length||!Array.isArray(body)||body.length+1>100||body.some(row=>!Array.isArray(row)||row.length!==headers.length))fail("UNSUPPORTED_TABLE_STRUCTURE");
    value={table_width:headers.length,has_column_header:true,has_row_header:false,children:[headers,...body].map(row=>({object:"block",type:"table_row",table_row:{cells:(row as unknown[]).map(cell=>notionText(String(cell)))}}))};
  }else if(type==="image")value={type:"external",external:{url:target.url},caption:target.caption};
  else if(type==="embed")value={url:target.url,caption:target.caption};
  else value={rich_text:target.rich_text,...(type==="callout"?{icon:{type:"emoji",emoji:target.icon}}:{})};
  return {object:"block",type,[type]:value};
}
/** Replace only the changed contiguous middle, leaving private notes and
 * unchanged blocks with their original identities. */
export function buildEditorialStructure(article:EditorialArticle,selected:RemoteArticleBlock[],full:RemoteArticleBlock[],siteUrl:string):EditorialStructure|undefined{
  const desired=targetBlocks(article,siteUrl),old=selected.map(structuralShape),next=desired.map(value=>JSON.stringify(value));
  let start=0;while(start<old.length&&start<next.length&&old[start]===next[start])start++;
  if(start===old.length&&start===next.length)return undefined;
  let tail=0;while(tail<old.length-start&&tail<next.length-start&&old[old.length-1-tail]===next[next.length-1-tail])tail++;
  const offset=full.findIndex(block=>block.id===selected[0]?.id);
  if(offset<0||!selected.length||selected.some((block,i)=>full[offset+i]?.id!==block.id))fail("NOTION_EDITORIAL_BODY_NOT_CONTIGUOUS");
  const remove=selected.slice(start,selected.length-tail),insert=desired.slice(start,desired.length-tail).map(value=>({shape:JSON.stringify(value),payload:structuralPayload(value)}));
  const prefix=full.slice(0,offset+start).map(structuralSnapshot),suffix=full.slice(offset+selected.length-tail).map(structuralSnapshot);
  if(insert.length>100||(!remove.length&&!prefix.length&&insert.length))fail("NOTION_EDITORIAL_STRUCTURE_LIMIT");
  return {prefix,remove:remove.map(structuralSnapshot),suffix,insert};
}
/** Only a known original suffix or a verified insertion may survive a retry.
 * No guessed IDs, unrelated block changes, reorder or duplicate IDs. */
export function observeEditorialStructure(plan:EditorialStructure,blocks:RemoteArticleBlock[]){
  const ids=blocks.map(block=>block.id);
  if(new Set(ids).size!==ids.length)fail("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
  const inserted=plan.insertedIds??[];
  if(inserted.length&&inserted.length!==plan.insert.length)fail("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
  const same=(actual:RemoteArticleBlock|undefined,wanted:{id:string;fingerprint:string})=>actual?.id===wanted.id&&structuralFingerprint(actual)===wanted.fingerprint;
  if(!plan.prefix.every((x,i)=>same(blocks[i],x))||!plan.suffix.every((x,i)=>same(blocks[blocks.length-plan.suffix.length+i],x)))fail("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
  const middle=blocks.slice(plan.prefix.length,blocks.length-plan.suffix.length);
  const remaining=middle.filter(block=>plan.remove.some(x=>x.id===block.id));
  const expected=plan.remove.slice(plan.remove.length-remaining.length);
  if(!expected.every((x,i)=>same(remaining[i],x))||!remaining.every((b,i)=>middle[i]?.id===b.id))fail("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
  const fresh=middle.slice(remaining.length);
  if(!inserted.length){
    if(fresh.length||remaining.length!==plan.remove.length&&plan.insert.length)fail("NOTION_EDITORIAL_APPEND_UNCERTAIN");
  }else if(fresh.length!==inserted.length||fresh.some((b,i)=>b.id!==inserted[i]||structuralShape(b)!==plan.insert[i].shape))fail("NOTION_EDITORIAL_STRUCTURE_CONFLICT");
  return {remaining:remaining.map(b=>b.id),complete:remaining.length===0&&inserted.length===plan.insert.length};
}
export function editorialInsertionIds(plan:EditorialStructure,result:RemoteArticleBlock[]){
  if(!Array.isArray(result)||result.length!==plan.insert.length)fail("NOTION_EDITORIAL_APPEND_UNCERTAIN");
  const ids=result.map(x=>x.id);
  const original=new Set([...plan.prefix,...plan.remove,...plan.suffix].map(x=>x.id));
  if(ids.some(id=>typeof id!=="string"||!id||original.has(id))||new Set(ids).size!==ids.length)fail("NOTION_EDITORIAL_APPEND_UNCERTAIN");
  return ids;
}
export function notionEditorialPropertyText(rawValue: unknown, type: "title" | "rich_text" | "url") {
  const raw = object(rawValue);
  // A Notion schema change must never be misread as an empty editor field.
  // Validate the returned property shape on both initial planning and retries.
  if (raw.has_more===true||(Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25))fail("NOTION_ARTICLE_PROPERTY_INCOMPLETE");
  if (typeof raw.type === "string" && raw.type !== type) {
    fail("NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT");
  }
  if (type === "url") {
    if (raw.url !== null && typeof raw.url !== "string") {
      fail("NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT");
    }
    return text(raw.url);
  }
  if (!Array.isArray(raw[type])) fail("NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT");
  return raw[type].map((record: unknown) => {
    const node=object(record),content=object(node.text).content;
    if(node.type!==undefined&&node.type!=="text"||typeof node.plain_text!=="string"&&typeof content!=="string")fail("NOTION_ARTICLE_PROPERTY_INCOMPLETE");
    return typeof node.plain_text==="string"?node.plain_text:String(content);
  }).join("");
}
export function buildNotionEditorialPlan(args: {
  article: EditorialArticle;
  remoteBlocks: RemoteArticleBlock[];
  pageProperties: Record<string, unknown>;
  siteUrl: string;
  perex?: string;
  /** The article SEO field-delta writer owns these properties on normal saves. */
  seoFields?: readonly ArticleNotionSeoKey[];
  allowNonDraft?:boolean;
  scope?:{properties:string[];body:boolean};
}): NotionEditorialPlan {
  const { article, remoteBlocks, pageProperties } = args;
  if (article.status !== "draft" && !(args.allowNonDraft&&(article.status==="published"||article.status==="scheduled"))) fail("NOT_A_DRAFT");
  const desired = args.scope?.body===false?[]:targetBlocks(article, args.siteUrl);
  if (args.scope?.body!==false&&desired.length !== remoteBlocks.length) fail("UNSUPPORTED_BLOCK_INSERT_DELETE");
  const operations: NotionEditorialOperation[] = [];
  const blockSnapshots: NotionEditorialPlan["blockSnapshots"] = [];
  for (let i = 0; i < desired.length; i++) {
    const block = remoteBlocks[i];
    const before = shape(block);
    blockSnapshots.push({ id: block.id, type: block.type, before: JSON.stringify(before) });
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
    ["Hlavný obrázok URL", "url", article.image ? (article.image.startsWith("/") ? args.siteUrl + article.image : article.image) : ""],
    ["Alt text obrázka", "rich_text", article.imageAlt ?? ""],
    ["Zdroj obrázka", "url", article.imageCreditUrl ?? ""],
  ];
  if (args.perex !== undefined) fields.push(["Perex", "rich_text", args.perex]);
  const permitSeo = (key: ArticleNotionSeoKey) =>
    args.seoFields === undefined || args.seoFields.includes(key);
  if (permitSeo("seoTitle")) fields.push([SEO.seoTitle.name, SEO.seoTitle.type, article.seoTitle]);
  if (permitSeo("metaDescription")) fields.push([SEO.metaDescription.name, SEO.metaDescription.type, article.metaDescription]);
  if (permitSeo("focusKeyword")) fields.push([SEO.focusKeyword.name, SEO.focusKeyword.type, article.focusKeyword]);
  if ("Popis na sociálne siete" in pageProperties) fields.push(["Popis na sociálne siete", "rich_text", article.socialCaption ?? ""]);
  if ("Kredit fotografie" in pageProperties) fields.push(["Kredit fotografie", "rich_text", article.imageCredit ?? ""]);
  if (permitSeo("ogTitle") && SEO.ogTitle.name in pageProperties)
    fields.push([SEO.ogTitle.name, SEO.ogTitle.type, article.ogTitle ?? ""]);
  if (permitSeo("ogDescription") && SEO.ogDescription.name in pageProperties)
    fields.push([SEO.ogDescription.name, SEO.ogDescription.type, article.ogDescription ?? ""]);
  for (const [name, type, value] of fields) {
    if(args.scope&&!args.scope.properties.includes(name))continue;
    if (!(name in pageProperties)) {
      if(args.scope)fail("NOTION_ARTICLE_PROPERTY_MISSING");
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
  if(args.scope&&args.scope.properties.some(name=>!Object.hasOwn(propertyAfter,name)))fail("NOTION_ARTICLE_PROPERTY_MISSING");
  // The caller binds pageGuard/fullBlockOrder after it has read the entire
  // page. The planner itself has only the selected editorial child blocks.
  return { pageGuard: "", fullBlockOrder: [], blockSnapshots,
    properties, propertyBefore, propertyAfter, blocks: operations };
}
