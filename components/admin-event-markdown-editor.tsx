"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { EventMarkdown } from "@/components/event-markdown";
import { AdminLexicalRichTextEditor } from "@/components/admin-lexical-rich-text-editor";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { appendLexicalPlainTextToMarkdown } from "@/lib/editorial-lexical-append";
import { editorialToEventMarkdown, eventMarkdownToEditorial } from "@/lib/event-lexical-markdown";

const subscribeToHydration = () => () => {};

export function AdminEventMarkdownEditor({
  id, label, value, onChange, required = false,
}: {
  id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [sourceMode, setSourceMode] = useState(false);
  const documentValue = useMemo(() => eventMarkdownToEditorial(value), [value]);
  // Unsupported historical Markdown must never be rewritten by an editor
  // that doesn't understand it. It remains completely editable in source mode.
  const showSource = sourceMode || documentValue === null;

  return <div className="admin-field admin-markdown-editor" data-hydrated={hydrated} data-event-lexical-markdown>
    <div className="admin-markdown-toolbar" role="group" aria-label={"Editor: " + label}>
      <strong>{label}{required ? " *" : ""}</strong>
      {documentValue && <button type="button" disabled={!hydrated} onClick={() => setSourceMode(!sourceMode)}>
        {showSource ? "Vizuálny editor" : "Markdown zdroj"}
      </button>}
    </div>
    {showSource ? <>
      <label htmlFor={id}>Markdown zdroj – {label}</label>
      {!documentValue && value && <small id={id + "-legacy"}>
        Pôvodný formát tohto popisu sa nedá bezpečne previesť. Zostáva nezmenený; upravovať ho môžeš priamo ako Markdown.
      </small>}
      <textarea disabled={!hydrated} id={id} aria-label={label} aria-describedby={!documentValue && value ? id + "-legacy" : undefined}
        rows={12} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
      <AdminLexicalAppendButton disabled={!hydrated}
        onAppend={(plainText) => onChange(appendLexicalPlainTextToMarkdown(value, plainText))} />
    </> : documentValue ? <>
      <AdminLexicalRichTextEditor id={id} value={documentValue}
        onChange={(next) => onChange(editorialToEventMarkdown(next))}
        ariaLabel={label} placeholder={"Napíš " + label.toLowerCase() + "…"}
        allowHeadings allowCallouts={false} allowQuotes={false} minHeight={220} />
      <small>Text sa stále ukladá ako Markdown. Náhľad ukazuje presné formátovanie, ktoré uvidia návštevníci.</small>
    </> : null}
    <section className="admin-markdown-preview" role="region" aria-label={"Náhľad: " + label}>
      <h3>Živý náhľad</h3>
      {value ? <EventMarkdown value={value} /> : <p>Tu sa zobrazí formátovaný text.</p>}
    </section>
  </div>;
}
