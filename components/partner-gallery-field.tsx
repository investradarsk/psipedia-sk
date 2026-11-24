"use client";

import { useId, useRef, useState } from "react";
import type { PartnerMediaIntent } from "@/lib/partner-media";

type Uploaded = { id: string; previewUrl: string; originalMime: string; sizeBytes: number; persisted?: boolean };
const LIMIT = 6;

export function PartnerGalleryField({
  initialUrls, initialUploads = [], onChangeUrls, onChangeMediaIds, disabled = false,
  mediaIntent = "PARTNER_PROFILE_UPDATE", directPublish = false,
}: {
  initialUrls: string[];
  initialUploads?: Uploaded[];
  onChangeUrls: (urls: string[]) => void;
  onChangeMediaIds: (ids: string[]) => void;
  disabled?: boolean;
  mediaIntent?: PartnerMediaIntent;
  directPublish?: boolean;
}) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploads, setUploads] = useState<Uploaded[]>(initialUploads);
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const total = urls.length + uploads.length;

  function changeUrls(next: string[]) {
    setUrls(next);
    onChangeUrls(next);
  }
  function changeUploads(next: Uploaded[]) {
    setUploads(next);
    onChangeMediaIds(next.map((item) => item.id));
  }
  function moveExisting(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= urls.length) return;
    const next = [...urls];
    [next[index], next[target]] = [next[target], next[index]];
    changeUrls(next);
  }
  function moveUpload(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= uploads.length) return;
    const next = [...uploads];
    [next[index], next[target]] = [next[target], next[index]];
    changeUploads(next);
  }
  function addUrl() {
    const url = newUrl.trim();
    if (!url || total >= LIMIT) return;
    if (!(url.startsWith("/media/") || url.startsWith("/images/") || /^https?:\/\//i.test(url))) {
      setMessage("Zadajte platný odkaz na fotografiu (https:// alebo /media/).");
      return;
    }
    if (urls.includes(url)) { setMessage("Táto fotografia už v galérii je."); return; }
    changeUrls([...urls, url]);
    setNewUrl("");
    setMessage("");
  }
  async function upload(files: FileList | null) {
    if (!files || !files.length || busy || disabled) return;
    const chosen = Array.from(files);
    if (total + chosen.length > LIMIT) {
      setMessage("Do galérie možno pridať najviac 6 fotografií.");
      return;
    }
    setBusy(true);
    let next = [...uploads];
    try {
      for (const file of chosen) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
          throw new Error("Fotografia musí byť JPG, PNG alebo WebP a mať najviac 8 MB.");
        }
        const res = await fetch("/api/partner/media", {
          method: "POST", headers: { "content-type": file.type, "x-media-intent": mediaIntent }, body: file,
        });
        const data = await res.json() as { error?: string; media?: Uploaded };
        if (!res.ok || !data.media) throw new Error(data.error || "Fotografiu sa nepodarilo nahrať.");
        next = [...next, data.media];
        changeUploads(next);
      }
      setMessage(directPublish?"Fotografie sú pripravené. Zverejnia sa pri uložení záznamu.":"Fotografie sú pripravené. Zverejnia sa až po schválení návrhu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nahrávanie galérie zlyhalo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  async function removeUpload(index: number) {
    if (busy || disabled) return;
    const item = uploads[index];
    setBusy(true);
    try {
      // Persisted media is ATTACHED to a draft. It is released by the draft's
      // atomic SAVE, not by the API for unsubmitted PENDING uploads.
      if(!item.persisted){
        const res = await fetch(`/api/partner/media/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (!res.ok && res.status!==409) throw new Error("Fotografiu sa nepodarilo odstrániť.");
      }
      changeUploads(uploads.filter((_, i) => i !== index));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Odstránenie zlyhalo.");
    } finally { setBusy(false); }
  }

  return (
    <section className="partner-media-field partner-field--wide" aria-label="Fotogaléria">
      <div className="partner-media-heading">
        <div><strong>Fotogaléria</strong>
          <small>Najviac 6 fotografií · JPG, PNG, WebP · max. 8 MB na fotografiu. {directPublish?"Zmeny sa uložia po potvrdení.":"Zmeny podliehajú schváleniu."}</small>
        </div>
      </div>
      <p>{total} / {LIMIT} fotografií. Poradie upravíte šípkami; nové fotografie budú nasledovať za existujúcimi.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "12px 0" }}>
        {urls.map((url, index) => (
          <div key={url} style={{ width: 156, minWidth: 0 }}>
            {/* URL is validated again by the server before publication. */}
            <img src={url} alt={`Fotografia galérie ${index + 1}`} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "var(--ps-radius-media)" }} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button type="button" onClick={() => moveExisting(index, -1)} disabled={disabled || busy || index === 0} aria-label="Posunúť fotografiu doľava">←</button>
              <button type="button" onClick={() => moveExisting(index, 1)} disabled={disabled || busy || index === urls.length - 1} aria-label="Posunúť fotografiu doprava">→</button>
              <button type="button" onClick={() => changeUrls(urls.filter((_, i) => i !== index))} disabled={disabled || busy}>Odstrániť</button>
            </div>
          </div>
        ))}
        {uploads.map((item, index) => (
          <div key={item.id} style={{ width: 156, minWidth: 0 }}>
            <img src={item.previewUrl} alt={`Nová fotografia ${index + 1}`} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "var(--ps-radius-media)" }} />
            <small>Nová fotografia</small>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button type="button" onClick={() => moveUpload(index, -1)} disabled={disabled || busy || index === 0} aria-label="Posunúť novú fotografiu doľava">←</button>
              <button type="button" onClick={() => moveUpload(index, 1)} disabled={disabled || busy || index === uploads.length - 1} aria-label="Posunúť novú fotografiu doprava">→</button>
              <button type="button" onClick={() => void removeUpload(index)} disabled={disabled || busy}>Odstrániť</button>
            </div>
          </div>
        ))}
      </div>
      <div className="partner-media-actions" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="button" htmlFor={inputId}>{busy ? "Nahrávam…" : "Pridať fotografie"}</label>
        <input id={inputId} ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
          className="partner-media-input" disabled={disabled || busy || total >= LIMIT}
          onChange={(event) => void upload(event.target.files)} />
        <input type="text" aria-label="URL fotografie" placeholder="https://… fotografia" value={newUrl}
          onChange={(event) => setNewUrl(event.target.value)} disabled={disabled || busy || total >= LIMIT} />
        <button type="button" className="button" onClick={addUrl} disabled={disabled || busy || total >= LIMIT || !newUrl.trim()}>Pridať URL</button>
      </div>
      {message ? <p className="partner-form-message" role="status">{message}</p> : null}
    </section>
  );
}
