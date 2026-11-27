import type { HTMLAttributes } from "react";
import styles from "./admin-editor-sync-status.module.css";

export type EditorSyncState = "checking" | "synced" | "pending" | "review" | "disabled" | "unlinked" | "setup" | "unavailable";

/** Display only: a local save never implies a confirmed remote write. */
export function AdminEditorSyncStatus({state,label,...props}: HTMLAttributes<HTMLParagraphElement> & {state:EditorSyncState;label:string}) {
  return <p {...props} className={[styles.status, props.className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-atomic="true" data-admin-editor-sync={state}>
    <strong>Notion:</strong> {label}
  </p>;
}

/** A receipt reports only the last write attempt, never a live synchronization
 * guarantee or an acknowledgement for unrelated fields. */
export function AdminEditorSyncReceipt({status,scope}: {status?:string;scope:string}) {
  if (!status) return null;
  const result = status === "synced" ? {state:"synced" as const,label:"potvrdený prenos"}
    : status === "pending" ? {state:"pending" as const,label:"prenos zatiaľ nepotvrdený"}
    : status === "review" ? {state:"review" as const,label:"vyžaduje kontrolu konfliktu"}
    : status === "disabled" ? {state:"disabled" as const,label:"prenos vypnutý"}
    : status === "unlinked" || status === "not-linked" ? {state:"unlinked" as const,label:"záznam nie je prepojený"}
    : status === "setup" || status === "workcopy-inactive" ? {state:"setup" as const,label:"prenos nie je pripravený"}
    : status === "unchanged" ? null : {state:"unavailable" as const,label:"potvrdenie prenosu nie je dostupné"};
  return result ? <AdminEditorSyncStatus state={result.state} label={scope + " · " + result.label} /> : null;
}
