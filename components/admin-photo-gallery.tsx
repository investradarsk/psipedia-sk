"use client";

import { useId, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { AdminUppyGalleryUpload } from "@/components/admin-uppy-gallery-upload";
import { AdminSortableGallery } from "@/components/admin-sortable-gallery";
import { useForm } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { validateAdminPhotoGalleryUrl } from "@/lib/admin-photo-gallery-url";
import { type AdminImageFolder, type AdminImageUpload } from "@/lib/admin-image-upload";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Remain inside the owning editor form; no nested form or save side effects.
  const { register, setValue, watch } = useForm<{ photoUrl: string }>({ defaultValues: { photoUrl: "" } });
  const url = watch("photoUrl");
  const locked = disabled || busy;

  function addUrl() {
    if (locked) return;
    const candidate = validateAdminPhotoGalleryUrl(url);
    if (!candidate) { setError("Zadaj platnú HTTP/HTTPS alebo internú /media/ adresu fotografie."); return; }
    if (value.includes(candidate)) { setError("Táto fotografia už je v galérii."); return; }
    if (value.length >= limit) { setError(`Galéria môže obsahovať najviac ${limit} fotografií.`); return; }
    onChange([...value, candidate]); setValue("photoUrl", ""); setError(""); setMessage("Fotografia bola pridaná. Ulož zmeny profilu.");
  }

  function acceptUploaded(files: AdminImageUpload[]) {
    // Canonical URLs are committed only by the owning editor's Save action.
    const next = [...value];
    for (const file of files) {
      if (next.length >= limit) break;
      if (!next.includes(file.imageUrl)) next.push(file.imageUrl);
    }
    const added = next.length - value.length;
    if (added) onChange(next);
    setMessage(added ? `Pridané fotografie: ${added}. Ulož zmeny profilu.` : "Nebola pridaná žiadna nová fotografia.");
    setError("");
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
    <AdminUppyGalleryUpload
      folder={folder}
      remaining={limit-value.length}
      disabled={locked}
      onUploaded={acceptUploaded}
      onRejected={setError}
      onBusyChange={nextBusy => { setBusy(nextBusy); onBusyChange(nextBusy); }}
    />
    <div className="admin-field"><label htmlFor={`${id}-url`}>Pridať fotografiu z URL</label><input id={`${id}-url`} type="text" inputMode="url" {...register("photoUrl")} disabled={locked || value.length >= limit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="/media/… alebo https://…" /><button type="button" disabled={locked || !url.trim() || value.length >= limit} onClick={addUrl}><Plus size={16} aria-hidden="true" /> Pridať do galérie</button></div>
    <AdminSortableGallery urls={value} as="li" containerAs="ol" className={styles.items}
      disabled={locked} onReorder={(from,to)=>onChange(arrayMove(value,from,to))}
      renderRow={(index,handle)=><>
        <img src={value[index]} alt={`Fotografia ${index + 1}`} loading="lazy" />
        <div className={styles.controls}>
          {handle}
          <button type="button" disabled={locked || index === 0}
            aria-label={`Posunúť fotografiu ${index + 1} dopredu`}
            onClick={()=>move(index,-1)}><ArrowUp size={17} aria-hidden="true" /></button>
          <button type="button" disabled={locked || index === value.length - 1}
            aria-label={`Posunúť fotografiu ${index + 1} dozadu`}
            onClick={()=>move(index,1)}><ArrowDown size={17} aria-hidden="true" /></button>
          <button type="button" disabled={locked}
            aria-label={`Odstrániť fotografiu ${index + 1} z galérie`}
            onClick={()=>onChange(value.filter((_,i)=>i!==index))}>
            <Trash2 size={16} aria-hidden="true" /> Odstrániť
          </button>
        </div>
      </>}/>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
