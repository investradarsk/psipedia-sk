"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { $createParagraphNode, $createTextNode, $getRoot, type EditorState, type LexicalEditor } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable as LexicalContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import styles from "./admin-lexical-text-field.module.css";

function writePlainText(value: string) {
  const root = $getRoot();
  root.clear();
  for (const line of value.replace(/\r\n?/g, "\n").split("\n")) {
    const paragraph = $createParagraphNode();
    if (line) paragraph.append($createTextNode(line));
    root.append(paragraph);
  }
}

function LexicalPlainTextBridge({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [editor] = useLexicalComposerContext();
  const lastEmitted = useRef(value);
  const currentValue = useRef(value);
  const onChangeRef = useRef(onChange);

  currentValue.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    // Reconcile changes from Notion/automation, not keystrokes echoed by React.
    if (lastEmitted.current === value) return;
    const current = editor.getEditorState().read(() => $getRoot().getTextContent());
    if (current !== value) editor.update(() => writePlainText(value), { tag: "external" });
    lastEmitted.current = value;
  }, [editor, value]);

  const handleChange = useCallback((state: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
    if (tags.has("external")) return;
    const next = state.read(() => $getRoot().getTextContent());
    if (next === currentValue.current) return;
    lastEmitted.current = next;
    onChangeRef.current(next);
  }, []);

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
}

type Props = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onInput?: (value: string) => void;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

/**
 * Canonical Lexical input for existing plain-text contracts.
 * Do not serialize Lexical JSON into D1/Notion fields that only support strings.
 * Hidden native textarea preserves FormData and the admin automation field name.
 */
export function AdminLexicalTextField({
  id, name, value, defaultValue = "", onChange, onInput, rows = 5,
  required = false, disabled = false, placeholder, ariaLabel,
}: Props) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const current = value === undefined ? internalValue : value;
  const handleChange = useCallback((next: string) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  }, [onChange, value]);

  const initialConfig = {
    namespace: "PsipediaAdminPlainText",
    theme: {},
    onError: (error: Error) => console.error("Lexical editor:", error),
    editorState: () => writePlainText(current),
  };

  return (
    <div className={styles.field} data-admin-lexical-text>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={styles.surface} style={{ minHeight: `${Math.max(3, Math.min(rows, 14)) * 1.45}rem` }}>
          <PlainTextPlugin
            contentEditable={
              <LexicalContentEditable
                id={id}
                aria-label={ariaLabel}
                aria-required={required}
                aria-multiline="true"
                contentEditable={!disabled}
                className={styles.input}
              />
            }
            placeholder={<span className={styles.placeholder}>{placeholder}</span>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <LexicalPlainTextBridge value={current} onChange={handleChange} />
        </div>
      </LexicalComposer>
      {name && (
        <textarea
          name={name}
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: "none" }}
          readOnly={false}
          value={current}
          onChange={() => {}}
          onInput={(event) => {
            // Programmatic changes in adoption/automation forms update the editor.
            const next = event.currentTarget.value;
            handleChange(next);
            onInput?.(next);
          }}
        />
      )}
    </div>
  );
}
