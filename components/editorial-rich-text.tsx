import { Fragment, type ReactNode } from "react";
import {
  normalizeEditorialRichText,
  sanitizeEditorialHref,
  type EditorialRichTextDocument,
  type EditorialRichTextInline,
} from "@/lib/editorial-content";

function renderInlineNode(node: EditorialRichTextInline, key: string): ReactNode {
  if (node.type === "hardBreak") return <br key={key} />;

  let content: ReactNode = node.text;
  for (const [index, mark] of (node.marks ?? []).entries()) {
    if (mark.type === "bold") content = <strong key={`${key}-bold-${index}`}>{content}</strong>;
    if (mark.type === "italic") content = <em key={`${key}-italic-${index}`}>{content}</em>;
    if (mark.type === "link") {
      const href = sanitizeEditorialHref(mark.href, true);
      content = href
        ? <a key={`${key}-link-${index}`} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel={href.startsWith("/") ? undefined : "noreferrer"}>{content}</a>
        : <Fragment key={`${key}-link-${index}`}>{content}</Fragment>;
    }
  }
  return <Fragment key={key}>{content}</Fragment>;
}

function renderInline(nodes: EditorialRichTextInline[], keyPrefix: string) {
  return nodes.map((node, index) => renderInlineNode(node, `${keyPrefix}-${index}`));
}

export function EditorialRichText({
  document,
  className,
  keyPrefix = "editorial-rich-text",
}: {
  document: EditorialRichTextDocument | null | undefined;
  className?: string;
  keyPrefix?: string;
}) {
  const normalized = normalizeEditorialRichText(document);
  if (!normalized || normalized.content.length === 0) return null;

  return (
    <div className={className}>
      {normalized.content.map((block, index) => {
        const key = `${keyPrefix}-${index}`;
        if (block.type === "paragraph") return <p key={key}>{renderInline(block.content, key)}</p>;
        if (block.type === "heading") {
          return block.level === 3
            ? <h3 key={key}>{renderInline(block.content, key)}</h3>
            : <h2 key={key}>{renderInline(block.content, key)}</h2>;
        }
        if (block.type === "bulletList" || block.type === "orderedList") {
          const items = block.items.map((item, itemIndex) => <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>);
          return block.type === "bulletList" ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
        }
        if (block.type === "blockquote") return <blockquote key={key}>{renderInline(block.content, key)}</blockquote>;
        return <aside className={`editorial-rich-callout editorial-rich-callout--${block.tone}`} key={key}>{renderInline(block.content, key)}</aside>;
      })}
    </div>
  );
}
