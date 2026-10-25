"use client";

import { useId, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { AdminGalleryDropzone } from "@/components/admin-gallery-dropzone";
import { useForm } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { validateAdminPhotoGalleryUrl } from "@/lib/admin-photo-gallery-url";
import { uploadAdminImage, type AdminImageFolder } from "@/lib/admin-image-upload";
import styles from "./admin-photo-gallery.module.css";

function gallerySortableId(src: string, index: number): string {
  // Stable and unique even for legacy galleries with duplicate photo URLs.
  return index + ":" + src;
}

function SortableGalleryPhoto({ src, index, itemId, count, locked, onMove, onRemove }: {
  src: string; index: number; itemId: string; count: number; locked: boolean;
  onMove: (index: number, offset: number) => void;
  onRemove: (index: number) => void;
}) {
  const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging} =
    useSortable({ id: itemId, disabled: locked });
  return <li ref={setNodeRef} style={{
    transform: CSS.Transform.toString(transform), transition,
    ...(isDragging ? {zIndex: 1, position: "relative" as const, opacity: 0.65} : {}),
  }}>
    <img src={src} alt={`Fotografia ${index + 1}`} loading="lazy" />
    <div className={styles.controls}>
      <button type="button" ref={setActivatorNodeRef} disabled={locked}
        aria-label={`Presunúť fotografiu ${index + 1} potiahnutím alebo klávesnicou`}
        {...attributes} {...listeners}><GripVertical size={17} aria-hidden="true" /></button>
      <button type="button" disabled={locked || index === 0}
        aria-label={`Posunúť fotografiu ${index + 1} dopredu`}
        onClick={() => onMove(index, -1)}><ArrowUp size={17} aria-hidden="true" /></button>
      <button type="button" disabled={locked || index === count - 1}
        aria-label={`Posunúť fotografiu ${index + 1} dozadu`}
        onClick={() => onMove(index, 1)}><ArrowDown size={17} aria-hidden="true" /></button>
      <button type="button" disabled={locked}
        aria-label={`Odstrániť fotografiu ${index + 1} z galérie`}
        onClick={() => onRemove(index)}><Trash2 size={16} aria-hidden="true" /> Odstrániť</button>
    </div>
  </li>;
}

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
  // Remain inside the owning editor form; no nested form or save side effects.
  const { register, setValue, watch } = useForm<{ photoUrl: string }>({ defaultValues: { photoUrl: "" } });
  const url = watch("photoUrl");
  const locked = disabled || busy;

  function addUrl() {
    if (locked || pending.current) return;
    const candidate = validateAdminPhotoGalleryUrl(url);
    if (!candidate) { setError("Zadaj platnú HTTP/HTTPS alebo internú /media/ adresu fotografie."); return; }
    if (value.includes(candidate)) { setError("Táto fotografia už je v galérii."); return; }
    if (value.length >= limit) { setError(`Galéria môže obsahovať najviac ${limit} fotografií.`); return; }
    onChange([...value, candidate]); setValue("photoUrl", ""); setError(""); setMessage("Fotografia bola pridaná. Ulož zmeny profilu.");
  }

  async function upload(files: File[]) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  );
  const sortableIds = value.map(gallerySortableId);
  function onDragEnd(event: DragEndEvent) {
    if (locked || !event.over || event.active.id === event.over.id) return;
    const source = sortableIds.indexOf(String(event.active.id));
    const target = sortableIds.indexOf(String(event.over.id));
    if (source === -1 || target === -1) return;
    onChange(arrayMove(value, source, target));
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
    <AdminGalleryDropzone label="Nahrať fotografie" onFiles={upload} disabled={locked||value.length>=limit} busy={busy}
      onRejected={setError} />
    <div className="admin-field"><label htmlFor={`${id}-url`}>Pridať fotografiu z URL</label><input id={`${id}-url`} type="text" inputMode="url" {...register("photoUrl")} disabled={locked || value.length >= limit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="/media/… alebo https://…" /><button type="button" disabled={locked || !url.trim() || value.length >= limit} onClick={addUrl}><Plus size={16} aria-hidden="true" /> Pridať do galérie</button></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <ol className={styles.items}>{value.map((src,index) =>
          <SortableGalleryPhoto key={gallerySortableId(src,index)} itemId={gallerySortableId(src,index)}
            src={src} index={index} count={value.length} locked={locked}
            onMove={move} onRemove={imageIndex=>onChange(value.filter((_,i)=>i!==imageIndex))} />
        )}</ol>
      </SortableContext>
    </DndContext>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
