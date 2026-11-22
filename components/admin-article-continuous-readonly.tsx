"use client";

import { useEffect, useMemo } from "react";
import { Extension, Node } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import { ArticleBlocks } from "@/components/article-blocks";
import { EditorialRichText } from "@/components/editorial-rich-text";
import { articleTiptapExtensions } from "@/components/admin-tiptap-article-editor";
import { articleToContinuousReadOnlyDocument, type ContinuousReadOnlyInput } from "@/lib/article-continuous-readonly";
import type { ArticleBlock } from "@/lib/article-blocks";
import type { TiptapEditorialDocument } from "@/lib/tiptap-editorial-bridge";
import type { EditorialRichTextDocument } from "@/lib/editorial-content";
import styles from "./admin-article-continuous-readonly.module.css";

/** Id and original block are editor-memory metadata, never HTML or SQL output. */
const ArticleOrigin = Extension.create({
  name: "psipediaArticleOrigin",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "psipediaCallout"],
      attributes: {
        sourceField: { default: null, renderHTML: () => ({}) },
        sourceBlockId: { default: null, renderHTML: () => ({}) },
        sourceBlock: { default: null, renderHTML: () => ({}) },
      },
    }];
  },
});

function ReadOnlyWidget({ node }: NodeViewProps) {
  const { kind, block, blocks, document, sourceHeading, promoUtcDay } = node.attrs as {
    kind?: string;
    block?: ArticleBlock;
    blocks?: ArticleBlock[];
    document?: EditorialRichTextDocument;
    sourceHeading?: string;
    promoUtcDay?: string;
  };
  return (
    <NodeViewWrapper as="div" className={styles.widget} contentEditable={false}>
      {kind === "block" && block ? (
        <ArticleBlocks blocks={[block]} preview promoUtcDay={promoUtcDay} />
      ) : kind === "sources" && blocks ? (
        <ArticleBlocks blocks={blocks} preview sourceHeading={sourceHeading} />
      ) : kind === "takeaway" && document ? (
        <aside className={styles.takeaway}>
          <strong>To najdôležitejšie</strong>
          <EditorialRichText document={document} />
        </aside>
      ) : (
        <p role="alert" className={styles.error}>Nepodporovaný obsah náhľadu. Pôvodný editor zostáva dostupný.</p>
      )}
    </NodeViewWrapper>
  );
}

const ArticleWidget = Node.create({
  name: "psipediaArticleWidget",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      kind: { default: null },
      block: { default: null },
      blocks: { default: null },
      document: { default: null },
      sourceHeading: { default: null },
      promoUtcDay: { default: null },
    };
  },
  parseHTML() { return [{ tag: "div[data-psipedia-article-widget]" }]; },
  renderHTML({ node }) {
    return ["div", { "data-psipedia-article-widget": String(node.attrs.kind ?? "block") }];
  },
  addNodeView() { return ReactNodeViewRenderer(ReadOnlyWidget); },
});

const readOnlyExtensions = [...articleTiptapExtensions, ArticleOrigin, ArticleWidget];

function ReadOnlyTiptapDocument({ document }: { document: TiptapEditorialDocument }) {
  const signature = JSON.stringify(document);
  const editor = useEditor({
    extensions: readOnlyExtensions,
    content: document,
    editable: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: {
      "aria-label": "Súvislý náhľad článku, iba na čítanie",
      "data-article-continuous-document": "read-only",
    } },
  }, []);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(document, { emitUpdate: false });
  }, [editor, signature, document]);

  return (
    <div className={styles.paper} data-article-continuous-readonly>
      <EditorContent editor={editor} className={styles.prose} />
      {!editor && <p role="status">Pripravujem súvislý náhľad…</p>}
    </div>
  );
}

/** The preview receives only already-loaded form state; no fetch, mutation or save handlers. */
export function AdminArticleContinuousReadOnly(props: ContinuousReadOnlyInput) {
  const result = useMemo(() => {
    try {
      return { document: articleToContinuousReadOnlyDocument(props), error: "" };
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error.message : "Článok sa nepodarilo zobraziť.",
      };
    }
  }, [props.introRichText, props.takeawayRichText, props.takeaway, props.blocks, props.promoUtcDay]);

  if (!result.document) {
    return <div role="alert" className={styles.error} data-article-continuous-error>
      Súvislý náhľad nie je dostupný: {result.error} Pôvodný obsah sa nezmenil.
    </div>;
  }
  return <ReadOnlyTiptapDocument document={result.document} />;
}
