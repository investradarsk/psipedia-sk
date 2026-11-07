"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Node, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  editorialToTiptap,
  tiptapToEditorial,
} from "@/lib/tiptap-editorial-bridge";
import { normalizeEditorialRichText, sanitizeEditorialHref, type EditorialRichTextDocument } from "@/lib/editorial-content";
import styles from "./admin-tiptap-article-editor.module.css";

/**
 * First stage of the Tiptap replacement: only v1-safe formatting is writable.
 * Color/highlight/underline controls cannot be enabled until the versioned
 * editorial contract, API, Notion and public renderer are upgraded in step 4.
 */
type ActiveEditor = {
  id: string;
  editor: Editor;
  allowHeadings: boolean;
  allowCallouts: boolean;
  allowQuotes: boolean;
};
type EditorScope = {
  active: ActiveEditor | null;
  setActive: (next: ActiveEditor | null) => void;
};
const ScopeContext = createContext<EditorScope | null>(null);

const PsipediaCallout = Node.create({
  name: "psipediaCallout",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "tip",
        parseHTML: (element) => element.getAttribute("data-psipedia-callout") || "tip",
        renderHTML: (attributes) => ({ "data-psipedia-callout": attributes.tone }),
      },
    };
  },
  parseHTML() { return [{ tag: "aside[data-psipedia-callout]" }]; },
  renderHTML({ HTMLAttributes }) { return ["aside", HTMLAttributes, 0]; },
});

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: { openOnClick: false, autolink: false },
  }),
  PsipediaCallout,
];

function TiptapSharedToolbar({ active }: { active: ActiveEditor | null }) {
  const [, refresh] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const editor = active?.editor;

  useEffect(() => {
    if (!editor) return;
    const handle = () => refresh((value) => value + 1);
    editor.on("selectionUpdate", handle);
    editor.on("transaction", handle);
    return () => {
      editor.off("selectionUpdate", handle);
      editor.off("transaction", handle);
    };
  }, [editor]);
  useEffect(() => { setLinkOpen(false); setLinkError(""); }, [editor]);

  const action = (label: string, title: string, callback: () => void, selected = false, enabled = true) => (
    <button type="button" title={title} aria-label={title}
      aria-pressed={selected} disabled={!editor || !enabled}
      onMouseDown={(event) => event.preventDefault()} onClick={callback}>{label}</button>
  );

  const applyLink = () => {
    if (!editor) return;
    const href = sanitizeEditorialHref(linkInput, true);
    if (!href) {
      setLinkError("Povolené sú odkazy https://, http:// alebo interné cesty začínajúce /.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkError("");
    setLinkOpen(false);
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Spoločná lišta formátovania článku" data-admin-tiptap-toolbar>
      <div className={styles.tools}>
        <span className={styles.activeLabel} aria-live="polite">{active ? "Upravuješ: " + (active.id.startsWith("block-") ? "textový blok" : active.id === "article-intro" ? "úvod" : "to najdôležitejšie") : "Klikni do textu"}</span>
        {action("B", "Tučné (Ctrl+B)", () => editor?.chain().focus().toggleBold().run(), Boolean(editor?.isActive("bold")))}
        {action("I", "Kurzíva (Ctrl+I)", () => editor?.chain().focus().toggleItalic().run(), Boolean(editor?.isActive("italic")))}
        {action("Odkaz", "Vložiť alebo upraviť odkaz", () => {
          setLinkInput(String(editor?.getAttributes("link").href || "https://"));
          setLinkOpen((value) => !value);
        }, Boolean(editor?.isActive("link")))}
        {action("Zrušiť odkaz", "Odstrániť odkaz", () => editor?.chain().focus().unsetLink().run(), false, Boolean(editor?.isActive("link")))}
        {action("P", "Odsek", () => editor?.chain().focus().setParagraph().run(), Boolean(editor?.isActive("paragraph")))}
        {action("H2", "Nadpis 2", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), Boolean(editor?.isActive("heading", { level: 2 })), Boolean(active?.allowHeadings))}
        {action("H3", "Nadpis 3", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), Boolean(editor?.isActive("heading", { level: 3 })), Boolean(active?.allowHeadings))}
        {action("•", "Odrážkový zoznam", () => editor?.chain().focus().toggleBulletList().run(), Boolean(editor?.isActive("bulletList")))}
        {action("1.", "Číslovaný zoznam", () => editor?.chain().focus().toggleOrderedList().run(), Boolean(editor?.isActive("orderedList")))}
        {action("Citácia", "Citácia", () => editor?.chain().focus().toggleBlockquote().run(), Boolean(editor?.isActive("blockquote")), Boolean(active?.allowQuotes))}
        {action("Tip", "Zvýraznený tip", () => editor?.chain().focus().toggleNode("psipediaCallout", "paragraph", { tone: "tip" }).run(), Boolean(editor?.isActive("psipediaCallout")), Boolean(active?.allowCallouts))}
        {action("↶", "Späť (Ctrl+Z)", () => editor?.chain().focus().undo().run())}
        {action("↷", "Znova (Ctrl+Y)", () => editor?.chain().focus().redo().run())}
        <label className={styles.colorControl} title="Farba textu – aktivujeme po rozšírení ukladania v kroku 4">
          Text <input aria-label="Celá paleta farieb textu – zatiaľ nedostupná" type="color" defaultValue="#1f4a3a" disabled />
        </label>
        <label className={styles.colorControl} title="Zvýraznenie – aktivujeme po rozšírení ukladania v kroku 4">
          Podfarbenie <input aria-label="Celá paleta zvýraznenia – zatiaľ nedostupná" type="color" defaultValue="#fff3a0" disabled />
        </label>
      </div>
      {linkOpen && editor && <div className={styles.linkBar}>
        <label htmlFor="article-tiptap-link">Odkaz</label>
        <input id="article-tiptap-link" value={linkInput} onChange={(event) => {setLinkInput(event.target.value);setLinkError("");}}
          onKeyDown={(event) => {if(event.key === "Enter"){event.preventDefault();applyLink();} if(event.key === "Escape"){setLinkOpen(false);}}} />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={applyLink}>Použiť</button>
        <button type="button" onClick={() => setLinkOpen(false)}>Zrušiť</button>
        {linkError && <span role="alert">{linkError}</span>}
      </div>}
    </div>
  );
}

export function AdminTiptapArticleScope({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveEditor | null>(null);
  const scope = useMemo(() => ({ active, setActive }), [active]);
  return <ScopeContext.Provider value={scope}>
    <TiptapSharedToolbar active={active} />
    {children}
  </ScopeContext.Provider>;
}

/** A single Tiptap instance per editable field, but exactly one toolbar. */
export function AdminTiptapRichTextEditor({
  id, value, onChange, placeholder = "Začni písať…", ariaLabel = "Editor textu",
  allowHeadings = true, allowCallouts = true, allowQuotes = true, minHeight = 180,
}: {
  id: string;
  value: EditorialRichTextDocument;
  onChange: (document: EditorialRichTextDocument) => void;
  placeholder?: string;
  ariaLabel?: string;
  allowHeadings?: boolean;
  allowCallouts?: boolean;
  allowQuotes?: boolean;
  minHeight?: number;
}) {
  const scope = useContext(ScopeContext);
  const initial = normalizeEditorialRichText(value);
  const signature = JSON.stringify(initial);
  const lastEmitted = useRef(signature);
  const callback = useRef(onChange);
  const scopeRef = useRef(scope);
  const [error, setError] = useState("");
  useEffect(() => { callback.current = onChange; scopeRef.current = scope; }, [onChange, scope]);
  const editor = useEditor({
    extensions,
    content: editorialToTiptap(initial || { version: 1, type: "doc", content: [] }),
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { id, role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel, "data-editor-ready": "true" },
      handlePaste(view, event) {
        // Never import arbitrary clipboard HTML into the editorial JSON model.
        const plain = event.clipboardData?.getData("text/plain");
        if (plain === undefined) return false;
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(plain.replace(/\r\n?/g, "\n"), from, to));
        return true;
      },
    },
    onFocus({ editor: focused }) {
      scopeRef.current?.setActive({ id, editor: focused, allowHeadings, allowCallouts, allowQuotes });
    },
    onUpdate({ editor: updated }) {
      try {
        const next = tiptapToEditorial(updated.getJSON());
        lastEmitted.current = JSON.stringify(next);
        setError("");
        callback.current(next);
      } catch {
        setError("Obsah obsahuje nepodporované formátovanie. Pred uložením ho odstráň.");
      }
    },
  }, [id]);

  useEffect(() => {
    if (!editor) return;
    if (signature === lastEmitted.current) return;
    try {
      editor.commands.setContent(editorialToTiptap(value), { emitUpdate: false });
      lastEmitted.current = signature;
      setError("");
    } catch {
      setError("Tento dokument sa nedá bezpečne previesť. Pôvodný obsah sa nezmenil.");
    }
  }, [editor, signature, value]);

  useEffect(() => () => {
    if (scopeRef.current?.active?.id === id) scopeRef.current.setActive(null);
  }, [id]);

  return <div className={styles.editorBox} data-admin-tiptap-rich-text data-admin-rich-text-editor data-article-tiptap-invalid={error ? "true" : "false"}>
    <EditorContent editor={editor} className={styles.editable} style={{ minHeight }} />
    {!editor && <div className={styles.loading} aria-hidden="true" style={{ minHeight }} />}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
