import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { EditorialRichText } from "@/components/editorial-rich-text";
import { articleBlockHeadings, type ArticleBlock } from "@/lib/article-blocks";
import { legacyRichTextToDocument } from "@/lib/editorial-content";
import { normalizeEditorialExternalVideo } from "@/lib/editorial-video";

function safeHref(value: string, allowInternal = false) {
  if (allowInternal && value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : "";
  } catch {
    return "";
  }
}

function richText(value: string, keyPrefix = "inline"): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\))/g;
  return value.split(pattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2], true);
      if (!href) return <Fragment key={key}>{link[1]}</Fragment>;
      return href.startsWith("/")
        ? <Link key={key} href={href}>{link[1]}</Link>
        : <a key={key} href={href} target="_blank" rel="noreferrer">{link[1]}<span className="sr-only"> (otvorí sa v novom okne)</span></a>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function richTextWithBreaks(value: string, keyPrefix: string): ReactNode[] {
  return value.split("\n").flatMap((line, index) => [
    ...(index ? [<br key={`${keyPrefix}-break-${index}`} />] : []),
    ...richText(line, `${keyPrefix}-line-${index}`),
  ]);
}

function renderRichTextBlocks(value: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let sequence = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = `${keyPrefix}-paragraph-${sequence++}`;
    result.push(<p key={key}>{richTextWithBreaks(paragraph.join("\n"), key)}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const key = `${keyPrefix}-${listType}-${sequence++}`;
    const items = listItems.map((item, index) => <li key={`${key}-${index}`}>{richText(item, `${key}-item-${index}`)}</li>);
    result.push(listType === "ul" ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>);
    listType = null;
    listItems = [];
  };

  value.replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const nextListType = bullet ? "ul" : numbered ? "ol" : null;
    if (nextListType) {
      flushParagraph();
      if (listType && listType !== nextListType) flushList();
      listType = nextListType;
      listItems.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      return;
    }

    flushList();
    paragraph.push(line.trim());
  });

  flushParagraph();
  flushList();
  return result;
}

export function ArticleRichText({ value, className }: { value: string; className?: string }) {
  return <EditorialRichText className={className} document={legacyRichTextToDocument(value)} />;
}

export function ArticleBlocks({ blocks, preview = false }: { blocks: ArticleBlock[]; preview?: boolean }) {
  const headingIds = new Map(articleBlockHeadings(blocks).map((heading) => [heading.blockId, heading.id]));
  const sources = blocks.filter((block): block is Extract<ArticleBlock, { type: "source" }> => block.type === "source" && Boolean(block.label && safeHref(block.url)));
  const firstSourceId = sources[0]?.id;
  return (
    <div className={preview ? "article-blocks article-blocks--preview" : "article-blocks"}>
      {blocks.map((block) => {
        if (block.type === "text") return block.content ? <EditorialRichText className={`article-block-text article-block-text--${block.alignment ?? "left"}`} document={block.richText ?? legacyRichTextToDocument(block.content)} key={block.id} keyPrefix={block.id} /> : null;
        if (block.type === "h2") return block.text ? <h2 id={headingIds.get(block.id)} key={block.id}>{block.text}</h2> : null;
        if (block.type === "h3") return block.text ? <h3 id={headingIds.get(block.id)} key={block.id}>{block.text}</h3> : null;
        if (block.type === "image") return block.url ? (
          <figure className={`article-block-image article-block-image--${block.size ?? "normal"}`} key={block.id}>
            <img src={block.url} alt={block.alt} loading="lazy" decoding="async" />
            {(block.caption || block.credit) && <figcaption>{block.caption && <span className="article-block-caption">{block.caption}</span>}{block.credit && <span className="article-block-credit">Foto / zdroj: {block.credit}</span>}</figcaption>}
          </figure>
        ) : null;
        if (block.type === "gallery") return block.images.length ? (
          <div className="article-block-gallery" key={block.id}>
            {block.images.map((image, index) => (
              <figure className={`article-block-gallery-item article-block-gallery-item--${image.size ?? "normal"}`} key={`${image.url}-${index}`}>
                <img src={image.url} alt={image.alt} loading="lazy" decoding="async" />
                {(image.caption || image.credit) && <figcaption>{image.caption && <span className="article-block-caption">{image.caption}</span>}{image.credit && <span className="article-block-credit">Foto / zdroj: {image.credit}</span>}</figcaption>}
              </figure>
            ))}
          </div>
        ) : null;
        if (block.type === "bullet-list") return block.items.length ? <ul key={block.id}>{block.items.map((item, index) => <li key={index}>{richText(item)}</li>)}</ul> : null;
        if (block.type === "numbered-list") return block.items.length ? <ol key={block.id}>{block.items.map((item, index) => <li key={index}>{richText(item)}</li>)}</ol> : null;
        if (block.type === "tip") return block.content ? <aside className="article-block-callout article-block-callout--tip" key={block.id}><strong>Tip z praxe</strong><EditorialRichText className="article-block-rich-content" document={block.richText ?? legacyRichTextToDocument(block.content)} keyPrefix={block.id} /></aside> : null;
        if (block.type === "warning") return block.content ? <aside className="article-block-callout article-block-callout--warning" key={block.id}><strong>Dôležité upozornenie</strong><EditorialRichText className="article-block-rich-content" document={block.richText ?? legacyRichTextToDocument(block.content)} keyPrefix={block.id} /></aside> : null;
        if (block.type === "quote") return block.content ? <blockquote className="article-block-quote" key={block.id}><EditorialRichText className="article-block-rich-content" document={block.richText ?? legacyRichTextToDocument(block.content)} keyPrefix={block.id} />{block.attribution && <cite>{block.attribution}</cite>}</blockquote> : null;
        if (block.type === "table") return block.headers.length ? (
          <div className="article-block-table-wrap" key={block.id} tabIndex={0}>
            <table><thead><tr>{block.headers.map((header, index) => <th key={index} scope="col">{richText(header)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{richText(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : null;
        if (block.type === "source") {
          if (block.id !== firstSourceId) return null;
          return <aside className="article-block-source article-block-sources" key={block.id}><strong>Odborné zdroje</strong><ul>{sources.map((source) => <li key={source.id}><a href={safeHref(source.url)} target="_blank" rel="noreferrer">{source.label} ↗</a>{source.accessedAt && <small>Prístup: <time dateTime={source.accessedAt}>{new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${source.accessedAt}T12:00:00Z`))}</time></small>}{source.note && <div className="article-block-rich-content">{renderRichTextBlocks(source.note, source.id)}</div>}</li>)}</ul></aside>;
        }
        if (block.type === "related") {
          const href = safeHref(block.href, true);
          return block.title && href ? <aside className="article-block-related" key={block.id}><span>Súvisiaci článok</span><Link href={href}><strong>{block.title}</strong>{block.description && <small>{block.description}</small>}</Link></aside> : null;
        }
        if (block.type === "cta") {
          const href = safeHref(block.url, true);
          if (!block.buttonText || !href) return null;
          const rel = block.sponsored ? `sponsored nofollow${block.newTab ? " noreferrer" : ""}` : block.newTab ? "noreferrer" : undefined;
          return <aside className={`article-block-cta ${block.sponsored ? "is-sponsored" : ""}`} key={block.id}>
            {(block.text || block.sponsored) && <div>{block.sponsored && <span className="article-block-cta-disclosure">Partnerský odkaz</span>}{block.text && <p>{richText(block.text, `${block.id}-cta`)}</p>}</div>}
            <Link className="article-block-cta-button" href={href} target={block.newTab ? "_blank" : undefined} rel={rel}>{block.buttonText}<span aria-hidden="true">→</span>{block.newTab && <span className="sr-only"> (otvorí sa v novom okne)</span>}</Link>
          </aside>;
        }
        if (block.type === "embed") {
          const video = normalizeEditorialExternalVideo({ url: block.url, title: block.title, caption: block.caption });
          if (video) return <figure className="article-block-embed" key={block.id}><iframe src={video.embedUrl} title={video.title || "Video v článku"} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />{video.caption && <figcaption>{video.caption}</figcaption>}</figure>;
          const href = safeHref(block.url);
          return href ? <p className="article-block-embed-link" key={block.id}><a href={href} target="_blank" rel="noreferrer">{block.title || "Otvoriť externé video"} ↗</a></p> : null;
        }
        return null;
      })}
    </div>
  );
}
