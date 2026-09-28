"use client";

import { useRef, useSyncExternalStore } from "react";
import { EventMarkdown } from "@/components/event-markdown";
import { safeEventLink } from "@/lib/event-markdown";

const subscribeToHydration = () => () => {};

export function AdminEventMarkdownEditor({ id, label, value, onChange, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  function insert(kind: string) {
    const field = textarea.current;
    if (!field) return;
    const text = field.value;
    const start = field.selectionStart, end = field.selectionEnd;
    const selected = text.slice(start, end) || "Text";
    let replacement = selected;
    if (kind === "bold") replacement = `**${selected}**`;
    if (kind === "italic") replacement = `*${selected}*`;
    if (kind === "heading") replacement = `\n\n## ${selected}\n\n`;
    if (kind === "paragraph") replacement = `\n\n${selected}\n\n`;
    if (kind === "list" || kind === "ordered") replacement = `\n\n${selected.split("\n").map((line, index) => `${kind === "list" ? "-" : `${index + 1}.`} ${line}`).join("\n")}\n\n`;
    if (kind === "link") {
      const url = window.prompt("Adresa odkazu (https://…, mailto:… alebo /cesta)", "https://");
      if (url === null) return;
      if (!safeEventLink(url) || /[()]/.test(url)) { window.alert("Zadaj bezpečný odkaz bez medzier a zátvoriek."); return; }
      replacement = `[${selected}](${url})`;
    }
    onChange(text.slice(0, start) + replacement + text.slice(end));
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start, start + replacement.length); });
  }
  return <div className="admin-field admin-markdown-editor" data-hydrated={hydrated}>
    <label htmlFor={id}>{label}</label>
    <div className="admin-markdown-toolbar" role="group" aria-label={`Formátovanie: ${label}`}>
      {[["bold", "Tučné"], ["italic", "Kurzíva"], ["list", "Odrážky"], ["ordered", "Číslovaný zoznam"], ["heading", "Medzititulok"], ["link", "Odkaz"], ["paragraph", "Odsek"]].map(([kind, name]) => <button key={kind} type="button" disabled={!hydrated} onClick={() => insert(kind)}>{name}</button>)}
    </div>
    <small id={`${id}-help`}>Označ text a použi formátovanie. Nový odsek oddeľ prázdnym riadkom. HTML sa zobrazí ako obyčajný text.</small>
    <textarea disabled={!hydrated} ref={textarea} id={id} aria-describedby={`${id}-help`} rows={12} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    <section className="admin-markdown-preview" aria-label={`Náhľad: ${label}`}><h3>Živý náhľad</h3>{value ? <EventMarkdown value={value} /> : <p>Tu sa zobrazí formátovaný text.</p>}</section>
  </div>;
}
