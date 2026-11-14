"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Mark, Node, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  editorialToTiptap,
  tiptapToEditorial,
} from "@/lib/tiptap-editorial-bridge";
import { normalizeEditorialRichText, sanitizeEditorialColor, sanitizeEditorialHref, type EditorialRichTextDocument } from "@/lib/editorial-content";
import styles from "./admin-tiptap-article-editor.module.css";

/** A single toolbar edits v1 legacy and v2 styled documents without HTML persistence. */
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

/** Closed, hex-only mark schema. Unsafe imported CSS is not serialized. */
const PsipediaTextColor = Mark.create({
  name: "textStyle",
  addAttributes() {
    return { color: { default: null,
      parseHTML: (element) => sanitizeEditorialColor((element as HTMLElement).style.color) || null,
      renderHTML: (attrs) => {
        const color = sanitizeEditorialColor(attrs.color);
        return color ? { style: `color: ${color}` } : {};
      },
    } };
  },
  parseHTML() { return [{ tag: "span[style]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", HTMLAttributes, 0]; },
});

const PsipediaHighlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return { color: { default: "#ffff00",
      parseHTML: (element) => sanitizeEditorialColor((element as HTMLElement).style.backgroundColor) || "#ffff00",
      renderHTML: (attrs) => ({ style: `background-color: ${sanitizeEditorialColor(attrs.color) || "#ffff00"}` }),
    } };
  },
  parseHTML() { return [{ tag: "mark" }]; },
  renderHTML({ HTMLAttributes }) { return ["mark", HTMLAttributes, 0]; },
});

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: { openOnClick: false, autolink: false },
  }),
  PsipediaCallout,
  PsipediaTextColor,
  PsipediaHighlight,
];

type ColorTarget = "text" | "highlight";

const EDITORIAL_PALETTE = [
  "#1f4a3a", "#b4513d", "#142d25", "#ffffff",
  "#000000", "#64748b", "#2563eb", "#0d9488",
  "#eab308", "#be123c", "#9333ea", "#f97316",
  "#f5e8cc", "#fde68a", "#bbf7d0", "#bae6fd",
] as const;

function TiptapColorPanel({
  target, currentColor, onApply, onClear, onClose,
}: {
  target: ColorTarget;
  currentColor: string;
  onApply: (color: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const label = target === "text" ? "Farba textu" : "Podfarbenie";
  const [hex, setHex] = useState(currentColor);
  const [error, setError] = useState("");
  const applyHex = () => {
    const color = sanitizeEditorialColor(hex);
    if (!color) {
      setError("Zadaj platnú HEX farbu vo formáte #RRGGBB.");
      return;
    }
    setError("");
    onApply(color);
  };

  return (
    <section className={styles.colorPanel} role="group" aria-label={`${label} – výber farby`}
      data-tiptap-color-panel={target}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <div className={styles.panelTitle}>
        <strong>{label}</strong>
        <button type="button" onClick={onClose} aria-label="Zavrieť výber farby">Zavrieť</button>
      </div>
      <div className={styles.paletteGrid} role="group" aria-label="Predvolené farby">
        {EDITORIAL_PALETTE.map((color) => (
          <button key={color} type="button" className={styles.paletteSwatch}
            style={{ backgroundColor: color }}
            aria-label={`Použiť farbu ${color}`}
            title={color}
            aria-pressed={color === currentColor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onApply(color)}
          />
        ))}
      </div>
      <div className={styles.customColorRow}>
        <label className={styles.nativeColor}>
          Vlastná farba
          <input type="color" aria-label={`Vlastná farba – ${label.toLowerCase()}`}
            value={sanitizeEditorialColor(hex) || currentColor}
            onChange={(event) => { setHex(event.target.value); onApply(event.target.value); }} />
        </label>
        <label className={styles.hexControl}>
          HEX
          <input type="text" aria-label={`HEX – ${label.toLowerCase()}`}
            value={hex} maxLength={7} spellCheck={false}
            onChange={(event) => { setHex(event.target.value); setError(""); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyHex(); } }} />
        </label>
        <button type="button" className={styles.applyColor} onClick={applyHex}>Použiť</button>
      </div>
      <button type="button" className={styles.clearColor} onClick={onClear}>
        {target === "text" ? "Odstrániť farbu textu" : "Odstrániť podfarbenie"}
      </button>
      {error && <p role="alert" className={styles.colorError}>{error}</p>}
    </section>
  );
}

function TiptapSharedToolbar({ active }: { active: ActiveEditor | null }) {
  const [, refresh] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [openColorPanel, setOpenColorPanel] = useState<ColorTarget | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rememberedSelection = useRef<{ from: number; to: number } | null>(null);
  const editor = active?.editor;

  // Section navigation scrolls the document. Reserve the *measured* height of
  // this sticky, sometimes wrapping toolbar so the first form label stays
  // visible beneath both the admin topbar and the formatting controls.
  useEffect(() => {
    const toolbar = toolbarRef.current;
    const page = toolbar?.closest<HTMLElement>('[data-editor-layout="article"]');
    if (!toolbar || !page) return;
    const update = () => {
      page.style.setProperty("--admin-tiptap-toolbar-height", `${Math.ceil(toolbar.getBoundingClientRect().height)}px`);
    };
    update();
    if (typeof ResizeObserver === "undefined") return () => page.style.removeProperty("--admin-tiptap-toolbar-height");
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => {
      observer.disconnect();
      page.style.removeProperty("--admin-tiptap-toolbar-height");
    };
  }, []);

  useEffect(() => {
    if (!editor) return;
    const handle = () => {
      // A toolbar control must never collapse the editor's selected text.
      if (editor.isFocused) {
        rememberedSelection.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      }
      refresh((value) => value + 1);
    };
    editor.on("selectionUpdate", handle);
    editor.on("transaction", handle);
    return () => {
      editor.off("selectionUpdate", handle);
      editor.off("transaction", handle);
    };
  }, [editor]);

  useEffect(() => {
    if (!openColorPanel) return;
    const onOutsidePress = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as HTMLElement)) setOpenColorPanel(null);
    };
    document.addEventListener("pointerdown", onOutsidePress);
    return () => document.removeEventListener("pointerdown", onOutsidePress);
  }, [openColorPanel]);

  const rememberSelection = () => {
    if (!editor) return;
    rememberedSelection.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  };

  const selectedChain = () => {
    if (!editor) return null;
    const selection = rememberedSelection.current ?? {
      from: editor.state.selection.from, to: editor.state.selection.to,
    };
    // Never attempt to restore a selection from an unrelated/changed document.
    const max = editor.state.doc.content.size;
    const range = selection.from >= 0 && selection.to <= max && selection.from <= selection.to
      ? selection : { from: editor.state.selection.from, to: editor.state.selection.to };
    return editor.chain().focus().setTextSelection(range);
  };

  const applyColor = (target: ColorTarget, value: string) => {
    const color = sanitizeEditorialColor(value);
    const chain = selectedChain();
    if (!chain || !color) return;
    if (target === "text") chain.setMark("textStyle", { color }).run();
    else chain.setMark("highlight", { color }).run();
    setOpenColorPanel(null);
  };

  const removeColor = (target: ColorTarget) => {
    const chain = selectedChain();
    if (!chain) return;
    if (target === "text") chain.unsetMark("textStyle").run();
    else chain.unsetMark("highlight").run();
    setOpenColorPanel(null);
  };

  const toggleColors = (target: ColorTarget) => {
    rememberSelection();
    setOpenColorPanel((value) => value === target ? null : target);
  };

  // A collapsed selection uses ProseMirror stored marks for format-first typing.
  // Updating those marks directly avoids losing the pending format when the
  // shared toolbar is re-rendered by its active-editor context.
  const toggleInlineMark = (name: "bold" | "italic" | "underline") => {
    if (!editor) return;
    const selection = editor.state.selection;
    // ProseMirror can initially select the entire empty document. Although
    // that selection is non-empty, there is no text to format, so prepare a
    // stored mark for the first typed character instead.
    const selectedText = selection.empty ? "" : editor.state.doc.textBetween(selection.from, selection.to, " ");
    if (!selection.empty && selectedText.length > 0) {
      const chain = editor.chain().focus();
      if (name === "bold") chain.toggleBold().run();
      else if (name === "italic") chain.toggleItalic().run();
      else chain.toggleUnderline().run();
      return;
    }
    if (!selection.empty) editor.commands.focus("start");
    // The editor remains focused because toolbar buttons prevent mousedown
    // focus stealing. Re-focusing here can clear ProseMirror's pending marks
    // before the first character is typed (format-first editing).
    if (!editor.isFocused) editor.commands.focus();
    const { view } = editor;
    const { state } = view;
    const markType = state.schema.marks[name];
    if (!markType) return;
    const marks = state.storedMarks ?? state.selection.$from.marks();
    const nextMarks = markType.isInSet(marks)
      ? markType.removeFromSet(marks)
      : markType.create().addToSet(marks);
    view.dispatch(state.tr.setStoredMarks(nextMarks));
  };

  // An empty ProseMirror field can have a trailing paragraph after the first
  // list toggle. In that case the list is rendered but the caret remains
  // outside it, so the toolbar reports an inactive list and typing misses it.
  // Move the caret into the newly created list only for a blank field.
  const toggleList = (kind: "bulletList" | "orderedList") => {
    if (!editor) return;
    const blankField = editor.state.doc.childCount === 1
      && editor.state.doc.firstChild?.type.name === "paragraph"
      && editor.state.doc.textContent.length === 0;
    if (kind === "bulletList") editor.chain().focus().toggleBulletList().run();
    else editor.chain().focus().toggleOrderedList().run();

    if (!blankField || editor.isActive(kind)) return;
    let firstItemPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== kind) return true;
      if (node.firstChild?.type.name === "listItem"
        && node.firstChild.firstChild?.isTextblock) {
        firstItemPos = pos + 3; // list + listItem + paragraph start
      }
      return false;
    });
    if (firstItemPos !== null) editor.chain().focus().setTextSelection(firstItemPos).run();
  };

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
    <div ref={toolbarRef} className={styles.toolbar} role="toolbar" aria-label="Spoločná lišta formátovania článku" data-admin-tiptap-toolbar>
      <div className={styles.tools} role="group" tabIndex={0} aria-label="Posúvateľná lišta nástrojov formátovania">
        <span className={styles.activeLabel} aria-live="polite">{active ? "Upravuješ: " + (active.id.startsWith("block-") ? "textový blok" : active.id === "article-intro" ? "úvod" : "to najdôležitejšie") : "Klikni do textu"}</span>
        {action("B", "Tučné (Ctrl+B)", () => toggleInlineMark("bold"), Boolean(editor?.isActive("bold")))}
        {action("I", "Kurzíva (Ctrl+I)", () => toggleInlineMark("italic"), Boolean(editor?.isActive("italic")))}
        {action("Odkaz", "Vložiť alebo upraviť odkaz", () => {
          setLinkInput(String(editor?.getAttributes("link").href || "https://"));
          setLinkOpen((value) => !value);
        }, Boolean(editor?.isActive("link")))}
        {action("Zrušiť odkaz", "Odstrániť odkaz", () => editor?.chain().focus().unsetLink().run(), false, Boolean(editor?.isActive("link")))}
        {action("P", "Odsek", () => editor?.chain().focus().setParagraph().run(), Boolean(editor?.isActive("paragraph")))}
        {action("H2", "Nadpis 2", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), Boolean(editor?.isActive("heading", { level: 2 })), Boolean(active?.allowHeadings))}
        {action("H3", "Nadpis 3", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), Boolean(editor?.isActive("heading", { level: 3 })), Boolean(active?.allowHeadings))}
        {action("•", "Odrážkový zoznam", () => toggleList("bulletList"), Boolean(editor?.isActive("bulletList")))}
        {action("1.", "Číslovaný zoznam", () => toggleList("orderedList"), Boolean(editor?.isActive("orderedList")))}
        {action("Citácia", "Citácia", () => editor?.chain().focus().toggleBlockquote().run(), Boolean(editor?.isActive("blockquote")), Boolean(active?.allowQuotes))}
        {action("Tip", "Zvýraznený tip", () => editor?.chain().focus().toggleNode("psipediaCallout", "paragraph", { tone: "tip" }).run(), Boolean(editor?.isActive("psipediaCallout")), Boolean(active?.allowCallouts))}
        {action("↶", "Späť (Ctrl+Z)", () => editor?.chain().focus().undo().run())}
        {action("↷", "Znova (Ctrl+Y)", () => editor?.chain().focus().redo().run())}
        {action("U", "Podčiarknutie (Ctrl+U)", () => toggleInlineMark("underline"), Boolean(editor?.isActive("underline")))}
        <button type="button" className={styles.colorTrigger}
          aria-label="Celá paleta farieb textu"
          title="Farba textu"
          aria-expanded={openColorPanel === "text"}
          disabled={!editor}
          onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}
          onClick={() => toggleColors("text")}>
          Farba textu <span className={styles.colorPreview} aria-hidden="true"
            style={{ backgroundColor: sanitizeEditorialColor(editor?.getAttributes("textStyle").color) || "#1f4a3a" }} />
          <span aria-hidden="true">⌄</span>
        </button>
        <button type="button" className={styles.colorTrigger}
          aria-label="Celá paleta zvýraznenia"
          title="Podfarbenie textu"
          aria-expanded={openColorPanel === "highlight"}
          disabled={!editor}
          onMouseDown={(event) => { event.preventDefault(); rememberSelection(); }}
          onClick={() => toggleColors("highlight")}>
          Podfarbenie <span className={styles.colorPreview} aria-hidden="true"
            style={{ backgroundColor: sanitizeEditorialColor(editor?.getAttributes("highlight").color) || "#fff3a0" }} />
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {openColorPanel && editor && (
        <TiptapColorPanel key={openColorPanel} target={openColorPanel}
          currentColor={sanitizeEditorialColor(editor.getAttributes(openColorPanel === "text" ? "textStyle" : "highlight").color)
            || (openColorPanel === "text" ? "#1f4a3a" : "#fff3a0")}
          onApply={(color) => applyColor(openColorPanel, color)}
          onClear={() => removeColor(openColorPanel)}
          onClose={() => setOpenColorPanel(null)} />
      )}
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

export function AdminTiptapArticleScope({ children, activeSectionId }: { children: ReactNode; activeSectionId: string }) {
  const [active, setActive] = useState<ActiveEditor | null>(null);
  const scope = useMemo(() => ({ active, setActive }), [active]);
  // Switching left-hand panels must not edit a hidden, previously focused field.
  const visible = active && (active.id.startsWith("block-")
    ? activeSectionId === "article-blocks"
    : activeSectionId === "article-basics") ? active : null;
  return <ScopeContext.Provider value={scope}>
    <TiptapSharedToolbar key={visible?.id ?? "no-visible-editor"} active={visible} />
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
      attributes: { id, role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel, "data-editor-ready": "true", "data-placeholder": placeholder },
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
    if (!editor || signature === lastEmitted.current) return;
    // Props are already normalized by RichTextInput. Never write a fallback
    // document on an unexpected external value: preserving the editor state
    // is safer than silently replacing it with empty content.
    const validated = normalizeEditorialRichText(value);
    if (!validated) return;
    // Ignore external prop echoes while the user is editing. Applying
    // setContent during typing destroys ProseMirror's stored marks (e.g. a
    // bold command issued before the first character).
    if (editor.isFocused) return;
    editor.commands.setContent(editorialToTiptap(validated), { emitUpdate: false });
    lastEmitted.current = signature;
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
