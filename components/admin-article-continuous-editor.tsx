"use client";

/** One editable ProseMirror document for intro + ordered article content.
 * Non-prose widgets edit in place with the existing native block field controls.
 * The parent article form remains the sole save/publish/Notion entrypoint.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Extension, Node } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import { ArticleBlocks } from "@/components/article-blocks";
import { AdminArticleBlockEditor, RichTextInput } from "@/components/admin-article-block-editor";
import { articleTiptapExtensions, useArticleTiptapScope } from "@/components/admin-tiptap-article-editor";
import { articleBlockLabels, createArticleBlock, type ArticleBlock } from "@/lib/article-blocks";
import {
  articleBlocksToContinuousNodes, articleToCanonicalContinuousDocument,
  type ContinuousArticleInput,
} from "@/lib/article-continuous-document";
import { continuousDocumentToArticleFields, type ContinuousArticleFields } from "@/lib/article-continuous-roundtrip";
import { editorialRichTextPlainText, type EditorialRichTextDocument } from "@/lib/editorial-content";
import styles from "./admin-article-continuous-readonly.module.css";

type Props = ContinuousArticleInput & {
  currentArticleId?: number;
  onChange: (fields: ContinuousArticleFields) => void;
  onUploadingChange: (pending: boolean) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

type WidgetActions = Pick<Props, "onUploadingChange" | "onMessage" | "onError"> & {
  currentArticleId?: number;
  onRemoveNative: (id: string, originalIndex: number) => void;
};
const WidgetContext = createContext<WidgetActions | null>(null);

const ArticleOrigin = Extension.create({
  name: "psipediaArticleOrigin",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "psipediaCallout"],
      attributes: {
        sourceField: { default: null, renderHTML: () => ({}) },
        sourceBlockId: { default: null, renderHTML: () => ({}) },
        sourceBlockIndex: { default: null, renderHTML: () => ({}) },
        sourceNodeIndex: { default: null, renderHTML: () => ({}) },
        sourceNodeCount: { default: null, renderHTML: () => ({}) },
        sourceBlock: { default: null, renderHTML: () => ({}) },
      },
    }];
  },
});

function InlineWidget({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const actions = useContext(WidgetContext);
  const [editing, setEditing] = useState(false);
  const { kind, block, document, rawTakeaway, promoUtcDay } = node.attrs as {
    kind?: string;
    block?: ArticleBlock;
    document?: EditorialRichTextDocument;
    rawTakeaway?: string;
    promoUtcDay?: string;
  };

  if (kind === "boundary") {
    return <NodeViewWrapper as="div" className={styles.boundary} contentEditable={false}>
      <span>Obsah článku</span>
    </NodeViewWrapper>;
  }
  if (kind === "takeaway" && document) {
    return <NodeViewWrapper as="div" className={styles.widget} contentEditable={false}>
      <aside className={styles.takeaway} data-article-continuous-takeaway>
        <div className={styles.widgetHeading}>
          <strong>To najdôležitejšie</strong>
          <button type="button" onClick={() => setEditing(open => !open)}>
            {editing ? "Zavrieť úpravu" : "Upraviť zhrnutie"}
          </button>
        </div>
        {editing ? <RichTextInput id="article-continuous-takeaway" rows={4}
          value={rawTakeaway ?? ""} richText={document}
          onChange={(value, nextDocument) => updateAttributes({ rawTakeaway: value, document: nextDocument })}
        /> : <p>{editorialRichTextPlainText(document) || "Zhrnutie je nepovinné."}</p>}
      </aside>
    </NodeViewWrapper>;
  }
  if (kind === "block" && block) {
    return <NodeViewWrapper as="div" className={styles.widget} contentEditable={false} data-article-continuous-widget={block.type}>
      <div className={styles.widgetHeading}>
        <strong>{articleBlockLabels[block.type] ?? block.type}</strong>
        <div className={styles.widgetActions}>
          <button type="button" aria-expanded={editing} onClick={() => setEditing(open => !open)}>
            {editing ? "Zavrieť úpravu" : "Upraviť"}
          </button>
          <button type="button" className={styles.removeWidget} onClick={() => {
            if (!window.confirm("Odstrániť tento vložený prvok z článku?")) return;
            actions?.onRemoveNative(block.id, Number(node.attrs.sourceBlockIndex));
            deleteNode();
          }}>Odstrániť</button>
        </div>
      </div>
      {editing && actions ? (
        <AdminArticleBlockEditor
          inlineWidgetMode blocks={[block]}
          currentArticleId={actions.currentArticleId}
          promoUtcDay={promoUtcDay}
          onUploadingChange={actions.onUploadingChange}
          onMessage={actions.onMessage}
          onError={actions.onError}
          onChange={next => {
            if (next.length !== 1 || next[0].id !== block.id || next[0].type !== block.type) {
              actions.onError("Blok sa nepodarilo bezpečne upraviť. Pôvodný obsah zostal zachovaný.");
              return;
            }
            updateAttributes({ block: next[0] });
          }}
        />
      ) : <ArticleBlocks blocks={[block]} preview promoUtcDay={promoUtcDay} />}
    </NodeViewWrapper>;
  }
  return <NodeViewWrapper as="div" className={styles.error} contentEditable={false}>
    <p role="alert">Nepodporovaný vložený prvok. Uloženie je zablokované.</p>
  </NodeViewWrapper>;
}

const ArticleWidget = Node.create({
  name: "psipediaArticleWidget",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      kind: { default: null },
      sourceField: { default: null, renderHTML: () => ({}) },
      sourceBlockId: { default: null, renderHTML: () => ({}) },
      sourceBlockIndex: { default: null, renderHTML: () => ({}) },
      sourceNodeIndex: { default: null, renderHTML: () => ({}) },
      sourceNodeCount: { default: null, renderHTML: () => ({}) },
      sourceBlock: { default: null, renderHTML: () => ({}) },
      rawTakeaway: { default: null, renderHTML: () => ({}) },
      block: { default: null, renderHTML: () => ({}) },
      document: { default: null, renderHTML: () => ({}) },
      promoUtcDay: { default: null, renderHTML: () => ({}) },
    };
  },
  parseHTML() { return [{ tag: "div[data-psipedia-article-widget]" }]; },
  renderHTML({ node }) {
    return ["div", { "data-psipedia-article-widget": String(node.attrs.kind ?? "block") }];
  },
  addNodeView() { return ReactNodeViewRenderer(InlineWidget); },
});

const editableExtensions = [...articleTiptapExtensions, ArticleOrigin, ArticleWidget];
export function AdminArticleContinuousEditor(props: Props) {
  const [invalid, setInvalid] = useState("");
  const scope = useArticleTiptapScope();
  const scopeRef = useRef(scope);
  const callbackRef = useRef(props.onChange);
  const requiredNativeKeys = useRef(new Set(props.blocks
    .flatMap((block, index) => block.type === "text" || block.type === "h2" || block.type === "h3"
      ? [] : [index + ":" + block.id])));

  useEffect(() => { scopeRef.current = scope; callbackRef.current = props.onChange; }, [scope, props.onChange]);
  // A damaged/unsupported article must never blank the Admin or discard any existing data.
  // Keep this document read-only and expose the exact conversion error until resolved.
  const [prepared] = useState(() => {
    try {
      return { document: articleToCanonicalContinuousDocument(props), initialError: "" };
    } catch (error) {
      return {
        document: { type: "doc", content: [{ type: "paragraph" }] },
        initialError: error instanceof Error ? error.message : "Článok sa nepodarilo previesť.",
      };
    }
  });
  const editor = useEditor({
    extensions: editableExtensions,
    content: prepared.document,
    editable: !prepared.initialError,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id: "article-continuous-editor-input",
        role: "textbox", "aria-multiline": "true",
        "aria-label": "Súvislý editor článku",
        "data-article-continuous-document": "editable",
      },
      handlePaste(view, event) {
        const plain = event.clipboardData?.getData("text/plain");
        if (plain === undefined) return false;
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(plain.replace(/\r\n?/g, "\n"), from, to));
        return true;
      },
    },
    onFocus({ editor: focused }) {
      scopeRef.current?.setActive({
        id: "article-continuous", editor: focused,
        allowHeadings: true, allowCallouts: true, allowQuotes: true,
      });
    },
    onUpdate({ editor: updated }) {
      if (prepared.initialError) return;
      try {
        const fields = continuousDocumentToArticleFields(updated.getJSON(), {
          requiredNativeBlockKeys: [...requiredNativeKeys.current],
          originalIntro: {
            intro: props.intro ?? editorialRichTextPlainText(props.introRichText),
            introRichText: props.introRichText,
          },
        });
        setInvalid("");
        callbackRef.current(fields);
      } catch (error) {
        setInvalid(error instanceof Error ? error.message : "Obsah sa nepodarilo bezpečne previesť.");
      }
    },
  }, []);

  useEffect(() => () => {
    if (scopeRef.current?.active?.id === "article-continuous") scopeRef.current.setActive(null);
  }, []);

  const insert = (type: ArticleBlock["type"]) => {
    if (!editor) return;
    const block = createArticleBlock(type);
    const nodes = articleBlocksToContinuousNodes([block], { promoUtcDay: props.promoUtcDay });
    let boundaryEnd = 0;
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === "psipediaArticleWidget" && node.attrs.kind === "takeaway") {
        boundaryEnd = offset + node.nodeSize;
      }
    });
    const from = editor.state.selection.from;
    const insertAt = Math.max(from, boundaryEnd);
    editor.chain().focus().insertContentAt(insertAt, nodes).run();
    // Only pre-existing native blocks need removal confirmation on removal.
  };

  // The sticky formatting toolbar owns the insert menu. Keep this callback live
  // without re-registering on every paragraph edit or cursor movement.
  const insertRef = useRef(insert);
  useEffect(() => { insertRef.current = insert; });
  const registerInsertWidget = scope?.registerInsertWidget;
  useEffect(() => {
    if (!editor || prepared.initialError || !registerInsertWidget) return;
    registerInsertWidget(type => insertRef.current(type));
    return () => registerInsertWidget(null);
  }, [editor, prepared.initialError, registerInsertWidget]);

  const widgetActions = useMemo<WidgetActions>(() => ({
    currentArticleId: props.currentArticleId,
    onUploadingChange: props.onUploadingChange,
    onMessage: props.onMessage,
    onError: props.onError,
    onRemoveNative: (id, index) => { requiredNativeKeys.current.delete(index + ":" + id); },
  }), [props.currentArticleId, props.onUploadingChange, props.onMessage, props.onError]);

  return <WidgetContext.Provider value={widgetActions}>
    <div className={styles.editableWorkspace} data-article-continuous-editable
      data-article-continuous-initial-error={prepared.initialError ? "true" : "false"}
      data-article-tiptap-invalid={invalid || prepared.initialError ? "true" : "false"}>
      {prepared.initialError ? <p role="alert" className={styles.error}>
        Súvislý editor nie je pre tento článok dostupný: {prepared.initialError}
        Pôvodný obsah zostal bez zmeny. Uloženie je zablokované, kým sa nepodporovaný blok neopraví.
      </p> : <>
      <div className={styles.paper}>
        <EditorContent editor={editor} className={styles.prose + " " + styles.editableProse} />
        {!editor && <p role="status">Pripravujem editor článku…</p>}
      </div>
      {invalid && <p role="alert" className={styles.error}>
        Uloženie je zastavené: {invalid} Obsah zostáva otvorený v editore.
      </p>}
      </>}
    </div>
  </WidgetContext.Provider>;
}
