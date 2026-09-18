"use client";

import { useEffect, useRef, useState } from "react";
import {
  EDITORIAL_RICH_TEXT_VERSION,
  normalizeEditorialRichText,
  sanitizeEditorialHref,
  type EditorialRichTextDocument,
  type EditorialRichTextInline,
  type EditorialRichTextMark,
} from "@/lib/editorial-content";
import styles from "./admin-rich-text-editor.module.css";

const EMPTY_DOCUMENT: EditorialRichTextDocument = {
  version: EDITORIAL_RICH_TEXT_VERSION,
  type: "doc",
  content: [],
};

function normalizedDocument(value: EditorialRichTextDocument | null | undefined) {
  return normalizeEditorialRichText(value) ?? EMPTY_DOCUMENT;
}

function appendInline(parent: HTMLElement, nodes: EditorialRichTextInline[]) {
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      parent.appendChild(document.createElement("br"));
      continue;
    }

    let child: Node = document.createTextNode(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") {
        const strong = document.createElement("strong");
        strong.appendChild(child);
        child = strong;
      } else if (mark.type === "italic") {
        const emphasis = document.createElement("em");
        emphasis.appendChild(child);
        child = emphasis;
      } else if (mark.type === "link") {
        const href = sanitizeEditorialHref(mark.href, true);
        if (!href) continue;
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.appendChild(child);
        child = anchor;
      }
    }
    parent.appendChild(child);
  }
}

function renderDocument(root: HTMLElement, value: EditorialRichTextDocument) {
  const fragment = document.createDocumentFragment();
  for (const block of normalizedDocument(value).content) {
    if (block.type === "paragraph") {
      const element = document.createElement("p");
      appendInline(element, block.content);
      fragment.appendChild(element);
      continue;
    }
    if (block.type === "heading") {
      const element = document.createElement(block.level === 3 ? "h3" : "h2");
      appendInline(element, block.content);
      fragment.appendChild(element);
      continue;
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      const list = document.createElement(block.type === "bulletList" ? "ul" : "ol");
      for (const item of block.items) {
        const entry = document.createElement("li");
        appendInline(entry, item);
        list.appendChild(entry);
      }
      fragment.appendChild(list);
      continue;
    }
    if (block.type === "blockquote") {
      const quote = document.createElement("blockquote");
      appendInline(quote, block.content);
      fragment.appendChild(quote);
      continue;
    }
    const callout = document.createElement("div");
    callout.dataset.editorialCallout = block.tone;
    callout.className = styles.callout;
    appendInline(callout, block.content);
    fragment.appendChild(callout);
  }
  root.replaceChildren(fragment);
}

function sameMark(a: EditorialRichTextMark, b: EditorialRichTextMark) {
  return a.type === b.type && (a.type !== "link" || b.type !== "link" || a.href === b.href);
}

function addMark(marks: EditorialRichTextMark[], mark: EditorialRichTextMark) {
  return marks.some((item) => sameMark(item, mark)) ? marks : [...marks, mark];
}

function parseInline(nodes: NodeListOf<ChildNode> | ChildNode[], inherited: EditorialRichTextMark[] = []): EditorialRichTextInline[] {
  const result: EditorialRichTextInline[] = [];
  for (const node of Array.from(nodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) result.push({ type: "text", text: node.textContent, ...(inherited.length ? { marks: inherited } : {}) });
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed"].includes(tag)) continue;
    if (tag === "br") {
      result.push({ type: "hardBreak" });
      continue;
    }

    let marks = inherited;
    if (tag === "strong" || tag === "b") marks = addMark(marks, { type: "bold" });
    if (tag === "em" || tag === "i") marks = addMark(marks, { type: "italic" });
    if (tag === "a") {
      const href = sanitizeEditorialHref(node.getAttribute("href"), true);
      if (href) marks = addMark(marks, { type: "link", href });
    }
    result.push(...parseInline(node.childNodes, marks));
  }
  return result;
}

function parseEditor(root: HTMLElement): EditorialRichTextDocument {
  const content: EditorialRichTextDocument["content"] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim()) content.push({ type: "paragraph", content: [{ type: "text", text }] });
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "embed"].includes(tag)) continue;

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((child) => parseInline(child.childNodes))
        .filter((item) => item.length > 0);
      if (items.length) content.push({ type: tag === "ul" ? "bulletList" : "orderedList", items });
      continue;
    }

    const inline = parseInline(node.childNodes);
    if (!inline.length) continue;
    if (tag === "h2" || tag === "h3") {
      content.push({ type: "heading", level: tag === "h3" ? 3 : 2, content: inline });
    } else if (tag === "blockquote") {
      content.push({ type: "blockquote", content: inline });
    } else if (node.dataset.editorialCallout) {
      const tone = node.dataset.editorialCallout === "tip" || node.dataset.editorialCallout === "warning"
        ? node.dataset.editorialCallout
        : "info";
      content.push({ type: "callout", tone, content: inline });
    } else {
      content.push({ type: "paragraph", content: inline });
    }
  }
  return normalizeEditorialRichText({ version: EDITORIAL_RICH_TEXT_VERSION, type: "doc", content }) ?? EMPTY_DOCUMENT;
}

function selectionInside(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

function nearestBlock(root: HTMLElement, node: Node | null) {
  let current = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (current && current !== root) {
    if (current.parentElement === root) return current;
    current = current.parentElement;
  }
  return null;
}

export function AdminRichTextEditor({
  id,
  value,
  onChange,
  placeholder = "Začni písať…",
  ariaLabel = "Editor textu",
  allowHeadings = true,
  allowCallouts = true,
  minHeight = 180,
}: {
  id: string;
  value: EditorialRichTextDocument;
  onChange: (value: EditorialRichTextDocument) => void;
  placeholder?: string;
  ariaLabel?: string;
  allowHeadings?: boolean;
  allowCallouts?: boolean;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedRef = useRef("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");

  const signature = JSON.stringify(normalizedDocument(value));

  useEffect(() => {
    const root = editorRef.current;
    if (!root || signature === lastEmittedRef.current) return;
    renderDocument(root, value);
  }, [signature, value]);

  function emitChange() {
    const root = editorRef.current;
    if (!root) return;
    const next = parseEditor(root);
    lastEmittedRef.current = JSON.stringify(next);
    onChange(next);
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runCommand(command: string, commandValue?: string) {
    focusEditor();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  function applyBlock(tag: "p" | "h2" | "h3" | "blockquote") {
    runCommand("formatBlock", tag);
  }

  function applyCallout(tone: "info" | "tip" | "warning") {
    const root = editorRef.current;
    if (!root) return;
    focusEditor();
    document.execCommand("formatBlock", false, "div");
    const selection = window.getSelection();
    const block = nearestBlock(root, selection?.anchorNode ?? null);
    if (block) {
      block.dataset.editorialCallout = tone;
      block.className = styles.callout;
    }
    emitChange();
  }

  function openLinkEditor() {
    const root = editorRef.current;
    if (!root) return;
    const range = selectionInside(root);
    if (!range || range.collapsed) {
      setLinkError("Najprv označ text, ktorý chceš premeniť na odkaz.");
      setLinkOpen(true);
      return;
    }
    savedRangeRef.current = range.cloneRange();
    setLinkError("");
    setLinkOpen(true);
  }

  function applyLink() {
    const href = sanitizeEditorialHref(linkUrl, true);
    if (!href) {
      setLinkError("Použi bezpečný odkaz začínajúci https://, http:// alebo internou cestou /.");
      return;
    }
    const range = savedRangeRef.current;
    const selection = window.getSelection();
    if (!range || !selection) {
      setLinkError("Označenie textu už nie je aktívne. Označ text znova.");
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("createLink", false, href);
    setLinkOpen(false);
    setLinkError("");
    setLinkUrl("https://");
    savedRangeRef.current = null;
    emitChange();
    focusEditor();
  }

  function pastePlainText(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    const root = editorRef.current;
    const selection = window.getSelection();
    const range = root ? selectionInside(root) : null;
    if (!root || !selection || !range) return;

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    text.split("\n").forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement("br"));
      fragment.appendChild(document.createTextNode(line));
    });
    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    emitChange();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      runCommand("bold");
    } else if (key === "i") {
      event.preventDefault();
      runCommand("italic");
    } else if (event.shiftKey && key === "7") {
      event.preventDefault();
      runCommand("insertOrderedList");
    } else if (event.shiftKey && key === "8") {
      event.preventDefault();
      runCommand("insertUnorderedList");
    } else if (event.altKey && key === "2" && allowHeadings) {
      event.preventDefault();
      applyBlock("h2");
    } else if (event.altKey && key === "3" && allowHeadings) {
      event.preventDefault();
      applyBlock("h3");
    }
  }

  return (
    <div className={styles.wrapper} data-admin-rich-text-editor>
      <div className={styles.toolbar} role="toolbar" aria-label="Formátovanie textu">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} aria-label="Tučné (Ctrl alebo Cmd + B)"><strong>B</strong></button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} aria-label="Kurzíva (Ctrl alebo Cmd + I)"><em>I</em></button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openLinkEditor} aria-label="Vložiť odkaz">Odkaz</button>
        <span className={styles.separator} aria-hidden="true" />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlock("p")} aria-label="Odsek">P</button>
        {allowHeadings && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlock("h2")} aria-label="Nadpis úrovne 2">H2</button>}
        {allowHeadings && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlock("h3")} aria-label="Nadpis úrovne 3">H3</button>}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} aria-label="Odrážkový zoznam">• Zoznam</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} aria-label="Číslovaný zoznam">1. Zoznam</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlock("blockquote")} aria-label="Citácia">Citácia</button>
        {allowCallouts && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCallout("tip")} aria-label="Tip alebo zvýraznenie">Tip</button>}
        <span className={styles.separator} aria-hidden="true" />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("undo")} aria-label="Späť">↶</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("redo")} aria-label="Znova">↷</button>
      </div>

      {linkOpen && (
        <div className={styles.linkEditor}>
          <label htmlFor={`${id}-link`}>Odkaz</label>
          <input
            id={`${id}-link`}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                setLinkOpen(false);
                setLinkError("");
                focusEditor();
              }
            }}
            placeholder="https://… alebo /interny-odkaz"
            autoFocus
          />
          <button type="button" onClick={applyLink}>Použiť</button>
          <button type="button" onClick={() => { setLinkOpen(false); setLinkError(""); focusEditor(); }}>Zrušiť</button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>
      )}

      <div
        ref={editorRef}
        id={id}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={pastePlainText}
        onKeyDown={onKeyDown}
      />
      <p className={styles.help}>Píš priamo ako v textovom editore. Vložený formátovaný obsah sa pri paste preberie ako čistý text; bezpečné formátovanie pridaj toolbarom.</p>
    </div>
  );
}
