"use client";

import { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import sk_SK from "@uppy/locales/lib/sk_SK";
import { uploadAdminImage, MAX_ADMIN_IMAGE_BYTES, type AdminImageFolder, type AdminImageUpload } from "@/lib/admin-image-upload";

/**
 * Uppy is UI/queue orchestration only. Every file passes through the existing
 * optimized and authenticated /api/admin/uploads contract, never another
 * backend or cloud provider. The owning editor still saves the gallery array.
 */
export function AdminUppyGalleryUpload({
  folder, remaining, disabled, onUploaded, onRejected, onBusyChange,
}: {
  folder: AdminImageFolder;
  remaining: number;
  disabled?: boolean;
  onUploaded: (files: AdminImageUpload[]) => void;
  onRejected?: (error: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uppy] = useState(() => new Uppy({
    id: "psipedia-gallery-upload",
    autoProceed: false,
    locale: sk_SK,
    restrictions: {
      maxFileSize: MAX_ADMIN_IMAGE_BYTES,
      allowedFileTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
      maxNumberOfFiles: Math.max(1, remaining),
    },
  }));

  // Uppy is created once; event callbacks always call the latest owning editor.
  const props = useRef({ folder, onUploaded, onRejected, onBusyChange });
  useEffect(() => {
    props.current = { folder, onUploaded, onRejected, onBusyChange };
  }, [folder, onUploaded, onRejected, onBusyChange]);

  useEffect(() => {
    uppy.setOptions({ restrictions: {
      maxFileSize: MAX_ADMIN_IMAGE_BYTES,
      allowedFileTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
      maxNumberOfFiles: Math.max(1, remaining),
    } });
  }, [uppy, remaining]);

  useEffect(() => {
    let active = true;
    const upload = async (fileIds: string[]) => {
      if (!active) return;
      const files = fileIds.map(id => uppy.getFile(id)).filter(file => file != null);
      if (!files.length) return;
      setBusy(true);
      props.current.onBusyChange(true);
      // A custom Uppy uploader must announce upload-start. Without this event
      // Dashboard keeps showing the file picker and appears to ignore "Nahrať".
      uppy.emit("upload-start", files);
      const uploaded: AdminImageUpload[] = [];
      const failures: string[] = [];
      try {
        // Bounded sequential uploads: the current Worker contract does not
        // offer tus or resumable uploads. Never claim resumability here.
        for (const id of fileIds) {
          const item = uppy.getFile(id);
          if (!item) continue;
          try {
            if (item.isRemote) throw new Error("Vzdialené súbory nie sú podporované.");
            const blob = item.data;
            const file = blob instanceof File ? blob : new File([blob], item.name, { type: item.type ?? "" });
            const result = await uploadAdminImage(file, props.current.folder);
            uploaded.push(result);
            // The existing fetch uploader does not expose intermediate progress.
            // Report completion only after the authenticated API has succeeded.
            uppy.emit("upload-progress", item, {
              uploader: uppy,
              bytesUploaded: file.size,
              bytesTotal: file.size,
            });
            uppy.emit("upload-success", item, { status: 200, body: result, uploadURL: result.imageUrl });
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error("Nahratie sa nepodarilo.");
            failures.push(item.name + ": " + error.message);
            uppy.emit("upload-error", item, error);
          }
        }
        if (active && uploaded.length) props.current.onUploaded(uploaded);
        if (active && failures.length) {
          props.current.onRejected?.(failures.join(" "));
          uppy.info("Niektoré fotografie sa nepodarilo nahrať. Skontroluj označené súbory.", "error", 8000);
        }
        // Make success unmistakable. The user must still save the parent form;
        // a failed/partial batch stays open with per-file errors for retry.
        if (active && uploaded.length === files.length && failures.length === 0) setOpen(false);
      } finally {
        if (active) {
          setBusy(false);
          props.current.onBusyChange(false);
        }
      }
    };
    const reject = (_file: unknown, error: Error) => props.current.onRejected?.(error.message);
    uppy.addUploader(upload);
    uppy.on("restriction-failed", reject);
    return () => {
      active = false;
      uppy.removeUploader(upload);
      uppy.off("restriction-failed", reject);
      // Uppy remains attached to this component until it is unmounted.
      props.current.onBusyChange(false);
    };
  }, [uppy]);

  const locked = Boolean(disabled || busy || remaining <= 0);
  return <>
    <button
      type="button"
      className="admin-upload-button"
      disabled={locked}
      onClick={() => { uppy.cancelAll(); setOpen(true); }}
    >
      {busy ? "Nahrávam fotografie…" : "Nahrať fotografie"}
    </button>
    <DashboardModal
      uppy={uppy}
      open={open}
      onRequestClose={() => { if (!busy) setOpen(false); }}
      closeModalOnClickOutside={!busy}
      proudlyDisplayPoweredByUppy={false}
      showProgressDetails
      note={`JPG, PNG, WebP alebo AVIF · max. 8 MB · voľné miesta: ${remaining}`}
    />
  </>;
}
