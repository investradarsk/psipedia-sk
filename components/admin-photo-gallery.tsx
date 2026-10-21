"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { uploadAdminImage, type AdminImageFolder } from "@/lib/admin-image-upload";
import styles from "./admin-photo-gallery.module.css";

/** Edits the existing gallery URL array. Removing a reference never deletes shared media. */
export function AdminPhotoGallery({ value, onChange, folder, limit, disabled = false, onBusyChange }: {
  value: string[];
  onChange: (value: string[]) => void;
  folder: AdminImageFolder;
  limit: number;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const locked = disabled || busy;

  function addUrl() {
    if (locked || pending.current) return;
    const candidate = url.trim();
    const internal = /^\/(?:media|images)\//.test(candidate);
    let valid = internal;
    try { valid ||= ["https:", "http:"].includes(new URL(candidate).protocol); } catch { /* relative paths checked above */ }
    if (!valid) { setError("Zadaj platnú HTTP/HTTPS alebo internú /media/ adresu fotografie."); return; }
    if (value.includes(candidate)) { setError("Táto fotografia už je v galérii."); return; }
    if (value.length >= limit) { setError(`Galéria môže obsahovať najviac ${limit} fotografií.`); return; }
    onChange([...value, candidate]); setUrl(""); setError(""); setMessage("Fotografia bola pridaná. Ulož zmeny profilu.");
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || locked || pending.current) return;
    const remaining = Math.max(0, limit - value.length);
    if (files.length > remaining) { setError(`Vyber najviac ${remaining} ďalších fotografií.`); return; }
    pending.current = true; setBusy(true); onBusyChange(true); setError(""); setMessage("");
    const next = [...value];
    let added = 0;
    const failures: string[] = [];
    try {
      // Bounded, sequential uploads avoid overwhelming the existing upload endpoint.
      for (const file of files) {
        try {
          const result = await uploadAdminImage(file, folder);
          if (!next.includes(result.imageUrl)) { next.push(result.imageUrl); added++; onChange([...next]); }
        } catch (caught) {
          failures.push(`${file.name}: ${caught instanceof Error ? caught.message : "Nahratie zlyhalo."}`);
        }
      }
      setMessage(added ? `Pridané fotografie: ${added}. Ulož zmeny profilu.` : "Nebola pridaná žiadna fotografia.");
      setError(failures.join(" "));
    } finally { pending.current = false; setBusy(false); onBusyChange(false); }
  }

  function move(index: number, offset: number) {
    if (locked) return;
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return <section className={styles.gallery} aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h3 id={`${id}-title`}>Galéria fotografií ({value.length}/{limit})</h3>
    <p>Poradie môžeš zmeniť šípkami. Odstránenie vyradí fotografiu z galérie tohto profilu. Zmeny potvrď uložením profilu.</p>
    <label className="admin-upload-button">{busy ? "Nahrávam fotografie…" : "Nahrať fotografie"}<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" disabled={locked || value.length >= limit} onChange={upload} /></label>
    <div className="admin-field"><label htmlFor={`${id}-url`}>Pridať fotografiu z URL</label><input id={`${id}-url`} type="text" inputMode="url" value={url} disabled={locked || value.length >= limit} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="/media/… alebo https://…" /><button type="button" disabled={locked || !url.trim() || value.length >= limit} onClick={addUrl}>Pridať do galérie</button></div>
    <ol className={styles.items}>{value.map((src, index) => <li key={`${index}-${src}`}>
      {/* Existing media URLs are also accepted by the canonical gallery model. */}
      <img src={src} alt={`Fotografia ${index + 1}`} loading="lazy" />
      <div className={styles.controls}>
        <button type="button" disabled={locked || index === 0} aria-label={`Posunúť fotografiu ${index + 1} dopredu`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={locked || index === value.length - 1} aria-label={`Posunúť fotografiu ${index + 1} dozadu`} onClick={() => move(index, 1)}>↓</button>
        <button type="button" disabled={locked} aria-label={`Odstrániť fotografiu ${index + 1} z galérie`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Odstrániť</button>
      </div>
    </li>)}</ol>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
