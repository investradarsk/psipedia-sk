"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot,
  $getSelection, $isLineBreakNode, $isParagraphNode, $isRangeSelection,
  $isTextNode, $applyNodeReplacement, ElementNode, FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND,
  PASTE_COMMAND, COMMAND_PRIORITY_HIGH,
  type EditorConfig, type EditorState, type LexicalEditor, type LexicalNode, type SerializedElementNode,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $createListItemNode, $createListNode, $isListItemNode, $isListNode,
  INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode,
} from "@lexical/list";
import { $createLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $setBlocksType } from "@lexical/selection";
import {
  EDITORIAL_RICH_TEXT_VERSION, normalizeEditorialRichText, sanitizeEditorialHref,
  type EditorialRichTextDocument, type EditorialRichTextInline, type EditorialRichTextMark,
} from "@/lib/editorial-content";
import styles from "./admin-lexical-rich-text-editor.module.css";

const empty: EditorialRichTextDocument = { version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content: [] };

type CalloutTone = "info" | "tip" | "warning";

/** The existing editorial callout is preserved in the Lexical model and AST. */
class EditorialCalloutNode extends ElementNode {
  __tone: CalloutTone;
  constructor(tone: CalloutTone = "tip", key?: string) {
    super(key);
    this.__tone = tone;
  }
  static getType(): string { return "editorial-callout"; }
  static clone(node: EditorialCalloutNode): EditorialCalloutNode {
    return new EditorialCalloutNode(node.__tone, node.__key);
  }
  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("div");
    element.dataset.editorialCallout = this.__tone;
    element.className = "admin-lexical-callout";
    return element;
  }
  updateDOM(prev: EditorialCalloutNode, element: HTMLElement): boolean {
    if (prev.__tone !== this.__tone) element.dataset.editorialCallout = this.__tone;
    return false;
  }
  exportJSON(): SerializedElementNode & { tone: CalloutTone } {
    return { ...super.exportJSON(), type: "editorial-callout", version: 1, tone: this.__tone };
  }
  static importJSON(data: SerializedElementNode & { tone?: CalloutTone }): EditorialCalloutNode {
    return new EditorialCalloutNode(data.tone === "info" || data.tone === "warning" ? data.tone : "tip");
  }
  getTone(): CalloutTone { return this.getLatest().__tone; }
}
function $createCalloutNode(tone: CalloutTone = "tip") {
  return $applyNodeReplacement(new EditorialCalloutNode(tone));
}
function $isCalloutNode(node: LexicalNode | null | undefined): node is EditorialCalloutNode {
  return node instanceof EditorialCalloutNode;
}


function appendInline(parent: ElementNode, inline: EditorialRichTextInline[]) {
  for (const node of inline) {
    if (node.type === "hardBreak") { parent.append($createLineBreakNode()); continue; }
    const text = $createTextNode(node.text);
    if (node.marks?.some((mark) => mark.type === "bold")) text.toggleFormat("bold");
    if (node.marks?.some((mark) => mark.type === "italic")) text.toggleFormat("italic");
    const link = node.marks?.find((mark) => mark.type === "link");
    const href = link?.type === "link" ? sanitizeEditorialHref(link.href) : "";
    if (href) parent.append($createLinkNode(href).append(text));
    else parent.append(text);
  }
}

function loadDocument(documentValue: EditorialRichTextDocument) {
  const root = $getRoot();
  root.clear();
  for (const block of documentValue.content) {
    if (block.type === "bulletList" || block.type === "orderedList") {
      const list = $createListNode(block.type === "bulletList" ? "bullet" : "number");
      for (const inline of block.items) { const item = $createListItemNode(); appendInline(item, inline); list.append(item); }
      root.append(list);
      continue;
    }
    const element = block.type === "heading" ? $createHeadingNode(block.level === 3 ? "h3" : "h2")
      : block.type === "blockquote" ? $createQuoteNode()
      : block.type === "callout" ? $createCalloutNode(block.tone) : $createParagraphNode();
    appendInline(element, block.content);
    root.append(element);
  }
  if (!root.getChildrenSize()) root.append($createParagraphNode());
}

function readInline(nodes: LexicalNode[], linkHref?: string): EditorialRichTextInline[] {
  const result: EditorialRichTextInline[] = [];
  for (const node of nodes) {
    if ($isLineBreakNode(node)) { result.push({ type: "hardBreak" }); continue; }
    if ($isLinkNode(node)) {
      result.push(...readInline(node.getChildren(), sanitizeEditorialHref(node.getURL())));
      continue;
    }
    if ($isTextNode(node) && node.getTextContent()) {
      const marks: EditorialRichTextMark[] = [];
      if (node.hasFormat("bold")) marks.push({ type: "bold" });
      if (node.hasFormat("italic")) marks.push({ type: "italic" });
      if (linkHref) marks.push({ type: "link", href: linkHref });
      result.push({ type: "text", text: node.getTextContent(), ...(marks.length ? { marks } : {}) });
    }
  }
  return result;
}

function readDocument(): EditorialRichTextDocument {
  const content: EditorialRichTextDocument["content"] = [];
  for (const node of $getRoot().getChildren()) {
    if ($isListNode(node)) {
      const items = node.getChildren().filter($isListItemNode).map((item) => readInline(item.getChildren())).filter((nodes) => nodes.length > 0);
      if (items.length) content.push({ type: node.getListType() === "number" ? "orderedList" : "bulletList", items });
    } else if ($isHeadingNode(node)) {
      const contentInline = readInline(node.getChildren());
      if (contentInline.length) content.push({ type: "heading", level: node.getTag() === "h3" ? 3 : 2, content: contentInline });
    } else if ($isQuoteNode(node)) {
      const contentInline = readInline(node.getChildren());
      if (contentInline.length) content.push({ type: "blockquote", content: contentInline });
    } else if ($isCalloutNode(node)) {
      const inline = readInline(node.getChildren());
      if (inline.length) content.push({ type: "callout", tone: node.getTone(), content: inline });
    } else if ($isParagraphNode(node)) {
      const contentInline = readInline(node.getChildren());
      if (contentInline.length) content.push({ type: "paragraph", content: contentInline });
    }
  }
  return normalizeEditorialRichText({ version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content }) ?? empty;
}

function RichTextBridge({ value, onChange }: { value: EditorialRichTextDocument; onChange: (next: EditorialRichTextDocument) => void }) {
  const [editor] = useLexicalComposerContext();
  const signature = JSON.stringify(value);
  const lastEmitted = useRef(signature);
  const latestSignature = useRef(signature);
  const changeCallback = useRef(onChange);

  useEffect(() => { latestSignature.current = signature; changeCallback.current = onChange; }, [signature, onChange]);
  useEffect(() => {
    if (lastEmitted.current === signature) return;
    editor.update(() => loadDocument(value), { tag: "external" });
    lastEmitted.current = signature;
  }, [editor, signature, value]);

  const handle = useCallback((state: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
    if (tags.has("external")) return;
    const next = state.read(readDocument);
    const encoded = JSON.stringify(next);
    if (encoded === latestSignature.current) return;
    lastEmitted.current = encoded;
    changeCallback.current(next);
  }, []);

  return <OnChangePlugin onChange={handle} ignoreSelectionChange />;
}

/** Paste only clipboard text. Browser HTML never enters the editorial AST. */
function SafePastePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.registerCommand(PASTE_COMMAND, (event) => {
    event.preventDefault();
    const clipboard = "clipboardData" in event ? event.clipboardData : null;
    const text = clipboard?.getData("text/plain")?.replace(/\r\n?/g, "\n") ?? "";
    if (!text) return true;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertRawText(text);
    });
    return true;
  }, COMMAND_PRIORITY_HIGH), [editor]);
  return null;
}

function Toolbar({ id, allowHeadings, allowCallouts }: { id: string; allowHeadings: boolean; allowCallouts: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [active, setActive] = useState({
    bold: false, italic: false, link: false, paragraph: false,
    h2: false, h3: false, quote: false, callout: false, bullet: false, ordered: false,
  });

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const selected = selection.anchor.getNode();
      let block: LexicalNode | null = selected;
      let linked = $isLinkNode(block);
      while (block && !$isParagraphNode(block) && !$isHeadingNode(block) &&
        !$isQuoteNode(block) && !$isCalloutNode(block) && !$isListNode(block)) {
        if ($isLinkNode(block)) linked = true;
        block = block.getParent();
      }
      if (block) {
        setActive({
          bold: selection.hasFormat("bold"), italic: selection.hasFormat("italic"), link: linked,
          paragraph: $isParagraphNode(block),
          h2: $isHeadingNode(block) && block.getTag() === "h2",
          h3: $isHeadingNode(block) && block.getTag() === "h3",
          quote: $isQuoteNode(block), callout: $isCalloutNode(block),
          bullet: $isListNode(block) && block.getListType() === "bullet",
          ordered: $isListNode(block) && block.getListType() === "number",
        });
      }
    });
  }), [editor]);

  function setBlock(kind: "p" | "h2" | "h3" | "quote" | "tip") {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () => kind === "p" ? $createParagraphNode()
        : kind === "quote" ? $createQuoteNode()
        : kind === "tip" ? $createCalloutNode("tip") : $createHeadingNode(kind));
    });
    editor.focus();
  }

  function openLink() {
    editor.focus();
    setShowLink(true);
    setLinkError("");
  }
  function applyLink() {
    const href = sanitizeEditorialHref(linkUrl, true);
    if (!href) { setLinkError("Použi bezpečný odkaz začínajúci https://, http:// alebo internou cestou /."); return; }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
    setShowLink(false);
    setLinkUrl("https://");
    setLinkError("");
    editor.focus();
  }
  function cancelLink() {
    setShowLink(false);
    setLinkError("");
    editor.focus();
  }

  const action = (label: string, run: () => void, ariaLabel: string, pressed = false) => (
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={run}
      aria-label={ariaLabel} title={ariaLabel} aria-pressed={pressed}>{label}</button>
  );

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formátovanie textu">
      {action("B", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"), "Tučné (Ctrl alebo Cmd + B)", active.bold)}
      {action("I", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"), "Kurzíva (Ctrl alebo Cmd + I)", active.italic)}
      {action("Odkaz", openLink, "Vložiť odkaz", active.link)}
      {action("P", () => setBlock("p"), "Odsek", active.paragraph)}
      {allowHeadings && action("H2", () => setBlock("h2"), "Nadpis úrovne 2", active.h2)}
      {allowHeadings && action("H3", () => setBlock("h3"), "Nadpis úrovne 3", active.h3)}
      {action("• Zoznam", () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined), "Odrážkový zoznam", active.bullet)}
      {action("1. Zoznam", () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined), "Číslovaný zoznam", active.ordered)}
      {action("Citácia", () => setBlock("quote"), "Citácia", active.quote)}
      {allowCallouts && action("Tip", () => setBlock("tip"), "Tip alebo zvýraznenie", active.callout)}
      {action("↶", () => editor.dispatchCommand(UNDO_COMMAND, undefined), "Späť")}
      {action("↷", () => editor.dispatchCommand(REDO_COMMAND, undefined), "Znova")}
      {showLink && (
        <div className={styles.link}>
          <label htmlFor={`${id}-link`}>Odkaz</label>
          <input id={`${id}-link`} value={linkUrl} placeholder="https://… alebo /interny-odkaz"
            onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); applyLink(); }
              if (event.key === "Escape") { event.preventDefault(); cancelLink(); }
            }} />
          <button type="button" onClick={applyLink}>Použiť</button>
          <button type="button" onClick={cancelLink}>Zrušiť</button>
          {linkError && <span role="alert">{linkError}</span>}
        </div>
      )}
    </div>
  );
}

export function AdminLexicalRichTextEditor({
  id, value, onChange, placeholder = "Začni písať…", ariaLabel = "Editor textu",
  allowHeadings = true, allowCallouts = true, minHeight = 180,
}: {
  id: string; value: EditorialRichTextDocument; onChange: (value: EditorialRichTextDocument) => void;
  placeholder?: string; ariaLabel?: string; allowHeadings?: boolean; allowCallouts?: boolean; minHeight?: number;
}) {
  const normalized = normalizeEditorialRichText(value) ?? empty;
  const initialConfig = {
    namespace: "PsipediaArticleLexical",
    theme: {},
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, EditorialCalloutNode],
    onError: (error: Error) => console.error("Lexical rich-text:", error),
    editorState: () => loadDocument(normalized),
  };
  return (
    <div className={styles.wrapper} data-admin-lexical-rich-text data-admin-rich-text-editor>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={styles.surface} style={{ minHeight }}>
          <Toolbar id={id} allowHeadings={allowHeadings} allowCallouts={allowCallouts} />
          <RichTextPlugin
            contentEditable={<ContentEditable id={id} data-editor-ready="true" className={styles.editor} aria-label={ariaLabel} />}
            placeholder={<span className={styles.placeholder}>{placeholder}</span>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ListPlugin />
          <LinkPlugin />
          <HistoryPlugin />
          <SafePastePlugin />
          <RichTextBridge value={normalized} onChange={onChange} />
          <p className={styles.help}>Píš priamo ako v textovom editore. Podporované sú nadpisy, zoznamy, citácie, odkazy aj zvýraznenia.</p>
        </div>
      </LexicalComposer>
    </div>
  );
}
