import type { HTMLAttributes } from "react";
import styles from "./admin-editor-sync-status.module.css";

export type EditorSyncState = "checking" | "synced" | "pending" | "review" | "disabled" | "unlinked" | "setup" | "unavailable";

/** Display only: a local save never implies a confirmed remote write. */
export function AdminEditorSyncStatus({state,label,...props}: HTMLAttributes<HTMLParagraphElement> & {state:EditorSyncState;label:string}) {
  return <p {...props} className={[styles.status, props.className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-atomic="true" data-admin-editor-sync={state}>
    <strong>Notion:</strong> {label}
  </p>;
}
